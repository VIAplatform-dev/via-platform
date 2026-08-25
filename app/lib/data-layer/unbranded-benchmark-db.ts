import { neon } from "@neondatabase/serverless";
// ".js" so Node's native TS test runner can resolve it (next has no package "exports" map);
// webpack/Next resolve it identically.
import { unstable_cache } from "next/cache.js";
import { inferBrandFromTitle } from "../market-data-db.ts";
import { inferCategoryFromTitle } from "../loadStoreProducts.ts";
import { materialTier, type MaterialTier } from "../material-tier.ts";

// THE GOLDEN SET — how VYA's OWN unbranded + lesser-known pieces are actually priced, read straight
// from live inventory and grouped by garment category × material tier. For a piece with no brand and
// no exact comps, this is the strongest anchor there is: real prices set by ~45 curated stores for
// the same kind of item — not model guesswork. Asking + sold, gated to a reliability floor per
// segment. Computed live (pilot-scale items table); can move to the nightly snapshot when it grows.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

const MIN_ITEMS = 5; // a segment below this is too thin to trust as an anchor
const MIN_STORES = 2; // and it must span >1 store, so the anchor is a market signal, not one store's bias
// Explicit "no brand" markers sellers type; everything else is checked against the canonical map.
const UNBRANDED_RE = /^\s*(unbranded|no[\s-]?brand|no[\s-]?label|none|unknown|n\/?a|unmarked|handmade|vintage|generic)\s*$/i;

export type BrandClass = "unbranded" | "lesser-known" | "known";

/** unbranded (no/marker brand) · lesser-known (a real name, but not in the canonical designer map)
 *  · known (a curated well-known designer). The golden set is unbranded + lesser-known — the pieces
 *  that lack strong external comps and need an intrinsic anchor. */
export function classifyBrand(brand: string | null | undefined): BrandClass {
 const b = (brand || "").trim();
 if (!b || UNBRANDED_RE.test(b)) return "unbranded";
 return inferBrandFromTitle(b) ? "known" : "lesser-known";
}

function quantile(sorted: number[], q: number): number {
 if (!sorted.length) return 0;
 return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

type Row = { brand: string | null; material: string | null; category: string; priceCents: number; sellerId: string };

// Category is INFERRED from the title (the codebase convention — brand/category are inferred, not
// stored — using the same canonical inferrer the pricing engine keys on, so buckets line up with
// the benchmark lookup). Falls back to the synced product_type, then "other".
function categoryOf(title: string, stored: string | null): string {
 const inferred = inferCategoryFromTitle(title || "");
 return String(inferred || (stored || "").trim() || "other").toLowerCase();
}

// Read the GOLDEN SET from the MARKETPLACE catalog (`products`) — ~65 stores of live listings, far
// richer than the pilot OS `items` table. Cached for an hour: the set barely moves minute-to-minute
// and this scan feeds both the report and the per-price benchmark lookup. Prices are ASKING (live
// listings), which is exactly "how the stores price these pieces".
const loadGoldenRows = (
 async (): Promise<Row[]> => {
 const sql = db();
 const rows = (await sql`
 SELECT store_slug, title, brand, materials, product_type, price
 FROM products WHERE price > 0
 `) as Array<Record<string, unknown>>;
 const out: Row[] = [];
 for (const r of rows) {
 const title = (r.title as string) || "";
 // Brand from the title (canonical) wins; else the store-tagged brand column; else nothing.
 const effBrand = inferBrandFromTitle(title) || ((r.brand as string) || "").trim() || null;
 if (classifyBrand(effBrand) === "known") continue; // golden set = unbranded + lesser-known only
 out.push({
 brand: effBrand,
 material: (r.materials as string) ?? null,
 category: categoryOf(title, (r.product_type as string) ?? null),
 priceCents: Math.round(Number(r.price) * 100),
 sellerId: String(r.store_slug),
 });
 }
 return out;
 }
);

const cachedGoldenRows = unstable_cache(loadGoldenRows, ["unbranded-golden-rows-v1"], { revalidate: 3600 });

// `unstable_cache` only works inside a Next request. Called from a script — the price eval, a cron,
// anything on the CLI — it THROWS, and every caller here wraps the lookup in `.catch(() => null)`.
// The result was silent: the golden set, the single strongest anchor for an unbranded piece, was
// simply absent from every measurement ever taken, while production had it the whole time. So:
// fall back to an in-process memo with the same hour-long life.
const MEMO_MS = 3600_000;
let memo: { at: number; rows: Row[] } | null = null;
async function fetchGoldenRows(): Promise<Row[]> {
 try {
  return await cachedGoldenRows();
 } catch {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.rows;
  const rows = await loadGoldenRows();
  memo = { at: Date.now(), rows };
  return rows;
 }
}

type SoldRow = Row & { soldId: number; ageDays: number };

// ── Recency weighting ──
// External comps arrive undated: SerpApi's eBay sold results carry no date field at all, and a
// Google Shopping row is a live offer. VYA's own sales are the ONLY comps whose date we know, which
// is the real argument for leaning on them — not just that they are realized prices.
//
// A sale's weight halves every HALF_LIFE_DAYS, so last month's transaction counts for more than one
// from six months ago without ever discarding the older evidence outright (a hard cutoff would take
// a thin segment below the reliability floor and silently drop the anchor altogether).
//
// Caveat worth knowing when reading these numbers: `sold_at` is when the sync NOTICED the piece was
// gone, not the moment it sold, so it lags by up to one sync cycle. Only 1 of 1,421 rows is
// confirmed against a real order. It is an honest ordering of recency, not a precise timestamp.
const HALF_LIFE_DAYS = 180;
export const weightOf = (ageDays: number) => Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS);

/** Quantile over weighted samples: walk the sorted prices until the running weight crosses q. */
export function weightedQuantile(sorted: Array<{ priceCents: number; w: number }>, q: number): number {
 if (!sorted.length) return 0;
 const total = sorted.reduce((s, x) => s + x.w, 0);
 if (total <= 0) return sorted[Math.floor(sorted.length / 2)].priceCents;
 let run = 0;
 for (const x of sorted) {
  run += x.w;
  if (run >= q * total) return x.priceCents;
 }
 return sorted[sorted.length - 1].priceCents;
}

/**
 * Kish effective sample size — how many evenly-weighted sales this weighted set is really worth.
 *
 * Without it the reliability floor becomes a lie: forty sales that are all two years old pass a
 * "n >= 5" check while carrying almost no weight between them. The floor is applied to THIS number,
 * not to the raw count.
 */
export function effectiveN(weights: number[]): number {
 const sum = weights.reduce((a, b) => a + b, 0);
 const sumSq = weights.reduce((a, b) => a + b * b, 0);
 return sumSq > 0 ? (sum * sum) / sumSq : 0;
}

// ── THE SECOND CORPUS: what buyers actually PAID ──
// The golden set above is built from live listings, i.e. asking prices — what stores hope to get.
// Measured against the eval's realized sales it anchors ~31% low, which is the same direction as
// the bias it is supposed to correct. VYA now has ~1,400 real sales with known prices, ~550 of them
// unbranded, so the anchor can be built from money that actually changed hands instead.
// Answer-key hygiene matches eval-price.ts: nothing under $15, no deep-markdown blowouts.
const loadSoldRows = async (): Promise<SoldRow[]> => {
 const sql = db();
 const rows = (await sql`
  SELECT id, store_slug, store_name, title, designer, product_type, final_price,
         GREATEST(0, EXTRACT(epoch FROM (now() - sold_at)) / 86400) AS age_days
  FROM sold_items
  WHERE final_price > 0 AND final_price * 100 >= 1500
    AND (original_price IS NULL OR original_price <= 0 OR final_price >= original_price * 0.5)
 `.catch(() => [])) as Array<Record<string, unknown>>;
 const out: SoldRow[] = [];
 for (const r of rows) {
  const title = (r.title as string) || "";
  // Shopify feeds default `vendor` to the STORE's own name — the same guard the pricer uses.
  const stored = ((r.designer as string) || "").trim();
  const isStoreName = stored.toLowerCase() === String(r.store_name || "").trim().toLowerCase();
  const effBrand = inferBrandFromTitle(title) || (isStoreName ? null : stored || null);
  if (classifyBrand(effBrand) === "known") continue;
  out.push({
   soldId: Number(r.id),
   ageDays: Number(r.age_days) || 0,
   brand: effBrand,
   material: null, // sold_items carries no fibre column, so this corpus buckets by category alone
   category: categoryOf(title, (r.product_type as string) ?? null),
   priceCents: Math.round(Number(r.final_price) * 100),
   sellerId: String(r.store_slug),
  });
 }
 return out;
};

const cachedSoldRows = unstable_cache(loadSoldRows, ["unbranded-sold-rows-v1"], { revalidate: 3600 });
let soldMemo: { at: number; rows: SoldRow[] } | null = null;
async function fetchSoldRows(): Promise<SoldRow[]> {
 try {
  return await cachedSoldRows();
 } catch {
  if (soldMemo && Date.now() - soldMemo.at < MEMO_MS) return soldMemo.rows;
  const rows = await loadSoldRows();
  soldMemo = { at: Date.now(), rows };
  return rows;
 }
}

export type UnbrandedSegment = {
 category: string;
 materialTier: MaterialTier | "unknown";
 count: number;
 storeCount: number;
 p25Cents: number;
 medianCents: number;
 p75Cents: number;
};

/** The full golden-set breakdown for review — every category × material-tier segment with enough
 *  pieces to be meaningful, most-populated first. This is the "go look at how they're priced" view. */
export async function getUnbrandedPricingReport(): Promise<{
 segments: UnbrandedSegment[];
 totalPieces: number;
 unbranded: number;
 lesserKnown: number;
 thinSegments: number;
 note: string;
}> {
 const rows = await fetchGoldenRows();
 const buckets = new Map<string, { cat: string; tier: MaterialTier | "unknown"; prices: number[]; stores: Set<string> }>();
 for (const r of rows) {
 const cat = r.category || "other";
 const tier = materialTier(r.material).tier ?? "unknown";
 const key = `${cat}·${tier}`;
 const b = buckets.get(key) ?? { cat, tier, prices: [], stores: new Set<string>() };
 b.prices.push(r.priceCents);
 b.stores.add(r.sellerId);
 buckets.set(key, b);
 }
 const segments: UnbrandedSegment[] = [];
 let thin = 0;
 for (const b of buckets.values()) {
 if (b.prices.length < MIN_ITEMS) { thin++; continue; }
 const s = b.prices.slice().sort((a, z) => a - z);
 segments.push({ category: b.cat, materialTier: b.tier, count: s.length, storeCount: b.stores.size, p25Cents: quantile(s, 0.25), medianCents: quantile(s, 0.5), p75Cents: quantile(s, 0.75) });
 }
 segments.sort((a, z) => z.count - a.count);
 return {
 segments,
 totalPieces: rows.length,
 unbranded: rows.filter((r) => classifyBrand(r.brand) === "unbranded").length,
 lesserKnown: rows.filter((r) => classifyBrand(r.brand) === "lesser-known").length,
 thinSegments: thin,
 note: `Asking prices across VYA marketplace's unbranded & lesser-known listings (~65 stores), grouped by category × material tier (segments ≥${MIN_ITEMS} pieces; storeCount shows how many stores back each — the pricing anchor additionally requires >1).`,
 };
}

export type UnbrandedBenchmark = { segment: string; medianCents: number; p25Cents: number; p75Cents: number; count: number; storeCount: number;
 /** "sold" = realized prices (preferred); "asking" = live-listing prices, the weaker fallback. */
 basis: "sold" | "asking" };

/** Golden-set anchor for pricing a NEW unbranded piece: the median + range of comparable VYA
 *  unbranded pieces in the same category × material tier. Falls back to the category across all
 *  tiers when the tiered segment is thin, then to null (caller keeps its material-reasoning path). */
export async function getUnbrandedBenchmark(opts: { category: string | null; material: string | null; excludeSoldId?: number | null }): Promise<UnbrandedBenchmark | null> {
 const cat = (opts.category || "").toLowerCase().trim();
 if (!cat) return null;
 const storesOf = (rs: { sellerId: string }[]) => new Set(rs.map((r) => r.sellerId)).size;
 const summarise = (rows: { priceCents: number; sellerId: string }[], seg: string, basis: "sold" | "asking"): UnbrandedBenchmark => {
  const s = rows.map((r) => r.priceCents).sort((a, z) => a - z);
  return { segment: seg, medianCents: quantile(s, 0.5), p25Cents: quantile(s, 0.25), p75Cents: quantile(s, 0.75), count: s.length, storeCount: storesOf(rows), basis };
 };
 /** Same summary, but recent sales weigh more. Only ever used on OUR sales — the only dated comps. */
 const summariseWeighted = (rows: SoldRow[], seg: string): UnbrandedBenchmark => {
  const pts = rows.map((r) => ({ priceCents: r.priceCents, w: weightOf(r.ageDays) })).sort((a, z) => a.priceCents - z.priceCents);
  return {
   segment: seg,
   medianCents: weightedQuantile(pts, 0.5),
   p25Cents: weightedQuantile(pts, 0.25),
   p75Cents: weightedQuantile(pts, 0.75),
   count: rows.length,
   storeCount: storesOf(rows),
   basis: "sold",
  };
 };

 // ── Preferred: what the market actually PAID for comparable unbranded pieces. ──
 // excludeSoldId keeps the price eval honest: an item must never sit inside its own anchor.
 const soldRows = (await fetchSoldRows().catch(() => [] as SoldRow[]))
  .filter((r) => r.category === cat && (opts.excludeSoldId == null || r.soldId !== opts.excludeSoldId));
 // The floor is applied to the EFFECTIVE count, so a segment held up entirely by old sales falls
 // through to the asking-price basis rather than passing on a raw count it cannot support.
 if (effectiveN(soldRows.map((r) => weightOf(r.ageDays))) >= MIN_ITEMS && storesOf(soldRows) >= MIN_STORES) {
  return summariseWeighted(soldRows, `unbranded ${cat} · sold on VYA`);
 }

 // ── Fallback: asking prices on live inventory. Deeper, but it measures hope, not transactions. ──
 const tier = materialTier(opts.material).tier ?? "unknown";
 const rows = await fetchGoldenRows();
 const inCat = rows.filter((r) => r.category === cat);
 const tiered = inCat.filter((r) => (materialTier(r.material).tier ?? "unknown") === tier);
 const pick = tiered.length >= MIN_ITEMS && storesOf(tiered) >= MIN_STORES
  ? { rows: tiered, seg: `unbranded ${cat} · ${tier === "unknown" ? "unspecified fiber" : `${tier} fiber`}` }
  : inCat.length >= MIN_ITEMS && storesOf(inCat) >= MIN_STORES
  ? { rows: inCat, seg: `unbranded ${cat}` }
  : null;
 if (!pick) return null;
 return summarise(pick.rows, pick.seg, "asking");
}
