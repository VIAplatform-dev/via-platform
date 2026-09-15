import { neon } from "@neondatabase/serverless";
import { inferBrandFromTitle } from "../market-data-db";
import { unstable_cache } from "next/cache";
import { inferCategoryFromTitle } from "../loadStoreProducts";
import { materialTier, type MaterialTier } from "../material-tier";

// THE GOLDEN SET: how VYA's OWN unbranded + lesser-known pieces are actually priced, read straight
// from live inventory and grouped by garment category × material tier. For a piece with no brand and
// no exact comps, this is the strongest anchor there is: real prices set by ~45 curated stores for
// the same kind of item, not model guesswork. Asking + sold, gated to a reliability floor per
// segment. Computed live (pilot-scale items table); can move to the nightly snapshot when it grows.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

const MIN_ITEMS = 5; // a segment below this is too thin to trust as an anchor
const MIN_STORES = 2; // and it must span >1 store, so the anchor is a market signal, not one store's bias
export { classifyBrand, type BrandClass } from "./unbranded-benchmark-core.ts";
import { classifyBrand } from "./unbranded-benchmark-core.ts";

function quantile(sorted: number[], q: number): number {
 if (!sorted.length) return 0;
 return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

type Row = { brand: string | null; material: string | null; category: string; priceCents: number; sellerId: string };

// Category is INFERRED from the title (the codebase convention: brand/category are inferred, not
// stored. Using the same canonical inferrer the pricing engine keys on, so buckets line up with
// the benchmark lookup). Falls back to the synced product_type, then "other".
function categoryOf(title: string, stored: string | null): string {
 const inferred = inferCategoryFromTitle(title || "");
 return String(inferred || (stored || "").trim() || "other").toLowerCase();
}

// Read the GOLDEN SET from the MARKETPLACE catalog (`products`). ~65 stores of live listings, far
// richer than the pilot OS `items` table. Cached for an hour: the set barely moves minute-to-minute
// and this scan feeds both the report and the per-price benchmark lookup. Prices are ASKING (live
// listings), which is exactly "how the stores price these pieces".
const fetchGoldenRows = unstable_cache(
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
 },
 ["unbranded-golden-rows-v1"],
 { revalidate: 3600 },
);

export type UnbrandedSegment = {
 category: string;
 materialTier: MaterialTier | "unknown";
 count: number;
 storeCount: number;
 p25Cents: number;
 medianCents: number;
 p75Cents: number;
};

/** The full golden-set breakdown for review. Every category × material-tier segment with enough
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
 note: `Asking prices across VYA marketplace's unbranded & lesser-known listings (~65 stores), grouped by category × material tier (segments ≥${MIN_ITEMS} pieces; storeCount shows how many stores back each. The pricing anchor additionally requires >1).`,
 };
}

export type UnbrandedBenchmark = { segment: string; medianCents: number; p25Cents: number; p75Cents: number; count: number; storeCount: number };

/** Golden-set anchor for pricing a NEW unbranded piece: the median + range of comparable VYA
 *  unbranded pieces in the same category × material tier. Falls back to the category across all
 *  tiers when the tiered segment is thin, then to null (caller keeps its material-reasoning path). */
export async function getUnbrandedBenchmark(opts: { category: string | null; material: string | null }): Promise<UnbrandedBenchmark | null> {
 const cat = (opts.category || "").toLowerCase().trim();
 if (!cat) return null;
 const tier = materialTier(opts.material).tier ?? "unknown";
 const rows = await fetchGoldenRows();
 const inCat = rows.filter((r) => r.category === cat);
 const tiered = inCat.filter((r) => (materialTier(r.material).tier ?? "unknown") === tier);
 const storesOf = (rs: Row[]) => new Set(rs.map((r) => r.sellerId)).size;
 // Prefer the material-tiered segment, then the whole category. Each only if it's both deep
 // enough AND spans >1 store (else it's just one store's pricing, not a market anchor).
 const pick = tiered.length >= MIN_ITEMS && storesOf(tiered) >= MIN_STORES
 ? { rows: tiered, seg: `unbranded ${cat} · ${tier === "unknown" ? "unspecified fiber" : `${tier} fiber`}` }
 : inCat.length >= MIN_ITEMS && storesOf(inCat) >= MIN_STORES
 ? { rows: inCat, seg: `unbranded ${cat}` }
 : null;
 if (!pick) return null;
 const s = pick.rows.map((r) => r.priceCents).sort((a, z) => a - z);
 return {
 segment: pick.seg,
 medianCents: quantile(s, 0.5),
 p25Cents: quantile(s, 0.25),
 p75Cents: quantile(s, 0.75),
 count: s.length,
 storeCount: new Set(pick.rows.map((r) => r.sellerId)).size,
 };
}
