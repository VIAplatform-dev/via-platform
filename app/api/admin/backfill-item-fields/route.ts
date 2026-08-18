import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { inferItemFields } from "@/app/lib/infer-item-fields";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const tok = request.cookies.get("via_admin_token")?.value;
 return !!tok && tok === crypto.createHash("sha256").update(pw).digest("hex");
}

// POST [?store=slug] — one-time backfill: sort the title + description of already-imported items into the
// structured brand / era / condition / category / material fields (for pieces transferred in before the
// import started inferring them). Only fills BLANK fields — never overwrites what's set. Idempotent.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const sql = neon(dbUrl);
 const store = new URL(request.url).searchParams.get("store")?.trim() || null;

 try {
 // Items missing at least one structured field (and worth inferring — has a title).
 const rows = (store
 ? await sql`
   SELECT i.id::text AS id, i.title, i.description, i.brand, i.era, i.material, i.condition, i.category
   FROM items i JOIN sellers s ON s.id = i.seller_id
   WHERE s.slug = ${store} AND i.status <> 'removed'
    AND (NULLIF(i.brand,'') IS NULL OR NULLIF(i.era,'') IS NULL OR NULLIF(i.condition,'') IS NULL OR NULLIF(i.category,'') IS NULL OR NULLIF(i.material,'') IS NULL)`
 : await sql`
   SELECT id::text AS id, title, description, brand, era, material, condition, category
   FROM items
   WHERE status <> 'removed'
    AND (NULLIF(brand,'') IS NULL OR NULLIF(era,'') IS NULL OR NULLIF(condition,'') IS NULL OR NULLIF(category,'') IS NULL OR NULLIF(material,'') IS NULL)`
 ) as Array<{ id: string; title: string; description: string | null; brand: string | null; era: string | null; material: string | null; condition: string | null; category: string | null }>;

 let updated = 0;
 const filled = { brand: 0, era: 0, condition: 0, category: 0, material: 0 };
 for (const r of rows) {
 const inf = inferItemFields(r.title, r.description, { brand: r.brand, era: r.era, material: r.material, condition: r.condition, category: r.category });
 // Only write a field that was blank before AND we now have a value for.
 const blank = (v: string | null) => !v || !v.trim();
 const setBrand = blank(r.brand) && inf.brand ? inf.brand : r.brand;
 const setEra = blank(r.era) && inf.era ? inf.era : r.era;
 const setCond = blank(r.condition) && inf.condition ? inf.condition : r.condition;
 const setCat = blank(r.category) && inf.category ? inf.category : r.category;
 const setMat = blank(r.material) && inf.material ? inf.material : r.material;
 const changed = setBrand !== r.brand || setEra !== r.era || setCond !== r.condition || setCat !== r.category || setMat !== r.material;
 if (!changed) continue;
 if (setBrand !== r.brand) filled.brand++;
 if (setEra !== r.era) filled.era++;
 if (setCond !== r.condition) filled.condition++;
 if (setCat !== r.category) filled.category++;
 if (setMat !== r.material) filled.material++;
 await sql`UPDATE items SET brand=${setBrand}, era=${setEra}, condition=${setCond}, category=${setCat}, material=${setMat}, updated_at=NOW() WHERE id::text = ${r.id}`;
 updated++;
 }
 return NextResponse.json({ ok: true, store: store || "(all)", scanned: rows.length, updated, filled });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Backfill failed" }, { status: 500 });
 }
}
