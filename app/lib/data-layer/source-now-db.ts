import { neon } from "@neondatabase/serverless";
import { gateSegments, type RawSegment } from "./privacy";
import { PRIVACY, SOURCING } from "./config";
import { sourceNowScore, priceBenchmark, type Trend } from "./metrics";
import { scanCatalogBySegment, type SegmentType } from "./market-metrics-db";

// ── "Source Now" — what to buy right now, while the window's open ──────────────────────────────
// A pick is a segment (brand / category / era) where the market's own buyers show RISING or HIGH
// demand AND the shelves are thin (a supply gap) — the moment to source before every store piles in
// and the price climbs. Every input is aggregated across ≥5 stores (privacy floor) from thousands of
// first-party engagement events, so it's a market pattern, not one store's noise. Asking price is
// shown as CONTEXT (from the live catalog), never as a claim about what things sold for.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type SourcePick = {
 segmentType: string;
 segmentValue: string;
 score: number; // 0–100 sourcing-opportunity strength
 confidence: "high" | "medium"; // how many stores back the signal
 demandIndex: number;
 trend: Trend;
 supplyGap: number;
 storeCount: number;
 activeSupply: number;
 askP25: number | null; // typical ASKING range across the market (dollars) — context, not "sold for"
 askMedian: number | null;
 askP75: number | null;
 reason: string;
};

const money = (n: number | null) => (n == null ? null : `$${Math.round(n).toLocaleString()}`);

function buildReason(p: { trend: Trend; storeCount: number; activeSupply: number; askMedian: number | null; askP25: number | null; askP75: number | null }): string {
 const lead = p.trend === "rising" ? "Demand is climbing" : "Demand is high";
 const supply = `only ${p.storeCount} store${p.storeCount === 1 ? "" : "s"} carry it (${p.activeSupply} in stock market-wide) — under-supplied`;
 const price = p.askMedian != null
  ? ` Lists around ${money(p.askMedian)}${p.askP25 != null && p.askP75 != null ? ` (${money(p.askP25)}–${money(p.askP75)})` : ""}.`
  : "";
 return `${lead} and ${supply}.${price}`;
}

// Read the latest metric snapshot, keep only privacy-safe segments, and surface the ones that are a
// live sourcing opportunity — ranked by how strong the opportunity is.
export async function getSourceNow(windowKey: "7d" | "30d"): Promise<{ asOfDate: string | null; picks: SourcePick[]; empty?: boolean }> {
 const sql = db();
 let metricRows: Array<Record<string, unknown>>;
 try {
  metricRows = (await sql`
   SELECT segment_type, segment_value, demand_index, demand_trend, supply_gap_score,
    sell_through_pct, price_p25, price_median, price_p75, active_supply, store_count, txn_count,
    to_char(as_of_date, 'YYYY-MM-DD') AS as_of
   FROM market_metrics
   WHERE window_key = ${windowKey} AND as_of_date = (SELECT MAX(as_of_date) FROM market_metrics)
  `) as Array<Record<string, unknown>>;
 } catch {
  return { asOfDate: null, picks: [], empty: true }; // table not built yet — degrade, don't error
 }
 if (metricRows.length === 0) return { asOfDate: null, picks: [], empty: true };
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

 // Privacy gate FIRST — only ≥5-store segments survive, so every pick is a market pattern.
 const visible = gateSegments(raw, PRIVACY);

 // The sourcing window: demand is RISING (or already HIGH) AND the shelves are thin.
 const candidates = visible.filter(
  (s) =>
   (s.demandTrend === "rising" || s.demandIndex >= SOURCING.hotDemand) &&
   s.demandIndex >= SOURCING.warmDemand &&
   s.supplyGapScore >= SOURCING.underSupplied,
 );
 if (candidates.length === 0) return { asOfDate, picks: [] };

 // Asking prices from the live catalog (same brand/category/era enrichment as the demand side).
 const catalog = await scanCatalogBySegment().catch(() => null);

 const picks: SourcePick[] = candidates
  .map((s) => {
   const seg = catalog?.[s.segmentType as SegmentType]?.get(s.segmentValue);
   const bench = seg && seg.prices.length ? priceBenchmark(seg.prices) : { p25: null, median: null, p75: null };
   const trend = s.demandTrend as Trend;
   return {
    segmentType: s.segmentType,
    segmentValue: s.segmentValue,
    score: sourceNowScore(s.demandIndex, trend, s.supplyGapScore),
    confidence: (s.storeCount >= PRIVACY.minStores * 2 ? "high" : "medium") as "high" | "medium",
    demandIndex: s.demandIndex,
    trend,
    supplyGap: s.supplyGapScore,
    storeCount: s.storeCount,
    activeSupply: s.activeSupply,
    askP25: bench.p25,
    askMedian: bench.median,
    askP75: bench.p75,
    reason: buildReason({ trend, storeCount: s.storeCount, activeSupply: s.activeSupply, askMedian: bench.median, askP25: bench.p25, askP75: bench.p75 }),
   };
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, 12);

 return { asOfDate, picks };
}
