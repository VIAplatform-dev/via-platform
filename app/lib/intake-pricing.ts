import { estimatePrice, getMarketReferenceFast, computePriceFlag, type PriceEstimate, type PriceFlag } from "./price-engine";
import { getMinMarkupBps } from "./store-pricing-db";
import { getStorePricingSignal, getVisualVyaComps } from "./intake-memory-db";
import { getStoreBrief, briefPricingTarget } from "./store-brief-db";
import { fetchResaleTrend, type Comp } from "./comps";
import { identifyRunway, isIntakeConfigured } from "./ai-intake";
import { getPieceRunway, savePieceRunway } from "./comp-cache-db";
import { gate } from "./concurrency";

// Shared by the intake route and the phase-2 pricing endpoint so both compute price + runway
// identically. Split out so the listing form can render the drafted FIELDS first (fast) and
// slot the price/flag/runway in a moment later (this module), instead of blocking on everything.

const AI_GATE = () => gate("intake-ai", Number(process.env.INTAKE_AI_CONCURRENCY) || 3);

/**
 * The multiplier to apply to market value for THIS store's suggested price. Blends
 * what we've LEARNED from their behavior (getStorePricingSignal) with what the owner
 * TOLD us in their brief (briefPricingTarget): the owner's stance just NUDGES the
 * learned number by default (weight ~0.3), but the more hands-on they price — high
 * conviction, i.e. they "keep changing the price a lot" — the more their stated intent
 * leads (up to ~0.85). With no learned signal yet, the owner's stance drives outright.
 */
async function resolveStoreMultiplier(slug: string): Promise<{ mult: number; note: string }> {
 const [signal, brief] = await Promise.all([
 getStorePricingSignal(slug).catch(() => ({ inferredMult: 1, hasSignal: false, conviction: 0 })),
 getStoreBrief(slug).catch(() => null),
 ]);
 const clamp = (m: number) => Math.min(2.5, Math.max(0.6, m));
 const ownerTarget = briefPricingTarget(brief);
 if (ownerTarget == null) return { mult: signal.inferredMult, note: "for this store's pricing" };
 if (!signal.hasSignal) return { mult: clamp(ownerTarget), note: "per your pricing stance" };
 const w = Math.min(0.85, Math.max(0.3, 0.3 + 0.55 * signal.conviction));
 return { mult: clamp(signal.inferredMult * (1 - w) + ownerTarget * w), note: "for this store's pricing" };
}

export function titleHasBrand(title: string, brand: string): boolean {
 const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
 const b = norm(brand);
 return b.length >= 3 && norm(title).includes(b);
}

// Resellers date archival pieces in their titles (e.g. "Prada F/W 1998 leather skirt").
// Mine the SAME-BRAND comp/match titles for the most-cited season+year → runway string.
export function extractRunway(brand: string, titles: string[]): string | null {
 if (!brand) return null;
 const tally = new Map<string, number>();
 for (const t of titles) {
 if (!titleHasBrand(t, brand)) continue;
 const year = t.match(/\b(199\d|20[01]\d)\b/)?.[0];
 if (!year) continue;
 const low = t.toLowerCase();
 const season = /(s\/s|\bss\b|spring|resort|cruise)/.test(low) ? "S/S"
 : /(f\/w|a\/w|\bfw\b|\baw\b|fall|autumn|winter)/.test(low) ? "F/W" : "";
 if (!season) continue;
 const key = `${season} ${year}`;
 tally.set(key, (tally.get(key) || 0) + 1);
 }
 let best: string | null = null, n = 0;
 for (const [k, v] of tally) if (v > n) { best = k; n = v; }
 return best ? `${brand} ${best}` : null;
}

/**
 * Compute the price estimate + over/under-market flag + runway for a listing. When the seller
 * typed a price we only GRADE it (fast owned-data reference); otherwise we run the full valuation
 * to SUGGEST one. Runway: seller/draft value → piece cache → comp mining → a proactive vision
 * pass (only when the full draft was skipped) → cached for reuse.
 */
export async function computeListingPricing(opts: {
 slug: string;
 brand: string;
 title: string;
 era: string;
 material: string;
 category: string;
 condition?: string; // seller/AI condition note — swings resale price, so it's fed to the valuation
 conditionGrade?: string; // canonical grade (Phase 4) → explicit price-band multiplier
 searchQuery?: string | null; // AI's tight "brand + specific model + era" comp phrase
 price: string | null; // seller's typed price in dollars; null/"" → suggest one
 imageUrls: string[];
 mainUrl: string;
 extraComps: Comp[]; // reverse-image comps for the valuation
 reverseTitles: string[]; // reverse-image match titles, for runway mining
 embedding?: number[]; // the intake photo embedding — for VYA visual price comps (already computed, no extra cost)
 knowledgeHintCents: number | null;
 runwaySoFar: string | null; // runway the seller/draft already provided
 draftRanFull: boolean; // did the full vision draft run? gates the proactive runway pass
}): Promise<{ estimate: PriceEstimate | null; priceFlag: PriceFlag | null; runway: string | null }> {
 const brandVal = opts.brand.trim();
 const baseTitle = opts.title || [opts.era, opts.material, opts.category].filter(Boolean).join(" ");
 const brandTitle = brandVal && !baseTitle.toLowerCase().includes(brandVal.toLowerCase()) ? `${brandVal} ${baseTitle}` : baseTitle;
 // A tight AI search phrase (brand + specific model + era) finds SAME-PIECE comps far better than
 // the SEO title — prefer it, but only when it actually carries the (authoritative) brand.
 const sq = (opts.searchQuery || "").trim();
 const query = sq && (!brandVal || sq.toLowerCase().includes(brandVal.toLowerCase())) ? sq : brandTitle;
 const needPrice = !opts.price || !opts.price.trim();

 // VYA pieces that LOOK like this one → strong comps, even when the brand is unknown/wrong.
 // Reuses the intake embedding, so no extra Voyage cost. Merged into the reverse-image comps.
 const visualComps = opts.embedding?.length ? await getVisualVyaComps(opts.embedding).catch(() => []) : [];
 const comps = [...opts.extraComps, ...visualComps];

 let estimate: PriceEstimate | null = null;
 let priceFlag: PriceFlag | null = null;
 if (needPrice) {
 // No price typed → full valuation to SUGGEST a price (accurate, slower path).
 const minMarkupBps = await getMinMarkupBps(opts.slug).catch(() => 3000);
 const trendQuery = brandVal ? (opts.category ? `${brandVal} ${opts.category}` : brandVal) : "";
 const trend = trendQuery ? await fetchResaleTrend(trendQuery).catch(() => null) : null;
 estimate = await AI_GATE().run(() => estimatePrice({
 query,
 photoUrl: opts.mainUrl,
 minMarkupBps,
 knowledgeHintCents: opts.knowledgeHintCents,
 extraComps: comps,
 context: { brand: brandVal || null, era: opts.era || null, condition: opts.condition || null, conditionGrade: opts.conditionGrade || opts.condition || null, runway: opts.runwaySoFar, trend: trend?.trending ? `${brandVal} has rising demand across the resale market (${trend.note})` : null },
 })).catch(() => null);
 if (estimate && trend?.trending) estimate.rationale += ` · 🔥 ${brandVal} trending (${trend.note})`;
 if (estimate && estimate.marketCents) {
 const { mult, note } = await resolveStoreMultiplier(opts.slug).catch(() => ({ mult: 1, note: "" }));
 if (mult !== 1) {
 const adjusted = Math.round(estimate.marketCents * mult);
 estimate.suggestedCents = Math.max(adjusted, estimate.floorCents ?? 0);
 const pct = Math.round((mult - 1) * 100);
 estimate.rationale += ` · ${pct >= 0 ? "+" : ""}${pct}% ${note}`;
 }
 }
 } else {
 // Price typed → only GRADE it. Fast owned-data reference (no Claude, no live comps).
 estimate = await getMarketReferenceFast({ query, brand: brandVal || null }).catch(() => null);
 if (estimate?.marketCents) {
 const sellerCents = Math.round(parseFloat(opts.price as string) * 100);
 if (sellerCents > 0) priceFlag = computePriceFlag(sellerCents, estimate.marketCents, estimate.lowCents, estimate.highCents);
 }
 }

 // Runway — resolve if not already provided.
 let runway: string | null = opts.runwaySoFar;
 if (!runway && brandVal) {
 runway = await getPieceRunway(brandVal, opts.title).catch(() => null); // seen this exact piece before?
 const titles = [...opts.reverseTitles, ...(estimate?.comps || []).map((c) => c.title)];
 if (!runway) runway = extractRunway(brandVal, titles); // resellers often cite the season in comps
 if (!runway && !opts.draftRanFull && isIntakeConfigured()) {
 // Proactive: recognize the piece from the photo + comps even when nobody labeled it a runway.
 // Only when the full draft was SKIPPED — when it ran it already assessed runway.
 runway = await AI_GATE().run(() => identifyRunway(opts.imageUrls, brandVal, opts.title, titles)).catch(() => null);
 }
 }
 if (runway && brandVal && opts.title) await savePieceRunway(brandVal, opts.title, runway).catch(() => {});

 return { estimate, priceFlag, runway };
}
