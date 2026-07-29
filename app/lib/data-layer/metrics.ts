// ───────────────────────────────────────────────────────────────────────────
// Data Layer — metric math (pure functions, no I/O).
//
// Every number a seller sees comes from here, so it's all unit-tested. A wrong
// sourcing metric makes a seller lose money, so the rules are explicit and the
// edge cases (empty data, single segment, zero supply) are handled, not assumed.
// See METRICS.md for the plain-language definitions.
// ───────────────────────────────────────────────────────────────────────────

import type { DEMAND_WEIGHTS } from "./config";

export type DemandWeights = typeof DEMAND_WEIGHTS;
export type EngagementCounts = { views: number; saves: number; clicks: number; orders: number };
export type Trend = "rising" | "falling" | "flat";

// Raw weighted demand for one segment over one window.
export function rawDemand(c: EngagementCounts, w: DemandWeights): number {
 return c.views * w.view + c.saves * w.save + c.clicks * w.click + c.orders * w.order;
}

/**
 * Percentile rank (0–100) of each value within the set: the share of OTHER
 * segments it beats. Lowest → 0, highest → 100, ties share a rank. This is the
 * Demand Index scale — "82" means hotter than 82% of the field, which is stable
 * even as absolute volumes grow. A lone segment scores 100.
 */
export function percentileRanks(values: number[]): number[] {
 const n = values.length;
 if (n === 0) return [];
 if (n === 1) return [100];
 return values.map((v) => {
 const below = values.reduce((acc, x) => acc + (x < v ? 1 : 0), 0);
 return Math.round((below / (n - 1)) * 100);
 });
}

/**
 * Classify this period's raw demand vs the prior equal period. Outside the
 * dead-band → rising/falling; inside → flat. From a zero base, any demand is
 * rising. Avoids treating noise as a trend.
 */
export function classifyTrend(current: number, prior: number, band: number): Trend {
 if (prior <= 0) return current > 0 ? "rising" : "flat";
 const delta = (current - prior) / prior;
 if (delta > band) return "rising";
 if (delta < -band) return "falling";
 return "flat";
}

// Linear-interpolation quantile over a numeric array (q in [0,1]). null if empty.
export function quantile(values: number[], q: number): number | null {
 if (values.length === 0) return null;
 const s = [...values].sort((a, b) => a - b);
 if (s.length === 1) return s[0];
 const pos = (s.length - 1) * q;
 const lo = Math.floor(pos);
 const hi = Math.ceil(pos);
 if (lo === hi) return s[lo];
 return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export type PriceBenchmark = { p25: number | null; median: number | null; p75: number | null };

// 25th / median / 75th percentile of realized sale prices for a segment.
export function priceBenchmark(prices: number[]): PriceBenchmark {
 const round2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
 return {
 p25: round2(quantile(prices, 0.25)),
 median: round2(quantile(prices, 0.5)),
 p75: round2(quantile(prices, 0.75)),
 };
}

export function median(values: number[]): number | null {
 return quantile(values, 0.5);
}

/**
 * Sell-through %: units sold over the window ÷ items currently in stock for the
 * segment. null when there's no active supply to measure against (a rate over
 * zero is meaningless, not "0%").
 */
export function sellThroughPct(orders: number, activeSupply: number): number | null {
 if (activeSupply <= 0) return null;
 return Math.round((orders / activeSupply) * 1000) / 10;
}

/**
 * Supply gap (0–100): how much demand outruns supply. demandIndex minus the
 * segment's supply percentile, clamped to [0,100]. High demand + thin stock →
 * high gap = a sourcing opportunity.
 */
export function supplyGapScore(demandIndex: number, supplyPercentile: number): number {
 return Math.max(0, Math.min(100, Math.round(demandIndex - supplyPercentile)));
}

// "Source Now" score (0–100): how strong a sourcing opportunity a segment is RIGHT NOW.
// It rewards demand and a supply gap equally (buyers want it AND few stores carry it), then
// scales by momentum — a rising segment is the window, a falling one is closing. Pure blend of
// signals we measure with confidence (demand index, trend, supply gap); price is context, not score.
export function sourceNowScore(demandIndex: number, trend: Trend, supplyGap: number): number {
 const momentum = trend === "rising" ? 1.15 : trend === "falling" ? 0.7 : 1;
 return Math.max(0, Math.min(100, Math.round((0.5 * demandIndex + 0.5 * supplyGap) * momentum)));
}

export type SourcingThresholds = { hotDemand: number; warmDemand: number; underSupplied: number; strongSellThrough: number };
export type VerdictRating = "source" | "buy-sharp" | "selective" | "pass";
export type SourcingVerdict = { rating: VerdictRating; headline: string; detail: string };

/**
 * Turn a segment's signals into a plain-language "should I buy this?" answer.
 * Drives the demand-search result card. Pure + tested — a wrong call costs a
 * seller money, so the rules are explicit and the thresholds come from config.
 */
export function sourcingVerdict(
 m: { demandIndex: number; demandTrend: Trend; supplyGapScore: number; sellThroughPct: number | null },
 t: SourcingThresholds,
): SourcingVerdict {
 const cooling = m.demandTrend === "falling";
 const heating = m.demandTrend === "rising";
 const trendNote = heating ? " and heating up" : cooling ? " but cooling" : "";

 if (m.demandIndex >= t.hotDemand) {
 if (m.supplyGapScore >= t.underSupplied) {
  return {
  rating: "source",
  headline: "Source it",
  detail: `Strong demand${trendNote}, and supply is thin — this is what shoppers want and few stores have it.`,
  };
 }
 return {
 rating: "buy-sharp",
 headline: "Buy only at a sharp price",
 detail: `In demand${trendNote}, but already well-stocked across stores — you'll be competing, so margin depends on buying low.`,
 };
 }
 if (m.demandIndex >= t.warmDemand) {
 return {
 rating: "selective",
 headline: "Be selective",
 detail: `Moderate demand${trendNote}. Worth it for standout pieces or at the right price, not as a staple.`,
 };
 }
 // Soft demand — but if the few pieces listed sell through fast (and we have
 // enough sales to trust that rate), it's a niche worth a selective look.
 if (m.sellThroughPct != null && m.sellThroughPct >= t.strongSellThrough) {
 return {
 rating: "selective",
 headline: "Niche but it moves",
 detail: `Lower overall demand${trendNote}, but listed pieces sell through fast — worth it for the right find.`,
 };
 }
 return {
 rating: "pass",
 headline: cooling ? "Pass" : "Lean pass",
 detail: `Soft demand${trendNote}. Skip unless you can buy low and flip cheap.`,
 };
}

// ── Blended verdict (VYA demand + eBay comps) ──
// Fixes the cold-start problem: when VYA data is thin, lean on eBay; as VYA
// grows it takes over. Pure + tested so the blend logic is auditable.
export type VyaSignal = { demandIndex: number; demandTrend: Trend; supplyGapScore: number; sellThroughPct: number | null } | null;
export type EbaySignal = { medianPrice: number | null; activeCount: number | null; soldPer30d?: number | null } | null;
export type GoogleSignal = { momentumPct: number | null; breakout?: boolean } | null;
export type BlendThresholds = SourcingThresholds & { ebaySaturatedListings: number; ebaySellsWellPer30d: number };
export type BlendedVerdict = SourcingVerdict & { basis: "vya" | "vya+ebay" | "ebay-sold" | "ebay-browse" | "google" | "none" };

export function blendedVerdict(vya: VyaSignal, ebay: EbaySignal, t: BlendThresholds, google?: GoogleSignal): BlendedVerdict {
 const haveEbay = !!ebay && (ebay.medianPrice != null || ebay.activeCount != null || ebay.soldPer30d != null);
 if (!vya && !haveEbay) {
 // No VYA and no eBay — but Google Search is a LEADING signal, so use it rather than shrug. It's
 // unconfirmed (interest ≠ resale demand), so the calls stay soft.
 const g = google && google.momentumPct != null ? google.momentumPct : null;
 if (g != null) {
 if (g >= 20 || google?.breakout) return { rating: "selective", headline: "Worth a watch", detail: `Google search is climbing (+${g}%) — a leading signal, but no VYA or eBay confirmation yet. Source cautiously.`, basis: "google" };
 if (g <= -20) return { rating: "pass", headline: "Cooling", detail: `Google search is falling (${g}%) with no VYA or eBay signal — not a sourcing moment.`, basis: "google" };
 return { rating: "pass", headline: "Quiet", detail: `Flat search interest (${g >= 0 ? "+" : ""}${g}%) and no VYA or eBay signal — little to act on.`, basis: "google" };
 }
 return { rating: "pass", headline: "Not enough data", detail: "Not enough market signal on this yet to make a confident call.", basis: "none" };
 }
 const saturated = !!ebay && ebay.activeCount != null && ebay.activeCount >= t.ebaySaturatedListings;

 // VYA demand present → lead with it; eBay adds saturation + price context.
 if (vya) {
 const base = sourcingVerdict(vya, t);
 if (base.rating === "source" && saturated) {
 return { rating: "buy-sharp", headline: "Buy at a sharp price", detail: `${base.detail.replace(/\.$/, "")} — but it's heavily listed on eBay too, so buy low.`, basis: "vya+ebay" };
 }
 return { ...base, basis: haveEbay ? "vya+ebay" : "vya" };
 }

 // No VYA, but eBay SOLD velocity (Insights) → eBay-led verdict.
 if (ebay && ebay.soldPer30d != null) {
 const moves = ebay.soldPer30d >= t.ebaySellsWellPer30d;
 if (moves && !saturated) return { rating: "source", headline: "Source it", detail: `Sells well on eBay (~${ebay.soldPer30d}/mo) and isn't over-listed.`, basis: "ebay-sold" };
 if (moves && saturated) return { rating: "buy-sharp", headline: "Buy at a sharp price", detail: `Sells on eBay but it's heavily listed — margin depends on buying low.`, basis: "ebay-sold" };
 return { rating: "pass", headline: "Lean pass", detail: `Slow mover on eBay (~${ebay.soldPer30d}/mo).`, basis: "ebay-sold" };
 }

 // No VYA, eBay browse only → price anchor, soft call (judge on cost).
 const price = ebay?.medianPrice != null ? `~$${Math.round(ebay.medianPrice)}` : "an unclear amount";
 const listed = ebay?.activeCount != null ? ` with ${ebay.activeCount} listed` : "";
 return {
 rating: "selective",
 headline: "Judge on your cost",
 detail: `Not enough VYA demand on this yet. On eBay it asks ${price}${listed} — worth it only if you can buy well under that.`,
 basis: "ebay-browse",
 };
}
