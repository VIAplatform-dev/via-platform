import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { cleanDescription } from "@/app/lib/clean-description";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (adminToken && adminToken === crypto.createHash("sha256").update(adminPassword).digest("hex")) return true;
 return false;
}

// POST [?store=slug] — one-time backfill: clean HTML out of item descriptions that were imported
// before cleanDescription ran at import time. Turns raw "<p>…</p><ul><li>…</li></ul>" into the same
// tidy plain text new imports now get. Idempotent (only writes rows that actually change). Optional
// ?store= limits it to one store; omit to sweep every store.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const sql = neon(dbUrl);

 const store = new URL(request.url).searchParams.get("store")?.trim() || null;

 try {
 // Candidates: descriptions that still carry markup or HTML entities.
 const rows = (store
 ? await sql`
   SELECT i.id::text AS id, i.description FROM items i
   JOIN sellers s ON s.id = i.seller_id
   WHERE s.slug = ${store} AND i.description IS NOT NULL AND (i.description LIKE '%<%' OR i.description LIKE '%&lt;%' OR i.description LIKE '%&amp;%')`
 : await sql`
   SELECT id::text AS id, description FROM items
   WHERE description IS NOT NULL AND (description LIKE '%<%' OR description LIKE '%&lt;%' OR description LIKE '%&amp;%')`
 ) as { id: string; description: string }[];

 let cleaned = 0;
 for (const r of rows) {
 const next = cleanDescription(r.description);
 if (next !== null && next !== r.description) {
  await sql`UPDATE items SET description = ${next}, updated_at = NOW() WHERE id::text = ${r.id}`;
  cleaned++;
 }
 }
 return NextResponse.json({ ok: true, store: store || "(all)", scanned: rows.length, cleaned });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Backfill failed" }, { status: 500 });
 }
}
