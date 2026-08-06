import { neon } from "@neondatabase/serverless";
import { getAllProducts } from "../db";
import { normalizeColor } from "../colorNormalize";
import { inferModel } from "./models";
import { resolveBrand } from "./brands";
import { WHOLE_WORD_ALIASES } from "../brandData";
import { loadBrandRef } from "./brands-db";
import { inferCategoryFromTitle } from "../loadStoreProducts";
import { loadEraBuckets } from "./events-db";
import { inferEra } from "./enrich";
import {
 DEMAND_WEIGHTS,
 TREND_FLAT_BAND,
 TRAJECTORY_BANDS,
 METRIC_WINDOWS,
 SOURCING,
 PRIVACY,
 type MetricWindow,
} from "./config";
import {
 rawDemand,
 percentileRanks,
 classifyTrend,
 priceBenchmark,
 sellThroughPct,
 supplyGapScore,
 priceMomentumPct,
 classifyTrajectory,
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

// "brand_category" is the actionable composite ("Dior · bags") — the level sellers actually source at,
// and a far tighter price than a whole house. segment_value is `${brand} · ${category}`.
export type SegmentType = "brand" | "category" | "era" | "color" | "brand_category" | "brand_model";

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
 // Self-healing columns (added after the table shipped): realized-price trend + the leading/lagging
 // trajectory. IF NOT EXISTS so the daily job adds them in place with no migration.
 await sql`ALTER TABLE market_metrics ADD COLUMN IF NOT EXISTS price_momentum_pct NUMERIC`;
 await sql`ALTER TABLE market_metrics ADD COLUMN IF NOT EXISTS trajectory TEXT`;
}

type AggRow = {
 seg_type: SegmentType;
 seg: string;
 views_cur: number; saves_cur: number; clicks_cur: number; orders_cur: number;
 views_prior: number; saves_prior: number; clicks_prior: number; orders_prior: number;
 stores_cur: number; txn_cur: number;
 prices_cur: number[] | null;
 prices_prior: number[] | null;
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
  UNION ALL
  SELECT 'color'::text, color, event_type, ts, qty, store_slug, sale_price FROM events WHERE color IS NOT NULL AND color <> ''
  UNION ALL
  SELECT 'brand_category'::text, brand || ' · ' || category, event_type, ts, qty, store_slug, sale_price FROM events WHERE brand IS NOT NULL AND brand <> '' AND category IS NOT NULL AND category <> ''
  UNION ALL
  SELECT 'brand_model'::text, brand || ' · ' || model, event_type, ts, qty, store_slug, sale_price FROM events WHERE brand IS NOT NULL AND brand <> '' AND model IS NOT NULL AND model <> ''
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
  array_agg(sale_price) FILTER (WHERE event_type='order_item' AND ts >= ${curStart} AND sale_price IS NOT NULL) AS prices_cur,
  array_agg(sale_price) FILTER (WHERE event_type='order_item' AND ts >= ${priorStart} AND ts < ${curStart} AND sale_price IS NOT NULL) AS prices_prior
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
 const out: Record<SegmentType, Map<string, SegSupply>> = { brand: new Map(), category: new Map(), era: new Map(), color: new Map(), brand_category: new Map(), brand_model: new Map() };
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
 const pBrand = resolveBrand(p.title, brandRef, WHOLE_WORD_ALIASES);
 const pCat = inferCategoryFromTitle(p.title) as string | null;
 bump(out.brand, pBrand, price, store);
 bump(out.category, pCat, price, store);
 bump(out.era, inferEra(`${p.title} ${p.description ?? ""}`, buckets), price, store);
 // Supply colour: prefer the vision image_color (accurate), fall back to the title — both
 // normalized to the SAME palette so supply reconciles with the title-derived demand side.
 bump(out.color, normalizeColor(p.image_color) ?? normalizeColor(p.title), price, store);
 // The actionable composite — same `${brand} · ${category}` key as the demand side.
 if (pBrand && pCat) bump(out.brand_category, `${pBrand} · ${pCat}`, price, store);
 // The sharpest composite — `${brand} · ${model}` ("Dior · Saddle").
 const pModel = pBrand ? inferModel(p.title, pBrand) : null;
 if (pBrand && pModel) bump(out.brand_model, `${pBrand} · ${pModel}`, price, store);
 }
 return out;
}

// Just the in-stock counts per segment (what the metric job needs for supply / sell-through).
async function supplyTallies(): Promise<Record<SegmentType, Map<string, number>>> {
 const scan = await scanCatalogBySegment();
 const out: Record<SegmentType, Map<string, number>> = { brand: new Map(), category: new Map(), era: new Map(), color: new Map(), brand_category: new Map(), brand_model: new Map() };
 for (const t of ["brand", "category", "era", "color", "brand_category", "brand_model"] as SegmentType[]) for (const [k, v] of scan[t]) out[t].set(k, v.count);
 return out;
}

type MetricRow = {
 segmentType: SegmentType; segmentValue: string; windowKey: MetricWindow;
 demandIndex: number; demandTrend: string; rawDemand: number;
 views: number; saves: number; clicks: number; orders: number;
 sellThroughPct: number | null; medianDaysToSale: number | null;
 priceP25: number | null; priceMedian: number | null; priceP75: number | null;
 priceMomentumPct: number | null; trajectory: string;
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
 const byType: Record<SegmentType, AggRow[]> = { brand: [], category: [], era: [], color: [], brand_category: [], brand_model: [] };
 for (const r of agg) byType[r.seg_type]?.push(r);

 for (const segType of ["brand", "category", "era", "color", "brand_category", "brand_model"] as SegmentType[]) {
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
   priceMomentumPct: priceMomentumPct(prices.map(Number), (r.prices_prior ?? []).map(Number)),
   trajectory: classifyTrajectory(
    { views: r.views_cur, saves: r.saves_cur, clicks: r.clicks_cur, orders: r.orders_cur },
    { views: r.views_prior, saves: r.saves_prior, clicks: r.clicks_prior, orders: r.orders_prior },
    TRAJECTORY_BANDS,
   ),
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

// ── Colour of the season: the hottest colours by demand right now ──
export type ColorTrend = { color: string; demandIndex: number; demandTrend: string; trajectory: string | null; priceMedian: number | null; priceMomentumPct: number | null };

/**
 * Top colours by demand in the latest snapshot — the "colour of the season" signal (teal summer,
 * etc.). Cross-market by nature: what's hot in resale tracks what's hot in retail. Aggregated +
 * privacy-gated (≥ minStores), so it's market-level, never a single store.
 */
export async function getTopColors(windowKey: MetricWindow = "30d", limit = 6): Promise<ColorTrend[]> {
 await ensureMarketMetricsTable();
 const sql = db();
 const [latest] = (await sql`SELECT MAX(as_of_date) AS d FROM market_metrics WHERE segment_type = 'color' AND window_key = ${windowKey}`.catch(() => [])) as { d: string | null }[];
 if (!latest?.d) return [];
 const rows = (await sql`
  SELECT segment_value, demand_index, demand_trend, trajectory, price_median, price_momentum_pct
  FROM market_metrics
  WHERE segment_type = 'color' AND window_key = ${windowKey} AND as_of_date = ${latest.d} AND store_count >= ${PRIVACY.minStores}
  ORDER BY demand_index DESC, raw_demand DESC
  LIMIT ${limit}
 `.catch(() => [])) as { segment_value: string; demand_index: number; demand_trend: string; trajectory: string | null; price_median: number | null; price_momentum_pct: number | null }[];
 return rows.map((r) => ({
  color: r.segment_value,
  demandIndex: r.demand_index,
  demandTrend: r.demand_trend,
  trajectory: r.trajectory,
  priceMedian: r.price_median,
  priceMomentumPct: r.price_momentum_pct,
 }));
}

// ── Whitespace: rising demand this store DOESN'T carry (the sourcing gap) ──
export type WhitespacePick = {
 segmentType: SegmentType;
 segmentValue: string;
 demandIndex: number;
 demandTrend: string;
 trajectory: string | null;
 supplyGapScore: number;
 priceMedian: number | null;
 priceP25: number | null;
 priceP75: number | null;
 priceMomentumPct: number | null;
 storeCount: number;
 reason: string;
};

/**
 * Per-store whitespace: market segments with real, non-cooling demand and a supply gap that THIS
 * store doesn't already carry — i.e. what to go source. Reads the latest market_metrics snapshot
 * (aggregate + privacy-gated to ≥ minStores), subtracts the store's own inventory segments, and
 * ranks by supply gap then demand. Aggregated only — never another store's numbers.
 */
export async function getStoreWhitespace(slug: string, windowKey: MetricWindow = "30d", limit = 12): Promise<WhitespacePick[]> {
 await ensureMarketMetricsTable();
 const sql = db();
 const [latest] = (await sql`SELECT MAX(as_of_date) AS d FROM market_metrics WHERE window_key = ${windowKey}`.catch(() => [])) as { d: string | null }[];
 if (!latest?.d) return [];

 const rows = (await sql`
  SELECT segment_type, segment_value, demand_index, demand_trend, trajectory, supply_gap_score, price_median, price_momentum_pct, store_count
  FROM market_metrics
  WHERE window_key = ${windowKey} AND as_of_date = ${latest.d}
   AND demand_index >= ${SOURCING.warmDemand} AND demand_trend <> 'falling'
   AND store_count >= ${PRIVACY.minStores}
  ORDER BY supply_gap_score DESC, demand_index DESC
  LIMIT 200
 `.catch(() => [])) as {
  segment_type: SegmentType; segment_value: string; demand_index: number; demand_trend: string;
  trajectory: string | null; supply_gap_score: number; price_median: number | null; price_momentum_pct: number | null; store_count: number;
 }[];
 if (!rows.length) return [];

 // What this store already carries, by segment. Resolve to the SAME canonical vocabulary the demand
 // side uses (so "Christian Dior" reconciles to "Dior", and the "Dior · bags" composite matches).
 const [wsBrandRef, wsBuckets] = await Promise.all([loadBrandRef(), loadEraBuckets()]);
 const inv = (await sql`
  SELECT i.brand, i.category, i.era, i.title
  FROM items i JOIN sellers s ON s.id = i.seller_id WHERE s.slug = ${slug}
 `.catch(() => [])) as { brand: string | null; category: string | null; era: string | null; title: string | null }[];
 const has: Record<SegmentType, Set<string>> = { brand: new Set(), category: new Set(), era: new Set(), color: new Set(), brand_category: new Set(), brand_model: new Set() };
 for (const r of inv) {
 const b = resolveBrand(`${r.brand ?? ""} ${r.title ?? ""}`, wsBrandRef, WHOLE_WORD_ALIASES);
 const c = (r.category || "").trim().toLowerCase() || ((r.title ? (inferCategoryFromTitle(r.title) as string | null) : null) ?? null);
 const e = (r.era || "").trim() || inferEra(r.title ?? "", wsBuckets);
 const col = normalizeColor(r.title);
 const m = b ? inferModel(r.title ?? "", b) : null;
 if (b) has.brand.add(b.toLowerCase());
 if (c) has.category.add(c.toLowerCase());
 if (e) has.era.add(String(e).toLowerCase());
 if (col) has.color.add(col.toLowerCase());
 if (b && c) has.brand_category.add(`${b} · ${c}`.toLowerCase());
 if (b && m) has.brand_model.add(`${b} · ${m}`.toLowerCase());
 }

 // Price from the LIVE catalog asking benchmark (populated) — realized sales are too thin to price on.
 const scan = await scanCatalogBySegment().catch(() => null);
 const askOf = (type: SegmentType, value: string) => {
 const seg = scan?.[type]?.get(value);
 return seg && seg.prices.length >= 3 ? priceBenchmark(seg.prices) : null;
 };
 const money = (n: number | null) => (n == null ? null : `$${Math.round(n).toLocaleString()}`);

 // Surface at the NATURAL granularity: drop a bare brand/category when a more-specific child (its
 // model or brand×category) explains the demand — so we show "Dior · Saddle", not "Dior" + "Dior ·
 // Saddle" + "Dior · bags" all at once. A bare segment survives only on a whole-house/whole-category
 // moment (its own demand clearly beats its best child).
 const carriedRows = rows.filter((r) => !has[r.segment_type]?.has((r.segment_value || "").toLowerCase()));
 const bestChildBrand = new Map<string, number>();
 const bestChildCat = new Map<string, number>();
 for (const r of carriedRows) {
 if (r.segment_type === "brand_category" || r.segment_type === "brand_model") {
  const [cb, tail] = (r.segment_value || "").split(" · ");
  if (cb) bestChildBrand.set(cb.toLowerCase(), Math.max(bestChildBrand.get(cb.toLowerCase()) ?? 0, r.demand_index));
  if (r.segment_type === "brand_category" && tail) bestChildCat.set(tail.toLowerCase(), Math.max(bestChildCat.get(tail.toLowerCase()) ?? 0, r.demand_index));
 }
 }
 const GRANULARITY_MARGIN = 3;
 return carriedRows
  .filter((r) => {
  if (r.segment_type === "brand") return r.demand_index > (bestChildBrand.get((r.segment_value || "").toLowerCase()) ?? -1) + GRANULARITY_MARGIN;
  if (r.segment_type === "category") return r.demand_index > (bestChildCat.get((r.segment_value || "").toLowerCase()) ?? -1) + GRANULARITY_MARGIN;
  return true;
  })
  .slice(0, limit)
  .map((r) => {
  const trendNote = r.demand_trend === "rising" ? " and rising" : "";
  const accel = r.trajectory === "accelerating" ? " Demand is accelerating — get in early." : r.trajectory === "peaking" ? " (Momentum may be peaking.)" : "";
  const ask = askOf(r.segment_type, r.segment_value);
  const p25 = ask?.p25 ?? null;
  const p75 = ask?.p75 ?? null;
  const med = ask?.median ?? r.price_median;
  // A real range when the catalog has enough listings; else a single number; else nothing (uniform).
  const priceNote = p25 != null && p75 != null && p75 > p25
   ? ` Sells around ${money(p25)}–${money(p75)}.`
   : med != null ? ` Sells around ${money(med)}.` : "";
  return {
   segmentType: r.segment_type,
   segmentValue: r.segment_value,
   demandIndex: r.demand_index,
   demandTrend: r.demand_trend,
   trajectory: r.trajectory,
   supplyGapScore: r.supply_gap_score,
   priceMedian: med,
   priceP25: p25,
   priceP75: p75,
   priceMomentumPct: r.price_momentum_pct,
   storeCount: r.store_count,
   reason: `Strong demand (index ${r.demand_index}${trendNote}) with thin supply, and you don't carry it yet.${accel}${priceNote}`.trim(),
  };
  });
}

async function insertMetrics(asOf: string, rows: MetricRow[]): Promise<void> {
 if (rows.length === 0) return;
 const sql = db();
 const col = <T>(f: (r: MetricRow) => T) => rows.map(f);
 await sql`
 INSERT INTO market_metrics (
  as_of_date, segment_type, segment_value, window_key, demand_index, demand_trend, raw_demand,
  views, saves, clicks, orders, sell_through_pct, median_days_to_sale,
  price_p25, price_median, price_p75, price_momentum_pct, trajectory, active_supply, supply_gap_score, store_count, txn_count
 )
 SELECT ${asOf}::date, * FROM unnest(
  ${col((r) => r.segmentType)}::text[], ${col((r) => r.segmentValue)}::text[], ${col((r) => r.windowKey)}::text[],
  ${col((r) => r.demandIndex)}::int[], ${col((r) => r.demandTrend)}::text[], ${col((r) => r.rawDemand)}::numeric[],
  ${col((r) => r.views)}::int[], ${col((r) => r.saves)}::int[], ${col((r) => r.clicks)}::int[], ${col((r) => r.orders)}::int[],
  ${col((r) => r.sellThroughPct)}::numeric[], ${col((r) => r.medianDaysToSale)}::numeric[],
  ${col((r) => r.priceP25)}::numeric[], ${col((r) => r.priceMedian)}::numeric[], ${col((r) => r.priceP75)}::numeric[],
  ${col((r) => r.priceMomentumPct)}::numeric[], ${col((r) => r.trajectory)}::text[],
  ${col((r) => r.activeSupply)}::int[], ${col((r) => r.supplyGapScore)}::int[], ${col((r) => r.storeCount)}::int[], ${col((r) => r.txnCount)}::int[]
 )
 ON CONFLICT (as_of_date, segment_type, segment_value, window_key) DO UPDATE SET
  demand_index = EXCLUDED.demand_index, demand_trend = EXCLUDED.demand_trend, raw_demand = EXCLUDED.raw_demand,
  views = EXCLUDED.views, saves = EXCLUDED.saves, clicks = EXCLUDED.clicks, orders = EXCLUDED.orders,
  sell_through_pct = EXCLUDED.sell_through_pct, median_days_to_sale = EXCLUDED.median_days_to_sale,
  price_p25 = EXCLUDED.price_p25, price_median = EXCLUDED.price_median, price_p75 = EXCLUDED.price_p75,
  price_momentum_pct = EXCLUDED.price_momentum_pct, trajectory = EXCLUDED.trajectory,
  active_supply = EXCLUDED.active_supply, supply_gap_score = EXCLUDED.supply_gap_score,
  store_count = EXCLUDED.store_count, txn_count = EXCLUDED.txn_count, generated_at = NOW()
 `;
}
