import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { isVisionConfigured, identifyCategory, confirmCategoryGroup } from "@/app/lib/data-layer/vision";
import { inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { normalizeCategory } from "@/app/lib/market-data-db";
import { setCategoryOverride, listCategoryOverrides, deleteCategoryOverride, type CategoryFamily } from "@/app/lib/category-overrides-db";

const FAMILIES: CategoryFamily[] = ["clothing", "bags", "shoes", "accessories", "home"];

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 if (request.headers.get("authorization") === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

function getDatabaseUrl(): string {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return url;
}

// Coarse normalizeCategory family → broad TYPE (vision-comparable) → display family.
// We only correct cross-TYPE errors (a bag filed under clothing, a wallet under
// jewelry): within-clothing nuance (jeans vs pants) isn't reliably readable from a
// photo and isn't actionable. The TYPE doubles as the override family (the
// displayCategory slugs are bags/shoes/accessories/clothing).
function coarseToFamily(coarse: string | null): CategoryFamily | null {
 if (!coarse) return null;
 if (coarse === "Bags") return "bags";
 if (coarse === "Shoes") return "shoes";
 if (coarse === "Accessories") return "accessories"; // jewelry folds in here
 if (coarse === "Home") return "home";
 return "clothing";
}

const MULTI_ITEM_RE = /\b(set|suit)\b/i;
const TYPE_PHRASE: Record<string, string> = {
 bags: "Bags & Handbags",
 shoes: "Shoes & Footwear",
 accessories: "Accessories (belts, scarves, hats, jewelry, sunglasses, gloves, ties, wallets)",
 clothing: "Clothing (tops, dresses, pants, skirts, jackets, sweaters, etc.)",
 home: "Home goods",
};

// GET: list current overrides (for the admin UI).
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const overrides = await listCategoryOverrides();
 return NextResponse.json({ overrides });
}

// PATCH { storeSlug, productId, family }. Manually set/correct a single override.
export async function PATCH(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const storeSlug = (body.storeSlug ?? "").toString().trim();
 const productId = parseInt(String(body.productId), 10);
 const family = String(body.family) as CategoryFamily;
 if (!storeSlug || !Number.isFinite(productId) || !FAMILIES.includes(family)) {
 return NextResponse.json({ error: "storeSlug, productId, and a valid family are required" }, { status: 400 });
 }
 await setCategoryOverride(storeSlug, productId, family, "manual", null);
 return NextResponse.json({ ok: true });
}

// DELETE ?store=&id= remove an override (revert to title inference).
export async function DELETE(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const store = request.nextUrl.searchParams.get("store");
 const id = parseInt(request.nextUrl.searchParams.get("id") ?? "", 10);
 if (!store || !Number.isFinite(id)) return NextResponse.json({ error: "store and id are required" }, { status: 400 });
 await deleteCategoryOverride(store, id);
 return NextResponse.json({ ok: true });
}

// POST /api/admin/category-sweep?limit=200&offset=0&store=sacrare
// Scans a batch of products, compares the storefront category (title inference)
// against an independent vision read, and, for cross-TYPE mismatches a stronger
// model confirms. Writes a category_override so the item filters/displays in the
// right family. Trigger in batches (bump offset until nextOffset is null). Optional
// ?store= restricts to one store; ?dryRun=1 reports without writing.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isVisionConfigured()) {
 return NextResponse.json({ ok: false, notConfigured: true, error: "ANTHROPIC_API_KEY not set: vision is off." }, { status: 503 });
 }

 const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "150", 10), 1), 400);
 const offset = Math.max(parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10), 0);
 const store = request.nextUrl.searchParams.get("store");
 const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
 // Strict (default): a stronger model must confirm the mismatch before flagging,
 // low false positives, but drops anything it's unsure about. strict=0 ("thorough")
 // trusts the stage-1 vision read and reports every cross-type disagreement, so you
 // see far more candidates to review. Use thorough + dry run to audit, then apply.
 const strict = request.nextUrl.searchParams.get("strict") !== "0";

 const sql = neon(getDatabaseUrl());
 const rows = (store
 ? await sql`SELECT id, title, store_slug, image FROM products WHERE image IS NOT NULL AND image != '' AND store_slug = ${store} ORDER BY id LIMIT ${limit} OFFSET ${offset}`
 : await sql`SELECT id, title, store_slug, image FROM products WHERE image IS NOT NULL AND image != '' ORDER BY id LIMIT ${limit} OFFSET ${offset}`
 ) as { id: number; title: string; store_slug: string; image: string }[];

 const candidates = rows
 .map((p) => {
 const storefrontCoarse = normalizeCategory(inferCategoryFromTitle(p.title));
 const storefrontFamily = coarseToFamily(storefrontCoarse);
 return { ...p, storefrontFamily };
 })
 .filter((p) => p.storefrontFamily && !MULTI_ITEM_RE.test(p.title));

 const corrections: Array<{ id: number; title: string; url: string; from: string; to: string }> = [];
 let checked = 0, skipped = 0, droppedByVerify = 0, written = 0;

 const CHUNK = 5;
 for (let i = 0; i < candidates.length; i += CHUNK) {
 const chunk = candidates.slice(i, i + CHUNK);
 await Promise.all(chunk.map(async (p) => {
 let visionRaw: string | null = null;
 try { visionRaw = await identifyCategory(p.image); } catch { skipped++; return; }
 const imageFamily = coarseToFamily(visionRaw ? normalizeCategory(visionRaw) : null);
 if (!imageFamily) { skipped++; return; }
 checked++;
 if (p.storefrontFamily === imageFamily) return; // agrees. Nothing to do

 // Stage 2 (strict only): a stronger model confirms the photo really ISN'T the
 // filed type. In thorough mode we trust the stage-1 read and skip this, so more
 // candidates surface for human review.
 if (strict) {
  let verdict: "match" | "mismatch" | null = null;
  try {
  verdict = await confirmCategoryGroup(p.image, TYPE_PHRASE[p.storefrontFamily as string] ?? (p.storefrontFamily as string));
  } catch { verdict = null; }
  if (verdict !== "mismatch") { droppedByVerify++; return; }
 }

 if (!dryRun) {
  await setCategoryOverride(p.store_slug, p.id, imageFamily, "ai", `was ${p.storefrontFamily}`);
  written++;
 }
 corrections.push({
  id: p.id, title: p.title, url: `/products/${p.store_slug}-${p.id}`,
  from: p.storefrontFamily as string, to: imageFamily,
 });
 }));
 }

 return NextResponse.json({
 ok: true,
 dryRun,
 scanned: rows.length,
 candidates: candidates.length,
 checked,
 skipped,
 droppedByVerify,
 corrected: corrections.length,
 written,
 nextOffset: rows.length === limit ? offset + limit : null,
 corrections: corrections.sort((a, b) => a.id - b.id),
 });
}
