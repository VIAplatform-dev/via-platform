import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// Remove SYNTHETIC Collabs conversions. The estimated `collabs-<partnershipId>-order-<n>` rows the
// revenue sync fabricated when it first surfaced a partnership and backfilled its whole history
// (now prevented by baselining). Dry-run by default; ?apply=1 deletes. Scope to one store with
// ?store=<slug>. Admin-gated.

function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

const SYNTHETIC = "^collabs-[0-9]+-order-[0-9]+$";

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { searchParams } = new URL(request.url);
 const store = searchParams.get("store");
 if (!store) return NextResponse.json({ error: "Pass ?store=<slug> (e.g. scarz-vintage)." }, { status: 400 });
 const apply = searchParams.get("apply") === "1";
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return NextResponse.json({ error: "No DB" }, { status: 500 });
 const sql = neon(url);

 // The full Collabs picture for this store, so you can confirm the real orders exist before deleting.
 const allCollabs = await sql`SELECT order_id, order_total, timestamp FROM conversions WHERE store_slug = ${store} AND order_id LIKE 'collabs%' ORDER BY timestamp DESC LIMIT 60`.catch(() => []);
 const synthetic = await sql`SELECT order_id, order_total, timestamp FROM conversions WHERE store_slug = ${store} AND order_id ~ ${SYNTHETIC} ORDER BY order_id`.catch(() => []);

 if (!apply) {
 return NextResponse.json({
 dryRun: true, store,
 syntheticToDelete: synthetic,
 allCollabsForStore: allCollabs,
 note: "Re-run with &apply=1 to delete only the synthetic rows above. Check allCollabsForStore first: the real orders should remain.",
 });
 }

 const deleted = (await sql`DELETE FROM conversions WHERE store_slug = ${store} AND order_id ~ ${SYNTHETIC} RETURNING order_id`.catch(() => [])) as unknown[];
 return NextResponse.json({ ok: true, store, deleted: deleted.length });
}
