import { neon } from "@neondatabase/serverless";
import { getAllProducts } from "../db";
import { resolveBrand } from "./brands";
import { WHOLE_WORD_ALIASES } from "../brandData";
import { loadBrandRef } from "./brands-db";
import { inferCategoryFromTitle } from "../loadStoreProducts";
import { loadEraBuckets } from "./events-db";
import { inferEra } from "./enrich";
import {
 DEMAND_WEIGHTS,
 TREND_FLAT_BAND,
 METRIC_WINDOWS,
 type MetricWindow,
} from "./config";
import {
 rawDemand,
 percentileRanks,
 classifyTrend,
 priceBenchmark,
 sellThroughPct,
 supplyGapScore,
} from "./metrics";

// ───────────────────────────────────────────────────────────────────────────
// Data Layer — the metric job (Task 2).
//
// Reads the unified `events` log (+ current product supply), computes the
// sellable signals per brand / category / era for each window, and writes them
// to `market_metrics` (one dated row per segment × window, so history accrues).
// All math is the tested pure module in metrics.ts; this file is the I/O around it.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type SegmentType = "brand" | "category" | "era";

export async function ensureMarketMetricsTable(): Promise<void> {
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS market_metrics (
  as_of_date DATE NOT NULL,
  segment_type TEXT NOT NULL,
  segment_value TEXT NOT NULL,
  window_key TEXT NOT NULL,
  demand_index INT,
  demand_trend TEXT,
  raw_demand NUMERIC,
  views INT, saves INT, clicks INT, orders INT,
  sell_through_pct NUMERIC,
  median_days_to_sale NUMERIC,
  price_p25 NUMERIC, price_median NUMERIC, price_p75 NUMERIC,
  active_supply INT,
  supply_gap_score INT,
  store_count INT,
  txn_count INT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (as_of_date, segment_type, segment_value, window_key)
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_mm_segment ON market_metrics(segment_type, window_key, as_of_date)`;
}

type AggRow = {
 seg_type: SegmentType;
 seg: string;
 views_cur: number; saves_cur: number; clicks_cur: number; orders_cur: number;
 views_prior: number; saves_prior: number; clicks_prior: number; orders_prior: number;
 stores_cur: number; txn_cur: number;
 prices_cur: number[] | null;
};

// One round trip per window: all three segment dimensions via UNION ALL, each
// carrying current-window counts, prior-window counts, distinct stores, txn
// count, and the realized-price array.
async function aggregate(curStart: string, priorStart: string): Promise<AggRow[]> {
 const sql = db();
 const rows = (await sql`
 WITH agg AS (
  SELECT 'brand'::text AS seg_type, brand AS seg, event_type, ts, qty, store_slug, sale_price FROM events WHERE brand IS NOT NULL AND brand <> ''
  UNION ALL
  SELECT 'category'::text, category, event_type, ts, qty, store_slug, sale_price FROM events WHERE category IS NOT NULL AND category <> ''
  UNION ALL
  SELECT 'era'::text, era, event_type, ts, qty, store_slug, sale_price FROM events WHERE era IS NOT NULL AND era <> ''
 )
 SELECT seg_type, seg,
  COUNT(*) FILTER (WHERE event_type='view' AND ts >= ${curStart})::int AS views_cur,
  COUNT(*) FILTER (WHERE event_type='favorite' AND ts >= ${curStart})::int AS saves_cur,
  COUNT(*) FILTER (WHERE event_type='click' AND ts >= ${curStart})::int AS clicks_cur,
  COALESCE(SUM(qty) FILTER (WHERE event_type='order_item' AND ts >= ${curStart}),0)::int AS orders_cur,
  COUNT(*) FILTER (WHERE event_type='view' AND ts >= ${priorStart} AND ts < ${curStart})::int AS views_prior,
  COUNT(*) FILTER (WHERE event_type='favorite' AND ts >= ${priorStart} AND ts < ${curStart})::int AS saves_prior,
  COUNT(*) FILTER (WHERE event_type='click' AND ts >= ${priorStart} AND ts < ${curStart})::int AS clicks_prior,
  COALESCE(SUM(qty) FILTER (WHERE event_type='order_item' AND ts >= ${priorStart} AND ts < ${curStart}),0)::int AS orders_prior,
  COUNT(DISTINCT store_slug) FILTER (WHERE ts >= ${curStart})::int AS stores_cur,
  COUNT(*) FILTER (WHERE event_type='order_item' AND ts >= ${curStart})::int AS txn_cur,
  array_agg(sale_price) FILTER (WHERE event_type='order_item' AND ts >= ${curStart} AND sale_price IS NOT NULL) AS prices_cur
 FROM agg
 WHERE ts >= ${priorStart}
 GROUP BY seg_type, seg
 `) as AggRow[];
 return rows;
}

export type SegSupply = { count: number; prices: number[]; stores: Set<string> };

// One catalog scan → per brand / category / era: in-stock COUNT, the ASKING-price list (dollars),
// and the SET of stores that carry it. Shared by the metric job (which needs counts) and Source Now
// (which needs asking prices + store spread), so both read the SAME brand/category/era enrichment
// and reconcile exactly. Era is enriched on the fly, since products carry no era column.
export async function scanCatalogBySegment(): Promise<Record<SegmentType, Map<string, SegSupply>>> {
 const buckets = await loadEraBuckets();
 const brandRef = await loadBrandRef();
 const products = await getAllProducts().catch(() => []);
 const out: Record<SegmentType, Map<string, SegSupply>> = { brand: new Map(), category: new Map(), era: new Map() };
 const bump = (m: Map<string, SegSupply>, k: string | null, price: number, store: string | null) => {
 if (!k) return;
 const e = m.get(k) ?? { count: 0, prices: [], stores: new Set<string>() };
 e.count += 1;
 if (price > 0) e.prices.push(price);
 if (store) e.stores.add(store);
 m.set(k, e);
 };
 for (const p of products) {
 const price = Number(p.price) || 0;
 const store = p.store_slug ?? null;
 // Resolve brand through the SAME canonical alias reference the demand side (events.brand)
 // uses, so supply and demand reconcile when joined by brand for sell-through / supply-gap.
 bump(out.brand, resolveBrand(p.title, brandRef, WHOLE_WORD_ALIASES), price, store);
 bump(out.category, inferCategoryFromTitle(p.title) as string, price, store);
 bump(out.era, inferEra(`${p.title} ${p.description ?? ""}`, buckets), price, store);
 }
 return out;
}

// Just the in-stock counts per segment (what the metric job needs for supply / sell-through).
async function supplyTallies(): Promise<Record<SegmentType, Map<string, number>>> {
 const scan = await scanCatalogBySegment();
 const out: Record<SegmentType, Map<string, number>> = { brand: new Map(), category: new Map(), era: new Map() };
 for (const t of ["brand", "category", "era"] as SegmentType[]) for (const [k, v] of scan[t]) out[t].set(k, v.count);
 return out;
}

type MetricRow = {
 segmentType: SegmentType; segmentValue: string; windowKey: MetricWindow;
 demandIndex: number; demandTrend: string; rawDemand: number;
 views: number; saves: number; clicks: number; orders: number;
 sellThroughPct: number | null; medianDaysToSale: number | null;
 priceP25: number | null; priceMedian: number | null; priceP75: number | null;
 activeSupply: number; supplyGapScore: number; storeCount: number; txnCount: number;
};

export type BuildMetricsResult = { asOfDate: string; windows: Record<string, number> };

export async function computeMarketMetrics(opts: { asOf?: string } = {}): Promise<BuildMetricsResult> {
 await ensureMarketMetricsTable();
 const supply = await supplyTallies();
 const now = Date.now();
 const asOf = opts.asOf ?? new Date(now).toISOString().slice(0, 10);

 const allRows: MetricRow[] = [];

 for (const win of METRIC_WINDOWS) {
 const curStart = new Date(now - win.days * 86_400_000).toISOString();
 const priorStart = new Date(now - 2 * win.days * 86_400_000).toISOString();
 const agg = await aggregate(curStart, priorStart);

 // Group rows by segment type so percentile ranks are computed WITHIN a type.
 const byType: Record<SegmentType, AggRow[]> = { brand: [], category: [], era: [] };
 for (const r of agg) byType[r.seg_type]?.push(r);

 for (const segType of ["brand", "category", "era"] as SegmentType[]) {
  const rows = byType[segType];
  if (rows.length === 0) continue;

  const demandCur = rows.map((r) => rawDemand({ views: r.views_cur, saves: r.saves_cur, clicks: r.clicks_cur, orders: r.orders_cur }, DEMAND_WEIGHTS));
  const demandIdx = percentileRanks(demandCur);
  const supplies = rows.map((r) => supply[segType].get(r.seg) ?? 0);
  const supplyPct = percentileRanks(supplies);

  rows.forEach((r, i) => {
  const priorDemand = rawDemand({ views: r.views_prior, saves: r.saves_prior, clicks: r.clicks_prior, orders: r.orders_prior }, DEMAND_WEIGHTS);
  const prices = r.prices_cur ?? [];
  const bench = priceBenchmark(prices.map(Number));
  allRows.push({
   segmentType: segType,
   segmentValue: r.seg,
   windowKey: win.key,
   demandIndex: demandIdx[i],
   demandTrend: classifyTrend(demandCur[i], priorDemand, TREND_FLAT_BAND),
   rawDemand: demandCur[i],
   views: r.views_cur, saves: r.saves_cur, clicks: r.clicks_cur, orders: r.orders_cur,
   sellThroughPct: sellThroughPct(r.orders_cur, supplies[i]),
   medianDaysToSale: null, // no per-item listing date yet — null, never faked (see METRICS.md)
   priceP25: bench.p25, priceMedian: bench.median, priceP75: bench.p75,
   activeSupply: supplies[i],
   supplyGapScore: supplyGapScore(demandIdx[i], supplyPct[i]),
   storeCount: r.stores_cur,
   txnCount: r.txn_cur,
  });
  });
 }
 }

 // Upsert today's rows (no DELETE) so the table is never in a torn/empty state during a
 // rebuild, and two overlapping runs can't dup-key-fail — see insertMetrics' ON CONFLICT.
 const CHUNK = 500;
 for (let i = 0; i < allRows.length; i += CHUNK) await insertMetrics(asOf, allRows.slice(i, i + CHUNK));

 const windows: Record<string, number> = {};
 for (const r of allRows) windows[r.windowKey] = (windows[r.windowKey] ?? 0) + 1;
 return { asOfDate: asOf, windows };
}

async function insertMetrics(asOf: string, rows: MetricRow[]): Promise<void> {
 if (rows.length === 0) return;
 const sql = db();
 const col = <T>(f: (r: MetricRow) => T) => rows.map(f);
 await sql`
 INSERT INTO market_metrics (
  as_of_date, segment_type, segment_value, window_key, demand_index, demand_trend, raw_demand,
  views, saves, clicks, orders, sell_through_pct, median_days_to_sale,
  price_p25, price_median, price_p75, active_supply, supply_gap_score, store_count, txn_count
 )
 SELECT ${asOf}::date, * FROM unnest(
  ${col((r) => r.segmentType)}::text[], ${col((r) => r.segmentValue)}::text[], ${col((r) => r.windowKey)}::text[],
  ${col((r) => r.demandIndex)}::int[], ${col((r) => r.demandTrend)}::text[], ${col((r) => r.rawDemand)}::numeric[],
  ${col((r) => r.views)}::int[], ${col((r) => r.saves)}::int[], ${col((r) => r.clicks)}::int[], ${col((r) => r.orders)}::int[],
  ${col((r) => r.sellThroughPct)}::numeric[], ${col((r) => r.medianDaysToSale)}::numeric[],
  ${col((r) => r.priceP25)}::numeric[], ${col((r) => r.priceMedian)}::numeric[], ${col((r) => r.priceP75)}::numeric[],
  ${col((r) => r.activeSupply)}::int[], ${col((r) => r.supplyGapScore)}::int[], ${col((r) => r.storeCount)}::int[], ${col((r) => r.txnCount)}::int[]
 )
 ON CONFLICT (as_of_date, segment_type, segment_value, window_key) DO UPDATE SET
  demand_index = EXCLUDED.demand_index, demand_trend = EXCLUDED.demand_trend, raw_demand = EXCLUDED.raw_demand,
  views = EXCLUDED.views, saves = EXCLUDED.saves, clicks = EXCLUDED.clicks, orders = EXCLUDED.orders,
  sell_through_pct = EXCLUDED.sell_through_pct, median_days_to_sale = EXCLUDED.median_days_to_sale,
  price_p25 = EXCLUDED.price_p25, price_median = EXCLUDED.price_median, price_p75 = EXCLUDED.price_p75,
  active_supply = EXCLUDED.active_supply, supply_gap_score = EXCLUDED.supply_gap_score,
  store_count = EXCLUDED.store_count, txn_count = EXCLUDED.txn_count, generated_at = NOW()
 `;
}
