import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { extractMeasurements } from "@/app/lib/measurements";

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

// POST [?store=slug] — one-time backfill: pull flat measurements out of the DESCRIPTION into the
// structured `measurements` field, for items imported before the extractor existed. Idempotent
// (skips items that already have measurements, and only writes when it finds some). Optional ?store=.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const sql = neon(dbUrl);
 const store = new URL(request.url).searchParams.get("store")?.trim() || null;

 try {
 await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS measurements text`.catch(() => {});
 const rows = (store
 ? await sql`
   SELECT i.id::text AS id, i.description FROM items i JOIN sellers s ON s.id = i.seller_id
   WHERE s.slug = ${store} AND (i.measurements IS NULL OR i.measurements = '') AND i.description IS NOT NULL AND i.description <> ''`
 : await sql`
   SELECT id::text AS id, description FROM items
   WHERE (measurements IS NULL OR measurements = '') AND description IS NOT NULL AND description <> ''`
 ) as { id: string; description: string }[];

 let filled = 0;
 for (const r of rows) {
 const m = extractMeasurements(r.description);
 if (m) { await sql`UPDATE items SET measurements = ${m}, updated_at = NOW() WHERE id::text = ${r.id}`; filled++; }
 }
 return NextResponse.json({ ok: true, store: store || "(all)", scanned: rows.length, filled });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Backfill failed" }, { status: 500 });
 }
}
