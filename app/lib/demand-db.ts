import { neon } from "@neondatabase/serverless";
import { getProductsByStore } from "./db";
import {
 getTopBrands,
 getTopCategories,
 inferBrandFromTitle,
 normalizeCategory,
} from "./market-data-db";

// "Demand Intelligence" (BETA): the B2B data-layer flagship. It deliberately
// reuses the SAME brand/category inference and the SAME engagement signals
// (product_views, favorites, purchases) as the admin Market Data page, so the
// numbers reconcile. On top of that marketplace demand it overlays each store's
// own supply to surface "high demand, low supply" sourcing opportunities, plus
// search-intent signals (top unmet searches).

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type UnmetSearch = { query: string; searches: number; results: number };
export type BrandDemand = {
 brand: string; // canonical brand label (matches admin Market Data)
 views: number; // marketplace product_views
 hearts: number; // marketplace favorites
 purchases: number; // attributed purchases
 searches: number; // search-query intent
 yourInventory: number;
 opportunity: boolean; // notable marketplace demand, little/no inventory in this store
};
export type CategoryDemand = {
 category: string; // canonical category label
 views: number;
 hearts: number;
 purchases: number;
 yourInventory: number;
};
export type OpenSourcing = {
 id: string;
 description: string;
 priceMin: number;
 priceMax: number;
 size: string | null;
 deadline: string;
};

export type StoreDemandIntelligence = {
 storeSlug: string;
 generatedAt: string;
 windowDays: number; // applies to the search-intent signals
 inventory: { total: number; brands: number; categories: number };
 unmetSearches: UnmetSearch[];
 brandDemand: BrandDemand[];
 hotCategories: CategoryDemand[];
 openSourcing: OpenSourcing[];
};

// Marketplace demand weight from engagement (mirrors how admin ranks: views lead,
// hearts/purchases are stronger intent).
function engagementScore(views: number, hearts: number, purchases: number): number {
 return views + hearts * 3 + purchases * 5;
}

export async function getStoreDemandIntelligence(
 storeSlug: string,
 opts: { windowDays?: number } = {},
): Promise<StoreDemandIntelligence> {
 const windowDays = opts.windowDays ?? 30;
 const sql = db();

 // ── This store's supply, attributed with the SAME inference as admin ──
 const products = await getProductsByStore(storeSlug).catch(() => []);
 const brandInventory = new Map<string, number>();
 const categoryInventory = new Map<string, number>();
 for (const p of products) {
 const b = inferBrandFromTitle(p.title);
 if (b) brandInventory.set(b, (brandInventory.get(b) ?? 0) + 1);
 const c = p.product_type ? normalizeCategory(p.product_type) : null;
 if (c) categoryInventory.set(c, (categoryInventory.get(c) ?? 0) + 1);
 }

 // ── Marketplace demand: same source as admin Market Data ──
 const [marketBrands, marketCategories] = await Promise.all([
 getTopBrands(60).catch(() => []),
 getTopCategories(40).catch(() => []),
 ]);

 // ── Search intent (separate, search-specific signal) ──
 const searchRows = (await sql`
 SELECT lower(query) AS q, COUNT(*)::int AS freq, MAX(results_count)::int AS max_res
 FROM searches
 WHERE length(query) >= 3 AND timestamp >= NOW() - (${windowDays} || ' days')::interval
 GROUP BY lower(query)
 `.catch(() => [])) as Array<{ q: string; freq: number; max_res: number }>;

 const unmetSearches: UnmetSearch[] = searchRows
 .filter((r) => r.max_res <= 3)
 .sort((a, b) => b.freq - a.freq)
 .slice(0, 25)
 .map((r) => ({ query: r.q, searches: r.freq, results: r.max_res }));

 const brandSearch = new Map<string, number>();
 for (const r of searchRows) {
 const b = inferBrandFromTitle(r.q);
 if (b) brandSearch.set(b, (brandSearch.get(b) ?? 0) + r.freq);
 }

 // ── Brand demand vs your supply ──
 const brandDemand: BrandDemand[] = marketBrands
 .map((b) => {
 const views = b.clicks;
 const hearts = b.hearts;
 const purchases = b.purchases;
 const yourInventory = brandInventory.get(b.brand) ?? 0;
 const score = engagementScore(views, hearts, purchases) + (brandSearch.get(b.brand) ?? 0);
 return {
  brand: b.brand,
  views,
  hearts,
  purchases,
  searches: brandSearch.get(b.brand) ?? 0,
  yourInventory,
  opportunity: score >= 8 && yourInventory <= 2,
  _score: score,
 };
 })
 .filter((b) => b._score > 0)
 .sort((a, b) => Number(b.opportunity) - Number(a.opportunity) || b._score - a._score)
 .slice(0, 20)
 .map(({ _score, ...rest }) => rest);

 // ── Category demand vs your supply ──
 const hotCategories: CategoryDemand[] = marketCategories
 .map((c) => ({
 category: c.category,
 views: c.clicks,
 hearts: c.hearts,
 purchases: c.purchases,
 yourInventory: categoryInventory.get(c.category) ?? 0,
 }))
 .slice(0, 12);

 // ── Open consumer sourcing requests (paid, awaiting a store) ──
 const sourcingRows = (await sql`
 SELECT id, description, price_min, price_max, size, deadline
 FROM sourcing_requests
 WHERE status = 'paid' AND matched_store_slug IS NULL
 ORDER BY created_at DESC
 LIMIT 25
 `.catch(() => [])) as Array<Record<string, unknown>>;
 const openSourcing: OpenSourcing[] = sourcingRows.map((r) => ({
 id: r.id as string,
 description: r.description as string,
 priceMin: Number(r.price_min),
 priceMax: Number(r.price_max),
 size: (r.size as string | null) ?? null,
 deadline: r.deadline as string,
 }));

 return {
 storeSlug,
 generatedAt: new Date().toISOString(),
 windowDays,
 inventory: { total: products.length, brands: brandInventory.size, categories: categoryInventory.size },
 unmetSearches,
 brandDemand,
 hotCategories,
 openSourcing,
 };
}

export type MarketplaceBrandDemand = { brand: string; views: number; hearts: number; purchases: number; searches: number };
export type MarketplaceCategoryDemand = { category: string; views: number; hearts: number; purchases: number };
// Whitespace = demand outstripping supply. The headline sourcing signal: brands
// people want that the marketplace is under-stocked on.
export type Whitespace = { brand: string; demand: number; inventory: number; ratio: number };
export type DemandSummary = { gmv: number; orders: number; aov: number };
export type MarketplaceDemand = {
 generatedAt: string;
 windowDays: number;
 summary: DemandSummary;
 unmetSearches: UnmetSearch[];
 topBrands: MarketplaceBrandDemand[];
 whitespace: Whitespace[];
 topCategories: MarketplaceCategoryDemand[];
 openSourcing: OpenSourcing[];
};

// Marketplace-wide demand intelligence for the admin Data Layer. The same
// signals as the per-store board, but aggregated across ALL stores (no per-store
// supply overlay). Reuses the canonical Market Data brand/category functions so
// the numbers reconcile with the Market Data page.
export async function getMarketplaceDemand(opts: { windowDays?: number } = {}): Promise<MarketplaceDemand> {
 const windowDays = opts.windowDays ?? 30;
 const sql = db();

 const [marketBrands, marketCategories] = await Promise.all([
 getTopBrands(40).catch(() => []),
 getTopCategories(20).catch(() => []),
 ]);

 const searchRows = (await sql`
 SELECT lower(query) AS q, COUNT(*)::int AS freq, MAX(results_count)::int AS max_res
 FROM searches
 WHERE length(query) >= 3 AND timestamp >= NOW() - (${windowDays} || ' days')::interval
 GROUP BY lower(query)
 `.catch(() => [])) as Array<{ q: string; freq: number; max_res: number }>;

 const unmetSearches: UnmetSearch[] = searchRows
 .filter((r) => r.max_res <= 3)
 .sort((a, b) => b.freq - a.freq)
 .slice(0, 25)
 .map((r) => ({ query: r.q, searches: r.freq, results: r.max_res }));

 const brandSearch = new Map<string, number>();
 for (const r of searchRows) {
 const b = inferBrandFromTitle(r.q);
 if (b) brandSearch.set(b, (brandSearch.get(b) ?? 0) + r.freq);
 }

 const topBrands: MarketplaceBrandDemand[] = marketBrands.slice(0, 25).map((b) => ({
 brand: b.brand,
 views: b.clicks,
 hearts: b.hearts,
 purchases: b.purchases,
 searches: brandSearch.get(b.brand) ?? 0,
 }));

 const topCategories: MarketplaceCategoryDemand[] = marketCategories.slice(0, 15).map((c) => ({
 category: c.category,
 views: c.clicks,
 hearts: c.hearts,
 purchases: c.purchases,
 }));

 // Whitespace: demand-to-supply ratio per brand. High ratio = lots of demand,
 // little inventory = a sourcing opportunity. Demand weighted like the heat index.
 const whitespace: Whitespace[] = marketBrands
 .map((b) => {
 const demand = b.clicks + b.hearts * 3 + (brandSearch.get(b.brand) ?? 0) * 2 + b.purchases * 5;
 const inventory = b.items;
 return { brand: b.brand, demand, inventory, ratio: inventory > 0 ? Math.round((demand / inventory) * 10) / 10 : demand };
 })
 .filter((w) => w.demand >= 5)
 .sort((a, b) => b.ratio - a.ratio)
 .slice(0, 15);

 // Revenue summary over the window (actual tracked orders).
 const sumRows = (await sql`
 SELECT COUNT(*)::int AS orders, COALESCE(SUM(order_total), 0)::float AS gmv
 FROM conversions
 WHERE order_total > 0 AND timestamp >= NOW() - (${windowDays} || ' days')::interval
 `.catch(() => [{ orders: 0, gmv: 0 }])) as Array<{ orders: number; gmv: number }>;
 const orders = sumRows[0]?.orders ?? 0;
 const gmv = Math.round(sumRows[0]?.gmv ?? 0);
 const summary: DemandSummary = { gmv, orders, aov: orders > 0 ? Math.round(gmv / orders) : 0 };

 const sourcingRows = (await sql`
 SELECT id, description, price_min, price_max, size, deadline
 FROM sourcing_requests
 WHERE status = 'paid' AND matched_store_slug IS NULL
 ORDER BY created_at DESC
 LIMIT 25
 `.catch(() => [])) as Array<Record<string, unknown>>;
 const openSourcing: OpenSourcing[] = sourcingRows.map((r) => ({
 id: r.id as string,
 description: r.description as string,
 priceMin: Number(r.price_min),
 priceMax: Number(r.price_max),
 size: (r.size as string | null) ?? null,
 deadline: r.deadline as string,
 }));

 return { generatedAt: new Date().toISOString(), windowDays, summary, unmetSearches, topBrands, whitespace, topCategories, openSourcing };
}
