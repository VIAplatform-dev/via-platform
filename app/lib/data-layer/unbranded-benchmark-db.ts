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
 // Prefer the material-tiered segment, then the whole category — each only if it's both deep
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
