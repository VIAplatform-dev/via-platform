import { estimatePrice, getMarketReferenceFast, computePriceFlag, type PriceEstimate, type PriceFlag } from "./price-engine";
import { getMinMarkupBps } from "./store-pricing-db";
import { getStorePricingSignal, getVisualVyaComps, RECALL_STALE_DAYS } from "./intake-memory-db";
import { getStoreBrief, briefPricingTarget } from "./store-brief-db";
import { fetchResaleTrend, type Comp } from "./comps";
import { identifyRunway, identifyCelebrity, isIntakeConfigured } from "./ai-intake";
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
// Mine the SAME-BRAND comp/match titles for a season+year — but only assert it when the SAME season
// is cited REPEATEDLY and DOMINANTLY. A lone or scattered mention is NOT provenance: resellers of
// mass-produced production pieces (e.g. the Fendi Baguette) routinely copy a famous debut season
// into titles, which would otherwise mis-flag an ordinary bag as runway.
const RUNWAY_MIN_HITS = 3;      // need at least this many titles citing the winning season
const RUNWAY_MIN_SHARE = 0.6;   // …and it must be a clear majority of season-citing same-brand titles
export function extractRunway(brand: string, titles: string[]): string | null {
 if (!brand) return null;
 const tally = new Map<string, number>();
 let seasonCiting = 0;
 for (const t of titles) {
 if (!titleHasBrand(t, brand)) continue;
 const year = t.match(/\b(199\d|20[01]\d)\b/)?.[0];
 if (!year) continue;
 const low = t.toLowerCase();
 const season = /(s\/s|\bss\b|spring|resort|cruise)/.test(low) ? "S/S"
 : /(f\/w|a\/w|\bfw\b|\baw\b|fall|autumn|winter)/.test(low) ? "F/W" : "";
 if (!season) continue;
 seasonCiting++;
 const key = `${season} ${year}`;
 tally.set(key, (tally.get(key) || 0) + 1);
 }
 let best: string | null = null, n = 0;
 for (const [k, v] of tally) if (v > n) { best = k; n = v; }
 if (!best || n < RUNWAY_MIN_HITS || n / seasonCiting < RUNWAY_MIN_SHARE) return null;
 return `${brand} ${best}`;
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
 editorialTitles?: string[]; // editorial/Getty captions (un-brand-filtered) — provenance evidence
 embedding?: number[]; // the intake photo embedding — for VYA visual price comps (already computed, no extra cost)
 knowledgeHintCents: number | null;
 runwaySoFar: string | null; // runway the seller/draft already provided
 celebritySoFar?: string | null; // celebrity provenance the seller/draft already provided
 draftRanFull: boolean; // did the full vision draft run? gates the proactive runway pass
 // Near-duplicate recall: this is the SAME item this store already priced. Reuse that price
 // verbatim (deterministic) unless it's gone stale — the "same price unless a year passed" rule.
 recalledPriceCents?: number | null;
 recalledMarketCents?: number | null;
 recallAgeDays?: number | null;
}): Promise<{ estimate: PriceEstimate | null; priceFlag: PriceFlag | null; runway: string | null; celebrity: string | null }> {
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

 // Celebrity provenance — resolved BEFORE pricing so a verified "worn by" can lift the estimate.
 // Only runs when reverse-image surfaced editorial/Getty captions (the evidence), so the common
 // case costs nothing. Seller/draft value wins; otherwise confirm the exact piece against the photo.
 let celebrity: string | null = (opts.celebritySoFar || "").trim() || null;
 const editorialTitles = opts.editorialTitles || [];
 if (!celebrity && editorialTitles.length && isIntakeConfigured()) {
 const c = await AI_GATE().run(() => identifyCelebrity(opts.imageUrls, brandVal, opts.title, editorialTitles)).catch(() => null);
 if (c) celebrity = c.context ? `${c.name} (${c.context})` : c.name;
 }

 let estimate: PriceEstimate | null = null;
 let priceFlag: PriceFlag | null = null;
 // Near-duplicate recall: the SAME item this store priced before, still fresh → reuse that price
 // verbatim instead of re-valuing. Stale (older than the window) falls through to a fresh valuation.
 const recallFresh = needPrice && !!opts.recalledPriceCents && opts.recalledPriceCents > 0
 && opts.recallAgeDays != null && opts.recallAgeDays < RECALL_STALE_DAYS;
 if (recallFresh) {
 const cents = opts.recalledPriceCents as number;
 const mkt = opts.recalledMarketCents && opts.recalledMarketCents > 0 ? opts.recalledMarketCents : cents;
 estimate = {
 suggestedCents: cents,
 marketCents: mkt,
 floorCents: null,
 lowCents: Math.round(cents * 0.9),
 highCents: Math.round(cents * 1.1),
 confidence: 0.92,
 comps: [],
 rationale: `Recalled from the same piece you listed ${opts.recallAgeDays === 0 ? "recently" : `${opts.recallAgeDays}d ago`} — the market hasn't turned over, so the price carries.`,
 source: "knowledge",
 };
 } else if (needPrice) {
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
 context: { brand: brandVal || null, era: opts.era || null, condition: opts.condition || null, conditionGrade: opts.conditionGrade || opts.condition || null, runway: opts.runwaySoFar, celebrity, trend: trend?.trending ? `${brandVal} has rising demand across the resale market (${trend.note})` : null },
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

 // Runway — resolve if not already provided. This is a strong buyer-facing claim, so we lean on the
 // conservative archivist (identifyRunway) rather than raw title-scraping, which over-flags production
 // pieces whose resellers cite a famous season. When the full draft ran it already judged runway (and
 // left it null for production pieces) — we do NOT second-guess that with the title heuristic.
 let runway: string | null = opts.runwaySoFar;
 if (!runway && brandVal) {
 runway = await getPieceRunway(brandVal, opts.title).catch(() => null); // seen this exact piece before?
 if (!runway && !opts.draftRanFull) {
 // Editorial/Getty captions (e.g. "…walks the runway at the Prada F/W 2004 show") are prime
 // season evidence and are included here even though they skip the brand filter used for pricing.
 const titles = [...opts.reverseTitles, ...editorialTitles, ...(estimate?.comps || []).map((c) => c.title)];
 runway = isIntakeConfigured()
 // Let the archivist weigh the photo + these titles and reject production pieces.
 ? await AI_GATE().run(() => identifyRunway(opts.imageUrls, brandVal, opts.title, titles)).catch(() => null)
 // Offline fallback: the strict consensus heuristic (repeated + dominant season only).
 : extractRunway(brandVal, titles);
 }
 }
 if (runway && brandVal && opts.title) await savePieceRunway(brandVal, opts.title, runway).catch(() => {});

 return { estimate, priceFlag, runway, celebrity };
}
