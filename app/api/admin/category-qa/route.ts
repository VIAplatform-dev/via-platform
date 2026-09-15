import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { isVisionConfigured, identifyCategory, confirmCategoryGroup } from "@/app/lib/data-layer/vision";
import { inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { normalizeCategory } from "@/app/lib/market-data-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function hashPassword(password: string): string {
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === hashPassword(adminPassword);
}

function getDatabaseUrl(): string {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return url;
}

// Fold a coarse normalizeCategory family into a broad TYPE. We only flag
// cross-TYPE disagreements (a bag filed under jewelry, a shoe filed under
// clothing). The errors that actually matter for browsing. Everything inside
// "clothing" (jeans vs pants, sweater vs top, skirt vs jacket) is left alone:
// jeans/pants stay separate categories, but the vision model can't reliably
// tell them apart from a photo, so those disagreements aren't actionable.
function coarseToType(coarse: string | null): string | null {
 if (!coarse) return null;
 if (coarse === "Bags") return "bags";
 if (coarse === "Shoes") return "shoes";
 if (coarse === "Accessories") return "accessories"; // jewelry folds in here
 return "clothing"; // dresses, tops, sweaters, coats, jeans, pants, skirts, shorts, jumpsuits
}

// Multi-item listings ("... Set", "... Suit") are genuinely more than one
// category: vision picks one piece, the title another. Don't flag them.
const MULTI_ITEM_RE = /\b(set|suit)\b/i;

// Human-readable phrase for the verification (Stage 2) prompt, per broad type.
const TYPE_PHRASE: Record<string, string> = {
 bags: "Bags & Handbags",
 shoes: "Shoes & Footwear",
 accessories: "Accessories (belts, scarves, hats, jewelry, sunglasses, gloves, ties)",
 clothing: "Clothing (tops, dresses, pants, skirts, jackets, sweaters, etc.)",
};

// GET /api/admin/category-qa?limit=200&offset=0&types=bags,accessories
// For a batch of products, compare the STOREFRONT category (inferCategoryFromTitle,
// what users see) against an INDEPENDENT vision read of the photo. Both are folded
// to a broad TYPE; only cross-TYPE mismatches are flagged. The optional `types`
// filter restricts the (paid) vision call to products whose storefront type is in
// the list: use `types=bags,accessories` to hunt bag/jewelry mislabels cheaply.
// YOU trigger it, in batches (bump offset until scanned hits 0).
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!isVisionConfigured()) {
 return NextResponse.json(
 { ok: false, notConfigured: true, error: "ANTHROPIC_API_KEY not set: vision is off." },
 { status: 503 },
 );
 }

 const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "200", 10), 1), 500);
 const offset = Math.max(parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10), 0);
 const typesParam = request.nextUrl.searchParams.get("types");
 const typeFilter = typesParam
 ? new Set(typesParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))
 : null;

 const sql = neon(getDatabaseUrl());
 const rows = (await sql`
 SELECT id, title, store_slug, image
 FROM products
 WHERE image IS NOT NULL AND image != ''
 ORDER BY id
 LIMIT ${limit} OFFSET ${offset}
 `) as { id: number; title: string; store_slug: string; image: string }[];

 // Cheap pass first (no vision): resolve each product's storefront type and decide
 // whether it's a vision candidate. This keeps vision spend to the targeted slice.
 const candidates = rows
 .map((p) => {
 const storefrontCoarse = normalizeCategory(inferCategoryFromTitle(p.title));
 const storefrontType = coarseToType(storefrontCoarse);
 return { ...p, storefrontCoarse, storefrontType };
 })
 .filter((p) => {
 if (!p.storefrontType) return false; // can't classify the title → skip
 if (MULTI_ITEM_RE.test(p.title)) return false; // multi-item set/suit → skip
 if (typeFilter && !typeFilter.has(p.storefrontType)) return false; // out of focus
 return true;
 });

 const mismatches: Array<{
 id: number;
 title: string;
 url: string;
 storefrontCategory: string;
 imageCategory: string;
 storefrontType: string;
 imageType: string;
 }> = [];
 let checked = 0;
 let skipped = 0;
 let droppedByVerify = 0;

 const CHUNK = 5;
 for (let i = 0; i < candidates.length; i += CHUNK) {
 const chunk = candidates.slice(i, i + CHUNK);
 await Promise.all(
 chunk.map(async (p) => {
 let visionRaw: string | null = null;
 try {
 visionRaw = await identifyCategory(p.image);
 } catch {
 skipped++;
 return;
 }
 const imageCoarse = visionRaw ? normalizeCategory(visionRaw) : null;
 const imageType = coarseToType(imageCoarse);
 if (!imageType) {
 skipped++;
 return;
 }
 checked++;
 // Stage 1 found a cross-TYPE disagreement. Don't report it yet. Stage 2
 // asks a stronger model to confirm the photo really ISN'T the filed type.
 if (p.storefrontType !== imageType) {
 let verdict: "match" | "mismatch" | null = null;
 try {
 const stype = p.storefrontType as string;
 verdict = await confirmCategoryGroup(p.image, TYPE_PHRASE[stype] ?? stype);
 } catch {
 verdict = null;
 }
 // Only flag when the strong model also says the item is NOT the filed
 // type. "match" (Stage-1 vision misread) and null (unsure) are dropped,
 // which is what keeps the false-positive rate low.
 if (verdict !== "mismatch") {
 droppedByVerify++;
 return;
 }
 mismatches.push({
 id: p.id,
 title: p.title,
 url: `/products/${p.store_slug}-${p.id}`,
 storefrontCategory: p.storefrontCoarse as string,
 imageCategory: imageCoarse as string,
 storefrontType: p.storefrontType as string,
 imageType,
 });
 }
 }),
 );
 }

 return NextResponse.json({
 ok: true,
 scanned: rows.length,
 candidates: candidates.length,
 checked,
 skipped,
 droppedByVerify,
 mismatchCount: mismatches.length,
 nextOffset: rows.length === limit ? offset + limit : null,
 mismatches: mismatches.sort((a, b) => a.id - b.id),
 });
}
