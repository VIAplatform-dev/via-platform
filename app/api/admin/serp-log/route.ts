import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

// Read-only SerpApi call log — OUR ground truth. Every serp() call runs recordSerp() into the
// api_costs table, so this shows exactly when we last actually hit SerpApi and how often, INDEPENDENT
// of SerpApi's own dashboard. Also reports whether the fetcher is enabled + a SAFE fingerprint (hash,
// never the key) of the SERPAPI_API_KEY in THIS environment — run it locally and on prod and compare
// the fingerprints: if they differ, local and prod use different SerpApi accounts (which explains a
// dashboard that looks idle while the other account is doing the pulls).
//   /api/admin/serp-log
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

function db() { const url = process.env.DATABASE_URL || process.env.POSTGRES_URL; if (!url) throw new Error("no db"); return neon(url); }

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const key = process.env.SERPAPI_API_KEY || "";
 try {
  const sql = db();
  const [summary, byDay, recent] = await Promise.all([
   sql`SELECT COUNT(*)::int AS total_calls, MAX(created_at) AS last_call, MIN(created_at) AS first_call FROM api_costs WHERE provider = 'serpapi'`,
   sql`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, operation, COUNT(*)::int AS calls FROM api_costs WHERE provider = 'serpapi' AND created_at >= NOW() - INTERVAL '14 days' GROUP BY day, operation ORDER BY day DESC, operation`,
   sql`SELECT created_at, operation, item_id, store_slug FROM api_costs WHERE provider = 'serpapi' ORDER BY created_at DESC LIMIT 25`,
  ]);
  const s = summary[0] as Record<string, unknown>;
  return NextResponse.json({
   env: {
    serpapiEnabled: process.env.SERPAPI_ENABLED === "true",
    serpapiKeySet: Boolean(key),
    // A hash, NOT the key — same key → same fingerprint, so you can compare local vs prod safely.
    serpapiKeyFingerprint: key ? crypto.createHash("sha256").update(key).digest("hex").slice(0, 12) : null,
   },
   totalCalls: s?.total_calls ?? 0,
   lastCall: s?.last_call ?? null,
   firstCall: s?.first_call ?? null,
   last14Days: byDay,
   recentCalls: recent,
  });
 } catch (e) {
  return NextResponse.json({ error: String(e) }, { status: 500 });
 }
}
