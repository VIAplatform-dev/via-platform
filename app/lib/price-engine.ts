import { fetchComps, rankComps, isCompsConfigured, type Comp } from "./comps";
import { getCachedComps, saveComps, getVyaComps } from "./comp-cache-db";
import { inferCategoryFromTitle } from "./loadStoreProducts";
import { getInternalPriceBenchmark, type InternalPriceBenchmark } from "./data-layer/price-benchmark-db";
import { AI_MODELS } from "./ai-models";

// The price engine: turn real comps into one defensible number.
//  market value  = comps, filtered to TRUE comparables by the model (sold > asking)
//  floor         = cost × (1 + the store's min markup)
//  suggested     = max(market, floor)
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = AI_MODELS.pricing;

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
 ctx?: { brand?: string | null; era?: string | null; runway?: string | null; knowledgeHintCents?: number | null; trend?: string | null; internalBenchmark?: InternalPriceBenchmark | null },
) {
 const fallback = () => {
 const sold = comps.filter((c) => c.sold).map((c) => c.priceCents);
 const base = sold.length >= 3 ? sold : comps.map((c) => c.priceCents);
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

 const idLine = ctx && (ctx.brand || ctx.era || ctx.runway)
 ? `\n\nThis piece has been identified as: ${[ctx.brand, ctx.era].filter(Boolean).join(", ")}${ctx.runway ? ` — from the ${ctx.runway} runway collection (archival/collectible)` : ""}.`
 : "";
 const b = ctx?.internalBenchmark;
 const benchLine = b
 ? `\n\nONE ADDITIONAL real-sold data point — this platform's own sales: "${b.segment}" has sold on VYA for a median of $${Math.round(b.medianCents / 100)}${b.p25Cents != null && b.p75Cents != null ? ` (typical range $${Math.round(b.p25Cents / 100)}–$${Math.round(b.p75Cents / 100)})` : ""}, across ${b.txnCount} sales on ${b.storeCount}+ stores. Weigh this ALONGSIDE the comps below as one more SOLD signal (similar standing to the eBay SOLD prices) — NOT an override. Triangulate the real market from ALL of them together: eBay sold, boutique/marketplace listings, and this benchmark. Do not anchor to this benchmark alone, and let strong comps for this exact piece win when they disagree with it.`
 : "";
 const list = comps.map((c, i) => `${i}. [${c.sold ? "SOLD" : "asking"}] $${(c.priceCents / 100).toFixed(0)} — ${c.title.slice(0, 90)} (${c.source})`).join("\n");
 const prompt = `Item being priced: "${query}".${idLine}${benchLine}\n\nCandidate resale comps found online:\n${list}\n\nReturn ONLY JSON: {"marketCents": int, "lowCents": int, "highCents": int, "confidence": 0..1, "keptIndices": int[], "rationale": string}.\nRules:\n- Keep ONLY TRUE comparables: the SAME designer at a similar caliber, a similar garment and era, roughly the photographed condition. Discard fast-fashion, unrelated/diffusion brands, different garments, parts/accessories, wild outliers — never use them as an anchor, ceiling, or floor.\n- ANCHOR TO THE MEDIAN OF *SOLD* COMPS — real sold prices are the market. When 2+ true SOLD comparables exist, marketCents ≈ their MEDIAN. HIGH-SOLD OUTLIER: a single SOLD price far above the rest of the sold comps (≈1.8x+ the next-highest genuine sold) is a rare/lucky one-off — do NOT anchor, median, or ceiling to it; drop it and anchor to the remaining sold cluster. This is a curated marketplace, so don't fire-sale — but a common, findable piece with several comps is priced at what it REPEATEDLY sells for, NOT near its single highest-ever sale.\n- ASKING vs SOLD: don't anchor to the single HIGHEST aspirational ask (RealReal/Vestiaire/1stDibs asks can sit unsold) — but do NOT swing the other way and price BELOW the market either. Asking prices set the upper band; comparable shop/sold prices set the realistic level. Land AT market — the low-to-median of the true comps — NOT a quick-sale discount beneath the comp range. SOLD prices (eBay/Depop/VYA) are the true anchor; asking prices only cap the UPPER band. Land at the SOLD median — which, for a findable piece, can sit below the current asks and well below a single high sale.\n- ONLY IF there are essentially NO true comps (truly rare/archival, nothing comparable) may you price from expert knowledge of where this exact piece sells — realistic, not aspirational; don't lowball to fast-fashion, but don't invent a luxury wish-price either. Set confidence ≈0.4.\n- DEMAND / TREND: a sought-after designer/era earns only a MODEST premium — at most ~10-15%, and only when the comps support it. A demand-momentum percentage is NOT a price-increase percentage: NEVER multiply the price by it.${ctx?.trend ? ` Demand note: ${ctx.trend} — apply at most a small nudge, not a large one.` : ""}\n- marketCents = the MEDIAN of the true SOLD comps (a common/findable piece prices at what it repeatedly sells for — which may sit well below the single highest sale and below the current asks); lowCents = a competitive quick-sell within the sold cluster; highCents = a patient strong-demand ceiling near the top genuine comps; keptIndices = the true comps relied on; rationale = one brief sentence.`;
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
 body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content }] }),
 });
 if (res.ok) break;
 if (res.status !== 429 && res.status < 500) break; // non-retryable
 await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
 }
 if (!res || !res.ok) return fallback();
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 const t = data.content?.find((c) => c.type === "text")?.text ?? "";
 const m = t.match(/\{[\s\S]*\}/);
 const raw: any = m ? JSON.parse(m[0]) : {};
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
 const pool = [...cached, ...vya];
 const prices = pool.map((c) => c.priceCents).filter((p) => p > 0).sort((a, b) => a - b);
 if (prices.length < 3) return null; // too little to say anything
 const q = (f: number) => prices[Math.min(prices.length - 1, Math.floor(prices.length * f))];
 const m = q(0.5);
 return { suggestedCents: m, marketCents: m, floorCents: null, lowCents: q(0.25), highCents: q(0.75), confidence: 0.5, comps: pool.slice(0, 8), rationale: "Market rate from comparable resale + your listings.", source: "comps" };
}

export async function estimatePrice(opts: {
 query: string;
 photoUrl?: string;
 costCents?: number | null;
 minMarkupBps: number;
 knowledgeHintCents?: number | null;
 extraComps?: Comp[]; // reverse-image (visually-identical) matches — the strongest comps
 context?: { brand?: string | null; era?: string | null; runway?: string | null; trend?: string | null }; // the identified piece + live demand signal, for knowledge/trend-aware valuation
}): Promise<PriceEstimate> {
 // Fetch external comps and THIS platform's own realized-price benchmark together. The
 // internal benchmark (privacy-gated, from the nightly market_metrics) is the strongest
 // signal — actual sales on our marketplace for this brand/category.
 const category = inferCategoryFromTitle(opts.query) as string;
 const brand = opts.context?.brand ?? null;
 // Owned-data-first: reuse recently-cached comps (from past PAID lookups) before spending on a
 // new SerpApi basket. Only hit the live full basket (reverse-image + eBay + Shopping + RealReal)
 // on a cold/thin cache, then write every fresh comp back so the next similar item is free.
 // (Reverse-image comps in extraComps are always fresh — per photo — and also cached.)
 const [cached, benchmark, vyaComps] = await Promise.all([
 getCachedComps({ query: opts.query, brand, category, maxAgeDays: 45, limit: 40 }).catch(() => []),
 getInternalPriceBenchmark({ brand, category }).catch(() => null),
 getVyaComps({ brand, limit: 15 }).catch(() => []),
 ]);
 let live: Comp[] = [];
 if (cached.length < 8) {
 live = await fetchComps(opts.query).catch(() => []);
 }
 // Persist this run's fresh EXTERNAL comps (reverse-image + any live) for future reuse. VYA
 // comps come straight from our own tables, so there's nothing to cache.
 const fresh = rankComps([...(opts.extraComps || []), ...live]);
 if (fresh.length) await saveComps(fresh, { query: opts.query, brand, category });
 // Reverse-image (exact piece) + VYA's own sold/listed items first, then external cached/live;
 // dedupe, luxury-first, cap. VYA (sold) are real transactions, VYA (listed) are asking refs.
 const comps = rankComps([...(opts.extraComps || []), ...vyaComps, ...cached, ...live]).slice(0, 40);
 let marketCents: number | null = null, low: number | null = null, high: number | null = null, confidence = 0, rationale = "", kept: Comp[] = [];

 if (comps.length) {
 const v = await valueFromComps(opts.query, opts.photoUrl, comps, { ...opts.context, knowledgeHintCents: opts.knowledgeHintCents, internalBenchmark: benchmark });
 marketCents = v.marketCents; low = v.low; high = v.high; confidence = v.confidence; rationale = v.rationale; kept = v.kept;
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
