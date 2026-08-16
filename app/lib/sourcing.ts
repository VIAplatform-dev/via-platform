import { searchListingsDetailed, type DetailedListing } from "./data-layer/ebay";
import { quantile } from "./data-layer/metrics";
import { normalizeCategory } from "./market-data-db";

// ───────────────────────────────────────────────────────────────────────────
// Sourcing — buy-side flip finder (Phase 1: eBay Browse only).
//
// Given a query ("Fendi Baguette"), pull active listings and use the market itself
// as the resale benchmark: the median asking price is what the piece "goes for", so
// a listing priced well BELOW the median is a candidate flip. Runs entirely on the
// read-only Browse API (app token, no seller consent, no new approvals).
//
// Clustering: a broad query returns MIXED product types — a "Fendi Baguette" search
// pulls the bag, but also Baguette *sunglasses*, *watches*, and bag *charms*. Those
// pollute the median AND masquerade as huge "discounts". So we bucket every listing by
// product type and value WITHIN one cluster (apples-to-apples). We can't lean on the
// canonical category alone here: the model name "baguette" lives in the Bags keyword
// list, so generic category inference files Baguette sunglasses as a bag. clusterType()
// checks specific accessory signals FIRST, then falls back to normalizeCategory().
// ───────────────────────────────────────────────────────────────────────────

export type Flip = DetailedListing & {
 type: string;
 marketMedian: number; // the going rate for this product cluster (median asking)
 discountPct: number; // how far below the cluster median (0-100)
 estMargin: number; // marketMedian - price (rough $ upside before fees)
};

export type FlipResult = {
 query: string;
 valuedType: string | null; // the product cluster we valued within
 breakdown: Record<string, number>; // product type -> count, across everything scanned
 marketMedian: number | null; // median of the valued cluster
 p25: number | null;
 p75: number | null;
 sampleSize: number; // priced listings IN the valued cluster
 scanned: number; // total active listings pulled
 minMarginPct: number; // the flag threshold used
 flips: Flip[]; // underpriced listings in the cluster, best discount first
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Disambiguate a listing's product type. Specific accessory words are checked BEFORE
// bag/category keywords so a model name (baguette, boston, speedy…) that collides with a
// category doesn't misfile an accessory as a bag. Falls back to the canonical category.
export function clusterType(title: string): string {
 const t = title.toLowerCase();
 if (/\b(sunglass|sunglasses|eyewear|eyeglass|eyeglasses|optical)\b/.test(t)) return "Sunglasses";
 if (/\b(watch|watches|wristwatch|timepiece)\b/.test(t)) return "Watch";
 if (/\b(charm|keychain|key ?chain|key ?ring|bag charm)\b/.test(t)) return "Charm";
 if (/\b(wallet|card ?holder|card ?case|coin purse)\b/.test(t)) return "Wallet";
 if (/\b(earring|earrings|necklace|bracelet|brooch|pendant|jewelry|jewellery|cufflink)\b/.test(t)) return "Jewelry";
 if (/\b(belt|belts)\b/.test(t)) return "Belt";
 if (/\b(scarf|scarves|shawl|bandana|foulard)\b/.test(t)) return "Scarf";
 if (/\b(shoe|shoes|heel|heels|boot|boots|sneaker|sneakers|sandal|sandals|loafer|loafers|pump|pumps|mule|mules|flat|flats)\b/.test(t)) return "Shoes";
 if (/\b(bag|handbag|tote|clutch|crossbody|satchel|shoulder bag|backpack|purse|hobo|baguette|mamma|zucca|pochette|speedy|neverfull|boston)\b/.test(t)) return "Bag";
 return normalizeCategory(title) ?? "Other";
}

// Find underpriced listings for a query. Buckets results by product type, values within
// one cluster (the caller's `type`, else the most common), and flags listings at least
// `minMarginPct` below that cluster's median. Sorted by biggest discount.
export async function findFlips(
 query: string,
 opts?: { limit?: number; minMarginPct?: number; type?: string },
): Promise<FlipResult> {
 const limit = opts?.limit ?? 50;
 const minMarginPct = opts?.minMarginPct ?? 25;
 const listings = await searchListingsDetailed(query, limit);
 const typed = listings.map((l) => ({ ...l, type: clusterType(l.title) }));

 const breakdown: Record<string, number> = {};
 for (const l of typed) breakdown[l.type] = (breakdown[l.type] ?? 0) + 1;

 // Which cluster to value: the caller's pick if present, else the most common type.
 const valuedType =
  opts?.type && breakdown[opts.type]
   ? opts.type
   : Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

 const inCluster = typed.filter((l) => l.type === valuedType);
 const prices = inCluster.map((l) => l.price).filter((p) => p > 0);
 const median = quantile(prices, 0.5);

 const base: FlipResult = {
  query,
  valuedType,
  breakdown,
  marketMedian: median != null ? round2(median) : null,
  p25: prices.length ? round2(quantile(prices, 0.25) ?? 0) : null,
  p75: prices.length ? round2(quantile(prices, 0.75) ?? 0) : null,
  sampleSize: prices.length,
  scanned: listings.length,
  minMarginPct,
  flips: [],
 };
 if (median == null || median <= 0) return base;

 const flips: Flip[] = inCluster
  .map((l) => {
   const discountPct = Math.round((1 - l.price / median) * 100);
   return { ...l, marketMedian: round2(median), discountPct, estMargin: round2(median - l.price) };
  })
  .filter((f) => f.discountPct >= minMarginPct)
  .sort((a, b) => b.discountPct - a.discountPct);

 return { ...base, flips };
}
