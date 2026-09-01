import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { gateSegments, type RawSegment } from "@/app/lib/data-layer/privacy";
import { PRIVACY, DEMAND_WEIGHTS } from "@/app/lib/data-layer/config";
import { rawDemand } from "@/app/lib/data-layer/metrics";
import { askingPriceLookup } from "@/app/lib/data-layer/asking-price";
import { resolveStoreSlug } from "@/app/lib/storeAuth";

export const dynamic = "force-dynamic";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

// GET /api/store/market-insights?window=7d — seller-facing market signal.
// EVERY market figure passes through gateSegments first, so a seller only ever
// sees aggregated, anonymized, ≥5-store data — never another store's numbers.
export async function GET(request: NextRequest) {
 const storeSlug = await resolveStoreSlug(request);
 if (!storeSlug) return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });

 // No plan gate. What to source is the answer to the question a vintage seller actually asks —
 // what should I buy next — and it is the one thing here she cannot work out from her own shop.
 // Holding it behind a tier meant the sellers with the least data got the least help, and the
 // home page led with a padlock. Every figure below is still aggregated to >=5 stores by
 // gateSegments, so opening it up exposes nobody's numbers.

 const windowKey = request.nextUrl.searchParams.get("window") === "30d" ? "30d" : "7d";
 const windowDays = windowKey === "30d" ? 30 : 7;
 const sql = db();

 try {
 const metricRows = (await sql`
  SELECT segment_type, segment_value, demand_index, demand_trend, supply_gap_score,
   sell_through_pct, price_p25, price_median, price_p75, active_supply, store_count, txn_count,
   to_char(as_of_date, 'YYYY-MM-DD') AS as_of
  FROM market_metrics
  WHERE window_key = ${windowKey} AND as_of_date = (SELECT MAX(as_of_date) FROM market_metrics)
 `) as Array<Record<string, unknown>>;

 if (metricRows.length === 0) {
  return NextResponse.json({ windowKey, asOfDate: null, trending: [], priceBenchmarks: [], yourStoreVsMarket: [], privacyFloor: PRIVACY, empty: true });
 }
 const asOfDate = metricRows[0].as_of as string;

 const raw: RawSegment[] = metricRows.map((r) => ({
  segmentType: r.segment_type as string,
  segmentValue: r.segment_value as string,
  demandIndex: Number(r.demand_index),
  demandTrend: r.demand_trend as string,
  supplyGapScore: Number(r.supply_gap_score),
  sellThroughPct: r.sell_through_pct == null ? null : Number(r.sell_through_pct),
  priceP25: r.price_p25 == null ? null : Number(r.price_p25),
  priceMedian: r.price_median == null ? null : Number(r.price_median),
  priceP75: r.price_p75 == null ? null : Number(r.price_p75),
  activeSupply: Number(r.active_supply),
  storeCount: Number(r.store_count),
  txnCount: Number(r.txn_count),
 }));

 // Privacy gate FIRST — nothing downstream ever sees a sub-threshold segment.
 const gated = gateSegments(raw, PRIVACY);

 // Fill price with the ASKING benchmark from the live catalog (large sample) — realized sale prices
 // are still too thin to show. Asking prices are public, so no extra gate beyond segment visibility.
 const ask = await askingPriceLookup();
 const visible = gated.map((s) => {
  const a = ask(s.segmentType, s.segmentValue);
  return { ...s, priceP25: a.p25, priceMedian: a.median, priceP75: a.p75, hasPriceData: a.median != null };
 });

 // 1. Trending — high demand AND low supply (supply gap), brands + categories.
 const trending = visible
  .filter((s) => s.segmentType === "brand" || s.segmentType === "category")
  .sort((a, b) => b.supplyGapScore - a.supplyGapScore || b.demandIndex - a.demandIndex)
  .slice(0, 12);

 // 2. Price-benchmark lookup — all visible segments (UI filters by search).
 const priceBenchmarks = [...visible].sort((a, b) => b.demandIndex - a.demandIndex);

 // 3. Your store vs market — the seller's OWN brands (their data) next to the
 //    aggregated market index. Market index is null when it can't be shown safely.
 const curStart = new Date(Date.now() - windowDays * 86_400_000).toISOString();
 const mineRows = (await sql`
  SELECT brand,
   COUNT(*) FILTER (WHERE event_type='view')::int AS views,
   COUNT(*) FILTER (WHERE event_type='favorite')::int AS saves,
   COUNT(*) FILTER (WHERE event_type='click')::int AS clicks,
   COALESCE(SUM(qty) FILTER (WHERE event_type='order_item'),0)::int AS orders
  FROM events
  WHERE store_slug = ${storeSlug} AND brand IS NOT NULL AND brand <> '' AND ts >= ${curStart}
  GROUP BY brand ORDER BY orders DESC, views DESC LIMIT 15
 `) as Array<{ brand: string; views: number; saves: number; clicks: number; orders: number }>;
 const brandMarket = new Map(visible.filter((s) => s.segmentType === "brand").map((s) => [s.segmentValue, s]));
 const yourStoreVsMarket = mineRows.map((r) => {
  const m = brandMarket.get(r.brand);
  return {
  brand: r.brand,
  yourViews: r.views, yourSaves: r.saves, yourOrders: r.orders,
  yourDemand: rawDemand({ views: r.views, saves: r.saves, clicks: r.clicks, orders: r.orders }, DEMAND_WEIGHTS),
  marketDemandIndex: m?.demandIndex ?? null,
  marketTrend: m?.demandTrend ?? null,
  };
 });

 return NextResponse.json({ windowKey, asOfDate, trending, priceBenchmarks, yourStoreVsMarket, privacyFloor: PRIVACY });
 } catch (err) {
 console.error("[store/market-insights] error:", err);
 // Table not built yet, etc. — degrade to empty rather than error the dashboard.
 return NextResponse.json({ windowKey, asOfDate: null, trending: [], priceBenchmarks: [], yourStoreVsMarket: [], privacyFloor: PRIVACY, empty: true });
 }
}
