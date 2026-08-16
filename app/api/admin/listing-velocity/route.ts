import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 if (request.headers.get("authorization") === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

// Read-only listing velocity: how many items stores list per month (ALL categories), per store, so we
// can estimate "items listed / store / month" for the pricing model. created_at ≈ listing/sync date.
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const sql = neon(dbUrl);
 const now = Date.now();
 const days = (d: number) => new Date(now - d * 86_400_000).toISOString();

 const rows = (await sql`SELECT store_slug, created_at FROM products WHERE store_slug IS NOT NULL`) as Array<Record<string, unknown>>;

 const allStores = new Set<string>();
 const per90 = new Map<string, number>(); // listings in last 90d, by store
 let listed30 = 0, listed90 = 0, total = rows.length;
 for (const r of rows) {
  const store = String(r.store_slug || ""); if (!store) continue;
  allStores.add(store);
  const c = r.created_at ? new Date(String(r.created_at)).toISOString() : null;
  if (c && c >= days(90)) { listed90++; per90.set(store, (per90.get(store) || 0) + 1); }
  if (c && c >= days(30)) listed30++;
 }

 // Per-store listings/month (from the 90d window), for stores that listed anything.
 const perStorePerMonth = [...per90.values()].map((v) => v / 3).sort((a, b) => a - b);
 const activeListers = perStorePerMonth.length;
 const sum = perStorePerMonth.reduce((a, b) => a + b, 0);
 const pct = (p: number) => activeListers ? Math.round(perStorePerMonth[Math.min(activeListers - 1, Math.floor(activeListers * p))] * 10) / 10 : 0;

 // Distribution buckets (listings/store/month)
 const buckets = { "0-10": 0, "10-25": 0, "25-50": 0, "50-100": 0, "100+": 0 };
 for (const v of perStorePerMonth) {
  if (v < 10) buckets["0-10"]++; else if (v < 25) buckets["10-25"]++; else if (v < 50) buckets["25-50"]++; else if (v < 100) buckets["50-100"]++; else buckets["100+"]++;
 }

 return NextResponse.json({
  as_of: new Date(now).toISOString(),
  catalog: { totalActiveListings: total, totalStores: allStores.size },
  monthly: { listedLast30d: listed30, listedLast90d: listed90, platformListingsPerMonth: Math.round(listed90 / 3) },
  perStorePerMonth: {
   activeListingStores: activeListers,
   avg: activeListers ? Math.round((sum / activeListers) * 10) / 10 : 0,
   median: pct(0.5),
   p25: pct(0.25), p75: pct(0.75), p90: pct(0.9),
   max: activeListers ? Math.round(perStorePerMonth[activeListers - 1] * 10) / 10 : 0,
  },
  distribution: buckets,
  notes: "created_at may reflect Shopify sync time rather than the true first-listed date, so treat the monthly rate as approximate. 'Active listing stores' = stores that added ≥1 item in the last 90 days.",
 });
}
