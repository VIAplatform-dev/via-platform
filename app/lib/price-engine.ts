import { fetchComps, rankComps, filterModelConflicts, isCompsConfigured, type Comp } from "./comps";
import { getCachedComps, saveComps, getVyaComps, newestCompAgeDays } from "./comp-cache-db";
import { inferCategoryFromTitle } from "./loadStoreProducts";
import { getInternalPriceBenchmark, type InternalPriceBenchmark } from "./data-layer/price-benchmark-db";
import { getUnbrandedBenchmark } from "./data-layer/unbranded-benchmark-db";
import { CONDITION_MULTIPLIERS, normalizeConditionGrade } from "./data-layer/config";
import { materialTier } from "./material-tier";
import { AI_MODELS } from "./ai-models";
import { recordAnthropic } from "./cost-tracker";

// The price engine: turn real comps into one defensible number.
//  market value  = comps, filtered to TRUE comparables by the model (sold > asking)
//  floor         = cost × (1 + the store's min markup)
//  suggested     = max(market, floor)
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = AI_MODELS.pricing;
// Cached comps older than this are treated as stale — the pricer refreshes live even if the
// cache is well-stocked, so a fast-moving market doesn't get priced off weeks-old data.
const COMP_FRESH_DAYS = 21;

export type PriceEstimate = {
 suggestedCents: number;
 marketCents: number | null;
 floorCents: number | null;
 lowCents: number | null;
 highCents: number | null;
 confidence: number;
 comps: Comp[]; // the comps actually used
 rationale: string;
 source: "comps" | "floor" | "knowledge" | "benchmark" | "none";
};

function median(nums: number[]): number | null {
 if (!nums.length) return null;
 const s = [...nums].sort((a, b) => a - b);
 const m = Math.floor(s.length / 2);
 return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Ask the model to keep only true comparables and return a defensible market value.
// Falls back to a deterministic sold-median if the model isn't available. Exported
// for testing the valuation independently of the live comp fetch.
export async function valueFromComps(
 query: string,
 photoUrl: string | undefined,
 comps: Comp[],
 ctx?: { brand?: string | null; era?: string | null; material?: string | null; condition?: string | null; conditionGrade?: string | null; runway?: string | null; celebrity?: string | null; knowledgeHintCents?: number | null; trend?: string | null; internalBenchmark?: InternalPriceBenchmark | null; unbrandedBenchmark?: { segment: string; medianCents: number; p25Cents: number; p75Cents: number; count: number; storeCount: number } | null },
) {
 const fallback = () => {
 const sold = comps.filter((c) => c.sold).map((c) => c.priceCents);
 const raw = sold.length >= 3 ? sold : comps.map((c) => c.priceCents);
 // Trim extreme high/low comps (a mis-matched look-alike) before the median, so one wrong
 // $2,000 comp can't drag a $60 piece's fallback price up (or a $5 part drag it down).
 const sortedRaw = raw.filter((n) => n > 0).sort((a, b) => a - b);
 const cut = sortedRaw.length >= 5 ? Math.floor(sortedRaw.length * 0.15) : 0;
 const base = cut ? sortedRaw.slice(cut, sortedRaw.length - cut) : sortedRaw;
 const m = median(base);
 // A bare comp median lowballs rare/archival pieces badly (the set is polluted by
 // fast-fashion). When we have an expert knowledge estimate, trust it over the median.
 const k = ctx?.knowledgeHintCents && ctx.knowledgeHintCents > 0 ? ctx.knowledgeHintCents : null;
 const market = k && (!m || k > m) ? k : m;
 const useK = market === k && k != null;
 return {
 marketCents: market,
 low: market ? Math.round(market * 0.85) : null,
 high: market ? Math.round(market * 1.2) : null,
 confidence: useK ? 0.35 : sold.length >= 3 ? 0.6 : 0.4,
 kept: comps.slice(0, 8),
 rationale: useK ? "Estimated from expert knowledge of this piece (no true marketplace comps)." : "Median of comparable resale prices.",
 };
 };
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey || !comps.length) return fallback();

 const idLine = ctx && (ctx.brand || ctx.era || ctx.runway || ctx.celebrity)
 ? `\n\nThis piece has been identified as: ${[ctx.brand, ctx.era].filter(Boolean).join(", ")}${ctx.runway ? ` — from the ${ctx.runway} runway collection (archival/collectible)` : ""}${ctx.celebrity ? ` — documented worn by ${ctx.celebrity}; verified celebrity provenance earns a MODEST premium (at most ~10-15%) over comps, never a multiple` : ""}.`
 : "";
 // Condition handling. When we have a canonical GRADE, an explicit multiplier is applied downstream —
 // so tell the model to value at STANDARD resale condition and NOT self-discount (avoids double-
 // counting). When there's no gradable condition, fall back to the soft, model-judged adjustment.
 const gradeKnown = !!normalizeConditionGrade(ctx?.conditionGrade ?? ctx?.condition ?? null);
 const condLine = ctx?.condition
 ? (gradeKnown
  ? `\n\nValue this piece at STANDARD resale condition (very good) — its market value as a normal PRE-OWNED piece. Do NOT discount for this specific item's individual flaws or wear; that adjustment is applied separately. BUT the target is the USED market: SOLD comps listed as "Brand New" / "NWT" / "NIB" / "deadstock" / "new with tags" sell ABOVE the used market and are NOT peers of a pre-owned piece — treat them as an UPPER CEILING only, and anchor marketCents to the PRE-OWNED / used sold cluster, never to a new-plus-used blend. (Its stated condition "${ctx.condition}" is context only.)`
  : `\n\nCONDITION of THIS piece: ${ctx.condition}. Online comps are usually listed as "very good / excellent", so adjust to the real condition: flaws/visible wear ("good"/"fair") price toward the LOW end of the sold cluster or below; pristine / new-with-tags price toward the HIGH end. Do not price a worn piece at the pristine-comp median.`)
 : "";
 const b = ctx?.internalBenchmark;
 const benchLine = b
 ? `\n\nONE ADDITIONAL real-sold data point — this platform's own sales: "${b.segment}" has sold on VYA for a median of $${Math.round(b.medianCents / 100)}${b.p25Cents != null && b.p75Cents != null ? ` (typical range $${Math.round(b.p25Cents / 100)}–$${Math.round(b.p75Cents / 100)})` : ""}, across ${b.txnCount} sales on ${b.storeCount}+ stores. Weigh this ALONGSIDE the comps below as one more SOLD signal (similar standing to the eBay SOLD prices) — NOT an override. Triangulate the real market from ALL of them together: eBay sold, boutique/marketplace listings, and this benchmark. Do not anchor to this benchmark alone, and let strong comps for this exact piece win when they disagree with it.`
 : "";
 // UNBRANDED pricing: with no brand and no exact comps to anchor to, value the piece from its
 // INTRINSIC qualities — material first (the strongest, most seller-verifiable signal), then
 // construction, then era (which photos CANNOT reliably read, so it's a widen-and-ask signal,
 // never a silent multiplier). Only triggers when there's no brand, so branded pricing is untouched.
 const isUnbranded = !ctx?.brand;
 const mt = isUnbranded ? materialTier(ctx?.material) : { tier: null, label: null };
 const materialGuide = mt.tier === "premium"
 ? `The stated material ("${ctx?.material}") is a natural/luxury fiber — price toward the UPPER end of the unbranded band for this garment.`
 : mt.tier === "base"
 ? `The stated material ("${ctx?.material}") is synthetic — price toward the LOWER end of the unbranded band.`
 : mt.tier === "mid"
 ? `The stated material ("${ctx?.material}") is a mid-grade fiber — price mid-band.`
 : `The material isn't confirmed — price conservatively and WIDEN the range until it is.`;
 // The GOLDEN SET: how comparable unbranded pieces ACTUALLY price on VYA (category × material tier).
 // For an unbranded item this is the real anchor — actual prices set by curated stores, not a guess.
 const ub = ctx?.unbrandedBenchmark;
 const goldenLine = isUnbranded && ub
 ? `\n\nVYA GOLDEN SET (your strongest anchor for this unbranded piece): comparable unbranded VYA pieces — "${ub.segment}" — price at a median of $${Math.round(ub.medianCents / 100)} (typical $${Math.round(ub.p25Cents / 100)}–$${Math.round(ub.p75Cents / 100)}), across ${ub.count} listed/sold pieces from ${ub.storeCount}+ stores. These are real prices curated stores set for the SAME garment + material, so ANCHOR to this median — move off it only for clearly better/worse material or construction than the typical piece in that set.`
 : "";
 const unbrandedLine = isUnbranded
 ? `\n\nUNBRANDED PIECE — no brand to anchor to, so value it from INTRINSIC qualities in this order:\n- MATERIAL (primary): for the SAME garment, natural/luxury fibers (silk, leather, suede, cashmere, wool, linen) resell WELL ABOVE synthetics (polyester, acrylic, nylon). ${materialGuide}\n- CONSTRUCTION/QUALITY: bias cut, French seams, full lining, hand-finishing, quality hardware read as a better piece — nudge up only when visibly present in the photo.\n- ERA: genuine age adds a MODEST rarity premium, but you CANNOT reliably date a garment from photos (a bias-cut silk slip could be 1930s OR a 1990s revival). Do NOT price up on a guessed decade — only apply an age premium when the era is genuinely corroborated (a datable union label / metal zipper, or a seller-stated era). When the era is uncertain, treat it as UNCERTAINTY: WIDEN the low–high band and keep confidence ≤ 0.45.\n- Anchor to what this GARMENT TYPE in this MATERIAL realistically resells for UNBRANDED — realistic, not a designer wish-price. In the rationale, name the material as the driver, and if the era would change the value, say it's worth confirming.`
 : "";
 const list = comps.map((c, i) => `${i}. [${c.sold ? "SOLD" : "asking"}] $${(c.priceCents / 100).toFixed(0)} — ${c.title.slice(0, 90)} (${c.source})`).join("\n");
 const prompt = `Item being priced: "${query}".${idLine}${condLine}${benchLine}${goldenLine}${unbrandedLine}\n\nCandidate resale comps found online:\n${list}\n\nReturn ONLY JSON: {"marketCents": int, "lowCents": int, "highCents": int, "confidence": 0..1, "keptIndices": int[], "rationale": string}.\nRules:\n- Keep ONLY TRUE comparables: the SAME designer at a similar caliber, a similar garment and era, roughly the photographed condition. Discard fast-fashion, unrelated/diffusion brands, different garments, parts/accessories, wild outliers — never use them as an anchor, ceiling, or floor.\n- ANCHOR TO THE MEDIAN OF *SOLD* COMPS — real sold prices are the market. When 2+ true SOLD comparables exist, marketCents ≈ their MEDIAN. HIGH-SOLD OUTLIER: a single SOLD price far above the rest of the sold comps (≈1.8x+ the next-highest genuine sold) is a rare/lucky one-off — do NOT anchor, median, or ceiling to it; drop it and anchor to the remaining sold cluster. This is a curated marketplace, so don't fire-sale — but a common, findable piece with several comps is priced at what it REPEATEDLY sells for, NOT near its single highest-ever sale.\n- RARE-VARIANT / BIMODAL CLUSTER: if the SOLD comps split into two groups — a larger COMMON cluster and a smaller high cluster driven by rare variants (collector sizes, sought colorways, redline/early production, deadstock) that CANNOT be confirmed for THIS piece from the query/photo — anchor marketCents to the COMMON (larger, lower) cluster and use the premium group only as the HIGH ceiling. A typical example is NOT priced at the blended median that a few rare variants pull up; widen the low–high band and lower confidence to reflect the spread.\n- ASKING vs SOLD: don't anchor to the single HIGHEST aspirational ask (RealReal/Vestiaire/1stDibs asks can sit unsold) — but do NOT swing the other way and price BELOW the market either. Asking prices set the upper band; comparable shop/sold prices set the realistic level. Land AT market — the low-to-median of the true comps — NOT a quick-sale discount beneath the comp range. SOLD prices (eBay/Depop/VYA) are the true anchor; asking prices only cap the UPPER band. Land at the SOLD median — which, for a findable piece, can sit below the current asks and well below a single high sale.\n- ONLY IF there are essentially NO true comps (truly rare/archival, nothing comparable) may you price from expert knowledge of where this exact piece sells — realistic, not aspirational; don't lowball to fast-fashion, but don't invent a luxury wish-price either. Set confidence ≈0.4.\n- DEMAND / TREND: a sought-after designer/era earns only a MODEST premium — at most ~10-15%, and only when the comps support it. A demand-momentum percentage is NOT a price-increase percentage: NEVER multiply the price by it.${ctx?.trend ? ` Demand note: ${ctx.trend} — apply at most a small nudge, not a large one.` : ""}\n- UNCERTAIN VARIANT: if the exact material/variant can't be pinned down (e.g. a bag or piece that comes in several materials/versions at very different prices, and the comps span a wide range), WIDEN the low–high band to honestly reflect that spread and set confidence ≤ 0.5 — do NOT output a falsely precise number for a piece you can't fully identify.\n- marketCents = the MEDIAN of the true SOLD comps (a common/findable piece prices at what it repeatedly sells for — which may sit well below the single highest sale and below the current asks); lowCents = a competitive quick-sell within the sold cluster; highCents = a patient strong-demand ceiling near the top genuine comps; keptIndices = the true comps relied on; rationale = one brief sentence — describe the comps as "comparable", and NEVER call a comp "identical" or "the same piece" unless it is a verified exact match (a visual look-alike with the same logo is NOT identical).`;
 const content: any[] = [];
 if (photoUrl) content.push({ type: "image", source: { type: "url", url: photoUrl } });
 content.push({ type: "text", text: prompt });

 try {
 // Retry once on a transient failure (429/5xx) — a rate-limited valuation call must
 // not silently collapse the price to a junk-comp median.
 let res: Response | null = null;
 for (let attempt = 0; attempt < 2; attempt++) {
 res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
 // 1500, not 700: with 40 comps a full keptIndices array + rationale can exceed 700, and a
 // truncated response fails JSON.parse → we silently drop the model's whole valuation and fall
 // back to a raw cached-sold median (which over-prices variant-polluted sets like Hermès Twilly).
 body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: "user", content }] }),
 });
 if (res.ok) break;
 if (res.status !== 429 && res.status < 500) break; // non-retryable
 await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
 }
 if (!res || !res.ok) return fallback();
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 await recordAnthropic(MODEL, "pricing", data);
 const t = data.content?.find((c) => c.type === "text")?.text ?? "";
 const m = t.match(/\{[\s\S]*\}/);
 const raw: any = m ? JSON.parse(m[0]) : {};
 // Truncated/unparseable response (no marketCents) → degrade to the honest sold-median fallback
 // with its correct confidence + rationale, rather than a half-defaulted mix of model + defaults.
 if (typeof raw.marketCents !== "number" || raw.marketCents <= 0) return fallback();
 const keptIdx: number[] = Array.isArray(raw.keptIndices) ? raw.keptIndices.filter((n: any) => Number.isInteger(n) && comps[n]) : [];
 const kept = keptIdx.length ? keptIdx.map((i: number) => comps[i]) : comps.slice(0, 8);
 return {
 marketCents: typeof raw.marketCents === "number" && raw.marketCents > 0 ? Math.round(raw.marketCents) : fallback().marketCents,
 low: typeof raw.lowCents === "number" ? Math.round(raw.lowCents) : null,
 high: typeof raw.highCents === "number" ? Math.round(raw.highCents) : null,
 confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
 kept,
 rationale: typeof raw.rationale === "string" ? raw.rationale : "Based on comparable resale prices.",
 };
 } catch {
 return fallback();
 }
}

export type PriceFlag = { level: "under" | "over" | "at"; pct: number; marketUsd: number; message: string };

/** Compare a seller's own price to a computed market value → an over/under-market flag. Uses
 *  the estimate's low/high band (or a ±band) so small deviations read as "at market" and only
 *  real gaps flag. Kept here so the intake route, the price-check endpoint, and the client UI
 *  all use one definition. */
export function computePriceFlag(sellerCents: number, marketCents: number, lowCents: number | null, highCents: number | null): PriceFlag {
 const low = lowCents ?? Math.round(marketCents * 0.85);
 const high = highCents ?? Math.round(marketCents * 1.2);
 const marketUsd = Math.round(marketCents / 100);
 const pct = Math.round(((sellerCents - marketCents) / marketCents) * 100);
 if (sellerCents < low) return { level: "under", pct, marketUsd, message: `About ${Math.abs(pct)}% below market — comparable pieces sit around $${marketUsd}. You could likely price higher.` };
 if (sellerCents > high) return { level: "over", pct, marketUsd, message: `About ${pct}% above market (~$${marketUsd}) — expect a slower sale.` };
 return { level: "at", pct, marketUsd, message: `Right at market (~$${marketUsd}).` };
}

/**
 * FAST market reference from OWNED data only — the internal benchmark, else pooled cached +
 * VYA comps. No Claude valuation, no live SerpApi, so it returns in a DB round-trip. Powers the
 * instant over/under-market flag when the seller already typed a price (we don't need to SUGGEST
 * one, just grade theirs). Returns null when there's too little owned data to be meaningful.
 */
export async function getMarketReferenceFast(opts: { query: string; brand: string | null }): Promise<PriceEstimate | null> {
 const category = inferCategoryFromTitle(opts.query) as string;
 const [benchmark, cached, vya] = await Promise.all([
 getInternalPriceBenchmark({ brand: opts.brand, category }).catch(() => null),
 getCachedComps({ query: opts.query, brand: opts.brand, category, maxAgeDays: 45, limit: 60 }).catch(() => []),
 getVyaComps({ brand: opts.brand, limit: 30 }).catch(() => []),
 ]);
 if (benchmark?.medianCents) {
 const m = benchmark.medianCents;
 return { suggestedCents: m, marketCents: m, floorCents: null, lowCents: benchmark.p25Cents ?? Math.round(m * 0.85), highCents: benchmark.p75Cents ?? Math.round(m * 1.2), confidence: 0.6, comps: [], rationale: "Market rate from your marketplace data.", source: "benchmark" };
 }
 // Grade-path fallback: an item with no benchmark and thin/empty owned comps is one the system
 // doesn't recognize. Do ONE live comp fetch so a typed price still gets an accurate flag instead
 // of silence. Results are cached, so the next similar item is free.
 let pool = [...cached, ...vya];
 let liveFallback = false;
 if (pool.filter((c) => c.priceCents > 0).length < 3 && isCompsConfigured()) {
 const live = await fetchComps(opts.query).catch(() => []);
 if (live.length) {
 await saveComps(live, { query: opts.query, brand: opts.brand, category }).catch(() => {});
 pool = [...pool, ...live];
 liveFallback = true;
 }
 }
 const prices = pool.map((c) => c.priceCents).filter((p) => p > 0).sort((a, b) => a - b);
 if (isCompsConfigured()) console.log(`[serpapi] grade "${opts.query.slice(0, 60)}" brand=${opts.brand ?? "?"} owned=${cached.length + vya.length} liveFallback=${liveFallback} prices=${prices.length}`);
 if (prices.length < 3) return null; // too little to say anything even after a live look
 const q = (f: number) => prices[Math.min(prices.length - 1, Math.floor(prices.length * f))];
 const m = q(0.5);
 return { suggestedCents: m, marketCents: m, floorCents: null, lowCents: q(0.25), highCents: q(0.75), confidence: 0.5, comps: pool.slice(0, 8), rationale: liveFallback ? "Market rate from a live resale lookup (first time we've priced this)." : "Market rate from comparable resale + your listings.", source: "comps" };
}

export async function estimatePrice(opts: {
 query: string;
 photoUrl?: string;
 costCents?: number | null;
 minMarkupBps: number;
 knowledgeHintCents?: number | null;
 extraComps?: Comp[]; // reverse-image (visually-identical) matches — the strongest comps
 context?: { brand?: string | null; era?: string | null; material?: string | null; condition?: string | null; conditionGrade?: string | null; runway?: string | null; celebrity?: string | null; trend?: string | null }; // the identified piece + condition + live demand signal, for knowledge/trend-aware valuation
}): Promise<PriceEstimate> {
 // Fetch external comps and THIS platform's own realized-price benchmark together. The
 // internal benchmark (privacy-gated, from the nightly market_metrics) is the strongest
 // signal — actual sales on our marketplace for this brand/category.
 const category = inferCategoryFromTitle(opts.query) as string;
 const brand = opts.context?.brand ?? null;
 const material = opts.context?.material ?? null;
 // For an UNBRANDED piece, anchor to VYA's own golden set (how comparable unbranded pieces price,
 // by category × material tier) instead of guessing — real prices from curated stores.
 const unbrandedBenchmark = !brand ? await getUnbrandedBenchmark({ category, material }).catch(() => null) : null;
 // Owned-data-first: reuse recently-cached comps (from past PAID lookups) before spending on a
 // new SerpApi basket. Only hit the live full basket (reverse-image + eBay + Shopping + RealReal)
 // on a cold/thin cache, then write every fresh comp back so the next similar item is free.
 // (Reverse-image comps in extraComps are always fresh — per photo — and also cached.)
 const [cached, benchmark, vyaComps, cacheAgeDays] = await Promise.all([
 getCachedComps({ query: opts.query, brand, category, maxAgeDays: 45, limit: 40 }).catch(() => []),
 getInternalPriceBenchmark({ brand, category }).catch(() => null),
 getVyaComps({ brand, limit: 15 }).catch(() => []),
 newestCompAgeDays(opts.query).catch(() => null),
 ]);
 // Go live when the cache is thin OR stale (newest cached comp older than COMP_FRESH_DAYS), so a
 // "known" item sitting on weeks-old comps still gets a fresh market read.
 const stale = cacheAgeDays != null && cacheAgeDays > COMP_FRESH_DAYS;
 // Also refresh live when the sold anchor is thin. Sold prices are the reality anchor, but asking
 // listings (Google Shopping) accumulate in the cache far faster than sold ones — so a big,
 // asking-heavy cache with only a handful of sold comps would price a piece off inflated asking
 // prices even though plenty of real sold comps exist. Refetch when there are <3 sold OR the cache
 // is sizable but sold make up less than a quarter of it.
 const soldCached = cached.filter((c) => c.sold).length;
 const soldThin = soldCached < 3 || (cached.length >= 12 && soldCached < cached.length * 0.25);
 let live: Comp[] = [];
 if (cached.length < 8 || stale || soldThin) {
 live = await fetchComps(opts.query).catch(() => []);
 }
 if (isCompsConfigured()) console.log(`[serpapi] estimate "${opts.query.slice(0, 60)}" brand=${brand ?? "?"} cached=${cached.length} ageDays=${cacheAgeDays ?? "none"} stale=${stale} live=${live.length}`);
 // Persist this run's fresh EXTERNAL comps (reverse-image + any live) for future reuse. VYA
 // comps come straight from our own tables, so there's nothing to cache.
 const fresh = rankComps([...(opts.extraComps || []), ...live]);
 if (fresh.length) await saveComps(fresh, { query: opts.query, brand, category });
 // With a STRONG external sold signal (plenty of real eBay/marketplace SOLD comps), trust it over
 // VYA's own broad brand-level signals: the internal benchmark + own-inventory comps are coarse
 // (brand-level, mixing in cheaper pieces) and would drag a high-value model down. Keep them only as
 // the fallback when external sold is thin.
 const externalSold = [...(opts.extraComps || []), ...cached, ...live].filter((c) => c.sold).length;
 const strongExternal = externalSold >= 8;
 // Reverse-image (exact piece) + VYA's own sold/listed items first, then external cached/live;
 // dedupe, luxury-first, cap. VYA (sold) are real transactions, VYA (listed) are asking refs.
 const ranked = rankComps([...(opts.extraComps || []), ...(strongExternal ? [] : vyaComps), ...cached, ...live]);
 // Drop keyword comps that are a DIFFERENT bag model than the query (a "Jumbo Flap" shouldn't be
 // priced off Accordion/Camera/Westminster bags). Keep the unfiltered set if this leaves too few.
 const modelFiltered = filterModelConflicts(ranked, opts.query);
 const comps = (modelFiltered.length >= 3 ? modelFiltered : ranked).slice(0, 40);
 let marketCents: number | null = null, low: number | null = null, high: number | null = null, confidence = 0, rationale = "", kept: Comp[] = [];

 if (comps.length) {
 const v = await valueFromComps(opts.query, opts.photoUrl, comps, { ...opts.context, knowledgeHintCents: opts.knowledgeHintCents, internalBenchmark: strongExternal ? null : benchmark, unbrandedBenchmark });
 marketCents = v.marketCents; low = v.low; high = v.high; confidence = v.confidence; rationale = v.rationale; kept = v.kept;
 } else if (unbrandedBenchmark) {
 // No external comps + unbranded → anchor to the golden set (comparable unbranded VYA pieces).
 marketCents = unbrandedBenchmark.medianCents;
 low = unbrandedBenchmark.p25Cents;
 high = unbrandedBenchmark.p75Cents;
 confidence = 0.5;
 rationale = `Anchored to VYA's golden set — how comparable unbranded pieces (${unbrandedBenchmark.segment}) price across ${unbrandedBenchmark.count} listed/sold items from ${unbrandedBenchmark.storeCount}+ stores.`;
 } else if (benchmark) {
 // No external comps — anchor to our own realized sold prices for this brand/category.
 marketCents = benchmark.medianCents;
 low = benchmark.p25Cents;
 high = benchmark.p75Cents;
 confidence = 0.5;
 rationale = `Based on ${benchmark.segment}'s recent sold prices on VYA — median across ${benchmark.txnCount} sales on ${benchmark.storeCount}+ stores.`;
 } else if (opts.knowledgeHintCents && opts.knowledgeHintCents > 0) {
 marketCents = opts.knowledgeHintCents;
 confidence = 0.3;
 rationale = "Estimated from model knowledge (live comps not enabled).";
 }

 // Explicit condition adjustment (Phase 4): comps were valued at standard resale condition, so
 // scale the whole band to THIS piece's grade — a transparent, tunable move (config), not the
 // model quietly self-discounting. Skipped when the condition isn't gradable (multiplier stays 1).
 const grade = normalizeConditionGrade(opts.context?.conditionGrade ?? opts.context?.condition ?? null);
 if (grade && marketCents != null) {
 const mult = CONDITION_MULTIPLIERS[grade];
 if (mult !== 1) {
 marketCents = Math.round(marketCents * mult);
 if (low != null) low = Math.round(low * mult);
 if (high != null) high = Math.round(high * mult);
 const pct = Math.round((mult - 1) * 100);
 rationale += ` · ${pct >= 0 ? "+" : ""}${pct}% (${grade} condition)`;
 }
 }

 // Guarantee a low–high band whenever we have a price. Some single-point paths (model-knowledge
 // only, or a thin comp set with no live comps when SerpApi is off) leave low/high null, which
 // hides the price scale entirely. Derive a ±band from the market value so the scale always shows.
 if (marketCents != null) {
 if (low == null) low = Math.round(marketCents * 0.85);
 if (high == null) high = Math.round(marketCents * 1.2);
 }

 const floorCents = opts.costCents && opts.costCents > 0 ? Math.round(opts.costCents * (1 + opts.minMarkupBps / 10000)) : null;
 const suggestedCents = Math.max(marketCents ?? 0, floorCents ?? 0);

 let source: PriceEstimate["source"] = "none";
 if (suggestedCents > 0) {
 if (floorCents && suggestedCents === floorCents && (marketCents == null || floorCents >= marketCents)) source = "floor";
 else if (comps.length) source = "comps";
 else if (benchmark && marketCents === benchmark.medianCents) source = "benchmark";
 else source = "knowledge";
 }

 return { suggestedCents, marketCents, floorCents, lowCents: low, highCents: high, confidence, comps: kept, rationale, source };
}

export { isCompsConfigured };
