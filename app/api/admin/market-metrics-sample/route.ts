import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { PRIVACY, DEMAND_WEIGHTS } from "@/app/lib/data-layer/config";
import { rawDemand } from "@/app/lib/data-layer/metrics";

export const dynamic = "force-dynamic";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}
function hashPassword(p: string): string {
 return crypto.createHash("sha256").update(p).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === hashPassword(adminPassword);
}

// GET /api/admin/market-metrics-sample?window=7d&store=to-us-vintage&type=brand
// Admin-only sanity view of the RAW computed metrics (ungated). Shows
// store_count / txn_count and whether each segment WOULD be hidden from sellers,
// so you can verify the numbers and the privacy gate before anyone sees them.
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const sp = request.nextUrl.searchParams;
 const windowKey = sp.get("window") === "30d" ? "30d" : "7d";
 const segType = sp.get("type"); // optional filter: brand|category|era
 const store = sp.get("store"); // optional: per-store "your store vs market" preview
 const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "20", 10) || 20, 1), 100);
 const sql = db();

 try {
 const rows = (await sql`
  SELECT segment_type, segment_value, demand_index, demand_trend, supply_gap_score,
   sell_through_pct, price_p25, price_median, price_p75, active_supply,
   store_count, txn_count, to_char(as_of_date,'YYYY-MM-DD') AS as_of
  FROM market_metrics
  WHERE window_key = ${windowKey}
   AND as_of_date = (SELECT MAX(as_of_date) FROM market_metrics)
   AND (${segType === null} OR segment_type = ${segType})
  ORDER BY demand_index DESC, supply_gap_score DESC
  LIMIT ${limit}
 `) as Array<Record<string, unknown>>;

 if (rows.length === 0) {
  return NextResponse.json({ windowKey, asOfDate: null, segments: [], note: "No market_metrics yet: run build-events then build-market-metrics." });
 }

 const segments = rows.map((r) => {
  const storeCount = Number(r.store_count);
  const txnCount = Number(r.txn_count);
  const hiddenFromSellers = storeCount < PRIVACY.minStores;
  const priceSuppressed = txnCount < PRIVACY.minTransactions;
  return {
  segment: `${r.segment_type}: ${r.segment_value}`,
  demandIndex: Number(r.demand_index),
  trend: r.demand_trend,
  supplyGap: Number(r.supply_gap_score),
  priceBand: r.price_median == null ? null : `$${Math.round(Number(r.price_p25))}–$${Math.round(Number(r.price_median))}–$${Math.round(Number(r.price_p75))}`,
  sellThroughPct: r.sell_through_pct == null ? null : Number(r.sell_through_pct),
  activeSupply: Number(r.active_supply),
  storeCount,
  txnCount,
  hiddenFromSellers,
  priceSuppressed,
  };
 });

 let storePreview: unknown = undefined;
 if (store) {
  const curStart = new Date(Date.now() - (windowKey === "30d" ? 30 : 7) * 86_400_000).toISOString();
  const mine = (await sql`
  SELECT brand,
   COUNT(*) FILTER (WHERE event_type='view')::int AS views,
   COUNT(*) FILTER (WHERE event_type='favorite')::int AS saves,
   COUNT(*) FILTER (WHERE event_type='click')::int AS clicks,
   COALESCE(SUM(qty) FILTER (WHERE event_type='order_item'),0)::int AS orders
  FROM events WHERE store_slug = ${store} AND brand IS NOT NULL AND brand <> '' AND ts >= ${curStart}
  GROUP BY brand ORDER BY orders DESC, views DESC LIMIT 15
  `) as Array<{ brand: string; views: number; saves: number; clicks: number; orders: number }>;
  const market = new Map(rows.filter((r) => r.segment_type === "brand").map((r) => [r.segment_value as string, r]));
  storePreview = {
  store,
  brands: mine.map((m) => {
   const mk = market.get(m.brand);
   return {
   brand: m.brand,
   yourViews: m.views, yourSaves: m.saves, yourOrders: m.orders,
   yourDemand: rawDemand({ views: m.views, saves: m.saves, clicks: m.clicks, orders: m.orders }, DEMAND_WEIGHTS),
   marketDemandIndex: mk ? Number(mk.demand_index) : null,
   marketStoreCount: mk ? Number(mk.store_count) : null,
   };
  }),
  };
 }

 return NextResponse.json({
  windowKey,
  asOfDate: rows[0].as_of,
  privacyFloor: PRIVACY,
  segments,
  storePreview,
 });
 } catch (err) {
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
