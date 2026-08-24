// Comp selection — deciding WHICH comps a price is allowed to be built from.
//
// The measured problem this exists to fix: the comps the pricer kept disagreed with each other by
// roughly 3x (one saying $400 and another $1,200 for the same piece), and the estimate was then built
// from all of them together. Every headline failure traced back here:
//
//   • point accuracy   — 24% of items within ±20% of what they actually sold for
//   • the low–high band — a fixed ±15% cushion around a point estimate that was itself wrong
//   • category bias    — Tops −44%, Bags −39%, Dresses +12%
//
// Those are one problem wearing three hats. A set of comps that disagrees 3x has no median worth
// quoting, and no honest band narrower than the disagreement itself.
//
// The approach here is deliberately DETERMINISTIC and runs BEFORE the model sees anything. The model
// is good at judging whether a specific comp is the same garment; it is not good at noticing that the
// eight things it kept span a factor of three. That second job is arithmetic, so it is done in code:
//
//   1. Garment gate   — a bag never prices a dress (normalizeCategory, the platform's canonical
//                       bucketing, so these numbers reconcile with every other surface).
//   2. Model gate     — a Kelly never prices a Birkin (existing filterModelConflicts).
//   3. Same-piece gate— when the SAME garment has been found by reverse image, keyword matches stop
//                       setting the PRICE and start setting the RANGE. Two photos of the piece in
//                       hand beat twenty things that merely share words with it — but those twenty
//                       are still a real measurement of how much a piece like this varies, and two
//                       listings agreeing at $820 and $880 does not mean the market is that precise.
//                       Nothing is thrown away; the two kinds of evidence do different jobs.
//   4. Cluster        — split what remains at real price gaps and keep the dominant cluster, so a
//                       $300 diffusion dress and a $2,000 archival one stop being averaged into a
//                       $1,150 answer that is wrong for both.
//
// What falls out for free: once the kept set is coherent, its own p25–p75 IS the band. The old fixed
// cushion existed because the point estimate couldn't be trusted; a cohesive cluster reports its
// honest spread instead of a decorative one.

import { filterModelConflicts, type Comp } from "./comps.ts";
import { normalizeCategory } from "./market-data-db.ts";

/** Why a set of comps ended up being the basis for a price — surfaced so a wrong price is diagnosable. */
export type CompBasis =
 | "same-piece" // reverse-image matches for THIS garment; the strongest evidence available
 | "cluster" // the dominant price cluster among true comparables
 | "thin" // too few comps to cluster; priced with low confidence
 | "none"; // nothing usable survived filtering

export type CompSelection = {
 /** The comps the PRICE is built from. */
 kept: Comp[];
 /**
  * Comps that don't set the price but do inform the RANGE. When reverse image has found this exact
  * garment, other similar pieces are the wrong LEVEL (they're different garments) but they are a
  * real observation of how much a piece like this VARIES — so their spread is borrowed even though
  * their prices are not. Empty unless the basis is "same-piece".
  */
 context: Comp[];
 /** Everything that survived the gates but sat outside the dominant cluster. Kept for explanation. */
 rejected: Comp[];
 basis: CompBasis;
 medianCents: number | null;
 p25Cents: number | null;
 p75Cents: number | null;
 /** p75 / p25 of the kept set — the "3x disagreement" number, now measured rather than inferred. */
 spreadRatio: number | null;
 n: number;
 /** 0..1. Drives whether a price is shown confidently, hedged, or withheld. */
 confidence: number;
 /**
  * The band to quote, in cents. On a same-piece basis this is the piece's own spread widened by how
  * much comparable pieces vary — so two listings that happen to agree at $820 and $880 don't imply
  * the market is that precise.
  */
 bandLowCents: number | null;
 bandHighCents: number | null;
 dropped: { garment: number; model: number; nonCluster: number };
};

const cents = (c: Comp) => c.priceCents;
const priced = (comps: Comp[]) => comps.filter((c) => cents(c) > 0);

export function percentile(sortedAsc: number[], q: number): number | null {
 if (!sortedAsc.length) return null;
 const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((sortedAsc.length - 1) * q)));
 return sortedAsc[i];
}

/**
 * Split prices into clusters at REAL gaps. Works in ratio space, not absolute distance, because
 * resale prices are multiplicative: $40→$80 and $2,000→$4,000 are the same size of disagreement,
 * and an absolute threshold would shred the cheap end while merging the expensive one.
 *
 * `gap` is the ratio between neighbouring prices that counts as a boundary. 1.8 is deliberately
 * loose — it keeps genuine condition and size variation of one garment together, while separating
 * the diffusion-vs-archival split that was destroying Bags and Tops.
 */
export function clusterByRatio(pricesAsc: number[], gap = 1.8): number[][] {
 if (!pricesAsc.length) return [];
 const out: number[][] = [[pricesAsc[0]]];
 for (let i = 1; i < pricesAsc.length; i++) {
  const prev = pricesAsc[i - 1];
  const cur = pricesAsc[i];
  if (prev > 0 && cur / prev >= gap) out.push([cur]);
  else out[out.length - 1].push(cur);
 }
 return out;
}

/**
 * Pick the cluster a price should be built from. Biggest wins — the level a piece REPEATEDLY trades
 * at is the level most comps sit at. Ties break toward the LOWER cluster, matching the existing
 * rare-variant rule: a typical example is not priced at the level a few collector variants reach.
 */
export function dominantCluster(clusters: number[][]): number[] {
 if (!clusters.length) return [];
 let best = clusters[0];
 for (const c of clusters) {
  if (c.length > best.length) best = c;
  else if (c.length === best.length && c[0] < best[0]) best = c;
 }
 return best;
}

/**
 * How much to trust a price built from this set. Two independent things make a comp set weak, and
 * they multiply: too FEW comps (small sample) and comps that DISAGREE (wide spread). The old
 * pipeline reported a single confidence that reflected neither.
 */
export function scoreConfidence(n: number, spreadRatio: number | null, basis: CompBasis): number {
 if (!n) return 0;
 const bySize = n >= 8 ? 1 : n >= 5 ? 0.85 : n >= 3 ? 0.65 : n === 2 ? 0.45 : 0.3;
 const s = spreadRatio ?? 1;
 const bySpread = s <= 1.4 ? 1 : s <= 1.8 ? 0.9 : s <= 2.5 ? 0.75 : s <= 3.5 ? 0.55 : 0.4;
 // Same-piece evidence earns a modest lift, never a free pass — two photos of one garment is still
 // a sample of two, and the size term above already says so.
 const byBasis = basis === "same-piece" ? 1.15 : 1;
 return Math.max(0, Math.min(1, bySize * bySpread * byBasis));
}

/**
 * The tightest price window holding the most comps.
 *
 * Gap-splitting alone is not enough, and the replay over 362 real cached comp sets is what proved it:
 * it cut the median disagreement only from 2.92x to 2.57x and moved the typical estimate by 1.1%.
 * The reason is that gap-splitting waits for a CHASM between neighbouring prices, and real comp sets
 * don't have one — fifteen comps spanning 3x sit only ~8% apart from each other, so no gap ever
 * trips and the whole 3x spread survives as a single "cluster".
 *
 * A density window doesn't wait. It slides a fixed-ratio window (default 2x) across the sorted
 * prices and keeps whichever position covers the most comps: the level the piece actually trades at
 * is, by definition, where the comps pile up. Ties break toward the tighter window, then the lower
 * one — same rare-variant reasoning as dominantCluster.
 */
export function densestWindow(pricesAsc: number[], ratio = 2): number[] {
 if (pricesAsc.length <= 1) return [...pricesAsc];
 let best: number[] = [];
 for (let i = 0; i < pricesAsc.length; i++) {
  const lo = pricesAsc[i];
  if (lo <= 0) continue;
  let j = i;
  while (j + 1 < pricesAsc.length && pricesAsc[j + 1] <= lo * ratio) j++;
  const win = pricesAsc.slice(i, j + 1);
  if (
   win.length > best.length ||
   (win.length === best.length && best.length > 0 && win[win.length - 1] / win[0] < best[best.length - 1] / best[0])
  ) best = win;
 }
 return best.length ? best : [...pricesAsc];
}

/**
 * How much comparable pieces vary, as ratios around their own median. Applied to a same-piece median
 * this transfers the VARIATION without transferring the LEVEL — which is the whole point, since the
 * level is exactly what's wrong about a different garment.
 *
 * Clamped because an incoherent context set would otherwise reproduce the band that made the earlier
 * experiment useless: raw percentiles gave ranges averaging 445% of the price, right most of the time
 * and worth nothing. The measured market noise floor is ~25% median deviation, so a band beyond
 * roughly 0.6x-1.6x is not describing this piece any more.
 */
export function contextSpreadRatios(contextPrices: number[]): { lo: number; hi: number } | null {
 const sorted = contextPrices.filter((p) => p > 0).sort((a, b) => a - b);
 if (sorted.length < 3) return null; // too few to say anything about variation
 const med = percentile(sorted, 0.5);
 const p25 = percentile(sorted, 0.25);
 const p75 = percentile(sorted, 0.75);
 if (!med || !p25 || !p75 || med <= 0) return null;
 const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
 return { lo: clamp(p25 / med, 0.6, 1), hi: clamp(p75 / med, 1, 1.6) };
}

/** Comps whose garment type conflicts with the query's. Comps with no readable type are kept. */
export function filterGarmentConflicts(comps: Comp[], query: string): Comp[] {
 const want = normalizeCategory(query);
 if (!want) return comps; // query has no garment signal — nothing to conflict with
 return comps.filter((c) => {
  const got = normalizeCategory(c.title || "");
  return !got || got === want; // unreadable title gets the benefit of the doubt
 });
}

/**
 * The whole selection, start to finish. Pure: no network, no model, no clock — so it is testable and
 * it produces the same answer for the same comps every time, which the model-only path never did.
 */
export function selectComps(comps: Comp[], query: string, opts?: { gap?: number; minCluster?: number; window?: number }): CompSelection {
 const gap = opts?.gap ?? 1.8;
 const minCluster = opts?.minCluster ?? 3;
 const empty: CompSelection = {
  kept: [], context: [], rejected: [], basis: "none", medianCents: null, p25Cents: null, p75Cents: null,
  spreadRatio: null, n: 0, confidence: 0, bandLowCents: null, bandHighCents: null,
  dropped: { garment: 0, model: 0, nonCluster: 0 },
 };

 const all = priced(comps);
 if (!all.length) return empty;

 // ── Gates ──
 const afterGarment = filterGarmentConflicts(all, query);
 const droppedGarment = all.length - afterGarment.length;
 const afterModel = filterModelConflicts(afterGarment, query);
 const droppedModel = afterGarment.length - afterModel.length;

 // A gate that removes EVERYTHING was wrong about this query, not about the comps — fall back rather
 // than pricing off nothing. (Same defensive stance filterModelConflicts's caller already takes.)
 let pool = afterModel.length ? afterModel : afterGarment.length ? afterGarment : all;

 // ── Same-piece gate ──
 // Reverse image found THIS garment. Keyword matches are a DIFFERENT garment that shares words, so
 // they stop setting the price — blending them is what let a cluster of look-alikes outvote the
 // actual piece. They are retained as `context`: still the wrong level, still a real measurement of
 // how much pieces like this vary, which is what the band needs.
 const exact = pool.filter((c) => c.exactPiece);
 const basisIsExact = exact.length >= 2;
 const context = basisIsExact ? pool.filter((c) => !c.exactPiece) : [];
 if (basisIsExact) pool = exact;

 // ── Cluster ──
 const sorted = [...pool].sort((a, b) => cents(a) - cents(b));
 // Two passes: the gap split removes cleanly-separated outliers (a $12 phone case among $900
 // dresses), then the density window handles the common case the replay exposed — a continuous
 // smear of prices with no gap to split on.
 const clusters = clusterByRatio(sorted.map(cents), gap);
 const gapWinner = dominantCluster(clusters);
 const winner = densestWindow(gapWinner, opts?.window ?? 2);

 // Below the floor there is nothing to cluster — say so and price with low confidence rather than
 // pretending a set of two has a meaningful median.
 const thin = winner.length < minCluster;
 const lo = winner[0];
 const hi = winner[winner.length - 1];
 const keptList = thin ? sorted : sorted.filter((c) => cents(c) >= lo && cents(c) <= hi);
 const rejected = sorted.filter((c) => !keptList.includes(c));

 const prices = keptList.map(cents).sort((a, b) => a - b);
 const p25 = percentile(prices, 0.25);
 const p75 = percentile(prices, 0.75);
 const med = percentile(prices, 0.5);
 const spread = p25 && p25 > 0 && p75 ? p75 / p25 : null;
 const basis: CompBasis = basisIsExact ? "same-piece" : thin ? "thin" : "cluster";

 // ── Band ──
 // Start from what the kept comps themselves say. On a same-piece basis, widen by how much
 // comparable pieces vary: two listings of one garment agreeing closely is not evidence that the
 // market for it is precise, only that two sellers picked similar numbers.
 let bandLow = p25, bandHigh = p75;
 if (basis === "same-piece" && med) {
  const ratios = contextSpreadRatios(context.map(cents));
  if (ratios) {
   bandLow = Math.min(bandLow ?? med, Math.round(med * ratios.lo));
   bandHigh = Math.max(bandHigh ?? med, Math.round(med * ratios.hi));
  }
 }

 return {
  kept: keptList,
  context,
  rejected,
  basis,
  medianCents: med,
  p25Cents: p25,
  p75Cents: p75,
  spreadRatio: spread,
  n: keptList.length,
  confidence: scoreConfidence(keptList.length, spread, basis),
  bandLowCents: bandLow,
  bandHighCents: bandHigh,
  dropped: { garment: droppedGarment, model: droppedModel, nonCluster: rejected.length },
 };
}

/**
 * Whether a price built from this selection is safe to show a seller unhedged.
 *
 * This is the part the old pipeline had no way to express: it always produced a number. A seller is
 * better served by "we can't price this confidently, tell us the brand" than by a confident $90 on a
 * $600 dress — and the question flow that follows is the thing that turns a refusal into an answer.
 */
export function isConfidentEnough(sel: CompSelection, floor = 0.5): boolean {
 return sel.basis !== "none" && sel.confidence >= floor;
}
