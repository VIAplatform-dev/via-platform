import { neon } from "@neondatabase/serverless";
import { inferBrandFromTitle } from "./market-data-db";
import { stripSizePrefix } from "./publicFilters";

// ---------------------------------------------------------------------------
// VYA Data Layer: modules 1-4 of the monetizable B2B product line.
//
//  1. Conversion funnel    view → favorite → click(checkout intent) → purchase
//  2. Price & velocity     list price, markdown depth, sell-through, days-to-sell
//  3. Search-trend intel   rising / falling / top queries, week-over-week
//  4. Sizing & fit demand  which sizes are wanted vs in stock
//
// All four reconcile with the rest of the data layer by deriving brand the same
// canonical way (inferBrandFromTitle on the product/line-item title) and reading
// the same real-data sources (product_views, product_favorites, clicks,
// conversions, products, searches, sold_items).
// ---------------------------------------------------------------------------

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

const pct = (num: number, den: number): number =>
 den > 0 ? Math.round((num / den) * 1000) / 10 : 0;
const round = (n: number, d = 0) => {
 const f = 10 ** d;
 return Math.round(n * f) / f;
};

// ════════════════════════════════════════════════════════════════════════
// 1. CONVERSION FUNNEL, where demand leaks between interest and purchase.
//    Per brand: view → favorite → click(checkout intent) → purchase, plus the
//    rates between stages. Surfaces brands that get looked at but don't convert
//    (overpriced / wrong fit) and brands that punch above their view count.
// ════════════════════════════════════════════════════════════════════════
export type FunnelStageRates = {
 views: number; favorites: number; clicks: number; purchases: number;
 favoriteRate: number; // favorites / views
 clickRate: number; // clicks / views
 buyRate: number; // purchases / views
};
export type FunnelBrand = FunnelStageRates & { brand: string };
export type ConversionFunnel = {
 windowDays: number;
 overall: FunnelStageRates;
 byBrand: FunnelBrand[];
};

export async function getConversionFunnel(windowDays = 30): Promise<ConversionFunnel> {
 const sql = db();
 const w = `${windowDays} days`;

 const [viewRows, favRows, clickRows, convRows] = await Promise.all([
 sql`SELECT p.title AS title, COUNT(*)::int AS c
  FROM product_views v JOIN products p ON v.product_id = (p.store_slug || '-' || p.id::text)
  WHERE v.timestamp >= NOW() - ${w}::interval GROUP BY p.title`.catch(() => []),
 sql`SELECT p.title AS title, COUNT(*)::int AS c
  FROM product_favorites f JOIN products p ON f.product_id = p.id
  WHERE f.created_at >= NOW() - ${w}::interval GROUP BY p.title`.catch(() => []),
 sql`SELECT product_name AS title, COUNT(*)::int AS c
  FROM clicks WHERE timestamp >= NOW() - ${w}::interval GROUP BY product_name`.catch(() => []),
 sql`SELECT item->>'productName' AS title, COALESCE(SUM((item->>'quantity')::int), 0)::int AS c
  FROM conversions c, jsonb_array_elements(c.items) AS item
  WHERE c.order_total > 0 AND c.timestamp >= NOW() - ${w}::interval
  GROUP BY item->>'productName'`.catch(() => []),
 ]) as [Array<{ title: string; c: number }>, Array<{ title: string; c: number }>, Array<{ title: string; c: number }>, Array<{ title: string; c: number }>];

 type Acc = { views: number; favorites: number; clicks: number; purchases: number };
 const acc = new Map<string, Acc>();
 const get = (b: string): Acc => {
 let a = acc.get(b);
 if (!a) { a = { views: 0, favorites: 0, clicks: 0, purchases: 0 }; acc.set(b, a); }
 return a;
 };
 const o: Acc = { views: 0, favorites: 0, clicks: 0, purchases: 0 };
 const fold = (rows: Array<{ title: string; c: number }>, key: keyof Acc) => {
 for (const r of rows) {
  const n = Number(r.c) || 0;
  o[key] += n;
  const b = r.title ? inferBrandFromTitle(r.title) : null;
  if (b) get(b)[key] += n;
 }
 };
 fold(viewRows, "views");
 fold(favRows, "favorites");
 fold(clickRows, "clicks");
 fold(convRows, "purchases");

 const rates = (a: Acc): FunnelStageRates => ({
 ...a,
 favoriteRate: pct(a.favorites, a.views),
 clickRate: pct(a.clicks, a.views),
 buyRate: pct(a.purchases, a.views),
 });

 // Only rank brands with enough views for the rates to mean something.
 const byBrand: FunnelBrand[] = Array.from(acc.entries())
 .filter(([, a]) => a.views >= 15)
 .map(([brand, a]) => ({ brand, ...rates(a) }))
 .sort((x, y) => y.buyRate - x.buyRate || y.views - x.views)
 .slice(0, 25);

 return { windowDays, overall: rates(o), byBrand };
}

// ════════════════════════════════════════════════════════════════════════
// 2. PRICE & VELOCITY: what brands list for, how hard they're discounted,
//    and how fast they turn over. The benchmark resale buyers / merchandisers
//    pay most for. List price + markdown from the live catalog; sold units +
//    realized price from real orders; sell-through = sold ÷ listings.
// ════════════════════════════════════════════════════════════════════════
export type PriceVelocityBrand = {
 brand: string;
 listings: number; // current in-stock count
 avgListPrice: number;
 markdownPct: number | null; // avg discount depth on items with a compare-at price
 sold: number; // units sold in window
 avgSoldPrice: number | null;
 sellThroughPct: number | null; // sold / listings
 avgDaysToSell: number | null; // from sold_items.days_listed when available
};
export type PriceVelocity = { windowDays: number; brands: PriceVelocityBrand[] };

export async function getPriceVelocity(windowDays = 30): Promise<PriceVelocity> {
 const sql = db();
 const w = `${windowDays} days`;

 const [catalogRows, soldRows, dtsRows] = await Promise.all([
 sql`SELECT title, price::float AS price, compare_at_price::float AS cap
  FROM products WHERE price > 0`.catch(() => []),
 sql`SELECT item->>'productName' AS title, (item->>'price')::float AS price,
   COALESCE((item->>'quantity')::int, 1) AS qty
  FROM conversions c, jsonb_array_elements(c.items) AS item
  WHERE c.order_total > 0 AND c.timestamp >= NOW() - ${w}::interval`.catch(() => []),
 sql`SELECT title, days_listed FROM sold_items
  WHERE days_listed IS NOT NULL AND days_listed >= 0`.catch(() => []),
 ]) as [Array<{ title: string; price: number; cap: number | null }>, Array<{ title: string; price: number; qty: number }>, Array<{ title: string; days_listed: number }>];

 type Acc = {
 listings: number; listSum: number;
 mdSum: number; mdCount: number;
 sold: number; soldSum: number;
 dtsSum: number; dtsCount: number;
 };
 const acc = new Map<string, Acc>();
 const get = (b: string): Acc => {
 let a = acc.get(b);
 if (!a) { a = { listings: 0, listSum: 0, mdSum: 0, mdCount: 0, sold: 0, soldSum: 0, dtsSum: 0, dtsCount: 0 }; acc.set(b, a); }
 return a;
 };

 for (const r of catalogRows) {
 const b = r.title ? inferBrandFromTitle(r.title) : null;
 if (!b) continue;
 const a = get(b);
 a.listings += 1;
 a.listSum += r.price;
 if (r.cap && r.cap > r.price) { a.mdSum += (r.cap - r.price) / r.cap; a.mdCount += 1; }
 }
 for (const r of soldRows) {
 const b = r.title ? inferBrandFromTitle(r.title) : null;
 if (!b) continue;
 const a = get(b);
 const qty = Number(r.qty) || 1;
 a.sold += qty;
 a.soldSum += (Number(r.price) || 0) * qty;
 }
 for (const r of dtsRows) {
 const b = r.title ? inferBrandFromTitle(r.title) : null;
 if (!b) continue;
 const a = get(b);
 a.dtsSum += Number(r.days_listed) || 0;
 a.dtsCount += 1;
 }

 const brands: PriceVelocityBrand[] = Array.from(acc.entries())
 .map(([brand, a]) => ({
  brand,
  listings: a.listings,
  avgListPrice: a.listings ? round(a.listSum / a.listings) : 0,
  markdownPct: a.mdCount ? pct(a.mdSum, a.mdCount) : null,
  sold: a.sold,
  avgSoldPrice: a.sold ? round(a.soldSum / a.sold) : null,
  sellThroughPct: a.listings ? pct(a.sold, a.listings) : null,
  avgDaysToSell: a.dtsCount ? round(a.dtsSum / a.dtsCount) : null,
 }))
 .filter((b) => b.listings >= 3 || b.sold > 0)
 .sort((x, y) => y.sold - x.sold || y.listings - x.listings)
 .slice(0, 30);

 return { windowDays, brands };
}

// ════════════════════════════════════════════════════════════════════════
// 3. SEARCH-TREND INTELLIGENCE: what shoppers are typing, and which queries
//    are accelerating vs cooling. Current window vs the equal prior window.
//    Rising + new queries are a leading indicator of demand; results=low on a
//    rising query is a sourcing alarm.
// ════════════════════════════════════════════════════════════════════════
export type SearchTrend = {
 query: string;
 current: number;
 prior: number;
 deltaPct: number | null; // null when prior was 0 (use isNew instead)
 isNew: boolean;
 results: number; // max results the query returned (low = unmet)
};
export type SearchTrends = {
 windowDays: number;
 rising: SearchTrend[];
 falling: SearchTrend[];
 top: SearchTrend[];
};

export async function getSearchTrends(windowDays = 30): Promise<SearchTrends> {
 const sql = db();
 const cur = `${windowDays} days`;
 const prior = `${windowDays * 2} days`;

 const rows = (await sql`
 SELECT lower(query) AS q,
  COUNT(*) FILTER (WHERE timestamp >= NOW() - ${cur}::interval)::int AS cur,
  COUNT(*) FILTER (WHERE timestamp >= NOW() - ${prior}::interval AND timestamp < NOW() - ${cur}::interval)::int AS prior,
  MAX(results_count)::int AS results
 FROM searches
 WHERE timestamp >= NOW() - ${prior}::interval AND length(query) >= 2
 GROUP BY lower(query)
 `.catch(() => [])) as Array<{ q: string; cur: number; prior: number; results: number }>;

 const all: SearchTrend[] = rows.map((r) => ({
 query: r.q,
 current: r.cur,
 prior: r.prior,
 isNew: r.prior === 0 && r.cur > 0,
 deltaPct: r.prior > 0 ? Math.round(((r.cur - r.prior) / r.prior) * 100) : null,
 results: r.results ?? 0,
 }));

 const rising = all
 .filter((t) => t.current >= 3 && (t.isNew || (t.deltaPct != null && t.deltaPct >= 25)))
 .sort((a, b) => (b.deltaPct ?? 9999) - (a.deltaPct ?? 9999) || b.current - a.current)
 .slice(0, 20);

 const falling = all
 .filter((t) => t.prior >= 3 && t.deltaPct != null && t.deltaPct <= -25)
 .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))
 .slice(0, 15);

 const top = all
 .filter((t) => t.current > 0)
 .sort((a, b) => b.current - a.current)
 .slice(0, 20);

 return { windowDays, rising, falling, top };
}

// ════════════════════════════════════════════════════════════════════════
// 4. SIZING & FIT DEMAND, which sizes shoppers want vs what's in stock.
//    Demand = views + favorites on products of a size (region prefix stripped
//    so "US 8" / "EU 8" / "8" group together). Supply = in-stock count. A high
//    demand:supply ratio = under-served sizes to source.
// ════════════════════════════════════════════════════════════════════════
export type SizeDemand = {
 size: string;
 demand: number; // weighted engagement (views + favorites*3)
 views: number;
 favorites: number;
 supply: number; // in-stock listings
 ratio: number | null; // demand / supply
};
export type SizingDemand = { windowDays: number; sizes: SizeDemand[] };

// Keep only sizes that look real: letter sizes or plausible numeric sizes.
function normalizeSizeKey(raw: string): string | null {
 const core = stripSizePrefix(raw);
 if (!core) return null;
 if (/^(XXS|XS|S|M|L|XL|XXL|XXXL)$/.test(core)) return core;
 if (/^\d{1,2}(\.\d)?$/.test(core) && Number(core) <= 60) return core;
 return null;
}

export async function getSizingDemand(windowDays = 30): Promise<SizingDemand> {
 const sql = db();
 const w = `${windowDays} days`;

 const [supplyRows, viewRows, favRows] = await Promise.all([
 sql`SELECT size, COUNT(*)::int AS c FROM products
  WHERE size IS NOT NULL AND TRIM(size) <> '' GROUP BY size`.catch(() => []),
 sql`SELECT p.size AS size, COUNT(*)::int AS c
  FROM product_views v JOIN products p ON v.product_id = (p.store_slug || '-' || p.id::text)
  WHERE v.timestamp >= NOW() - ${w}::interval AND p.size IS NOT NULL AND TRIM(p.size) <> ''
  GROUP BY p.size`.catch(() => []),
 sql`SELECT p.size AS size, COUNT(*)::int AS c
  FROM product_favorites f JOIN products p ON f.product_id = p.id
  WHERE f.created_at >= NOW() - ${w}::interval AND p.size IS NOT NULL AND TRIM(p.size) <> ''
  GROUP BY p.size`.catch(() => []),
 ]) as [Array<{ size: string; c: number }>, Array<{ size: string; c: number }>, Array<{ size: string; c: number }>];

 type Acc = { views: number; favorites: number; supply: number };
 const acc = new Map<string, Acc>();
 const get = (s: string): Acc => {
 let a = acc.get(s);
 if (!a) { a = { views: 0, favorites: 0, supply: 0 }; acc.set(s, a); }
 return a;
 };
 const fold = (rows: Array<{ size: string; c: number }>, key: keyof Acc) => {
 for (const r of rows) {
  const k = r.size ? normalizeSizeKey(r.size) : null;
  if (!k) continue;
  get(k)[key] += Number(r.c) || 0;
 }
 };
 fold(supplyRows, "supply");
 fold(viewRows, "views");
 fold(favRows, "favorites");

 const sizes: SizeDemand[] = Array.from(acc.entries())
 .map(([size, a]) => {
  const demand = a.views + a.favorites * 3;
  return {
  size, demand, views: a.views, favorites: a.favorites, supply: a.supply,
  ratio: a.supply > 0 ? round(demand / a.supply, 1) : demand > 0 ? demand : null,
  };
 })
 .filter((s) => s.demand > 0 || s.supply > 0)
 .sort((a, b) => b.demand - a.demand)
 .slice(0, 40);

 return { windowDays, sizes };
}
