import { fetchComps, rankComps, filterModelConflicts, isCompsConfigured, sourceTier, type Comp } from "./comps.ts";
import { extractFirstJsonObject } from "./json-extract.ts";
import { cleanQuery, explainClean } from "./query-clean.ts";
import { getCachedComps, saveComps, getVyaComps, newestCompAgeDays } from "./comp-cache-db.ts";
import { inferCategoryFromTitle } from "./loadStoreProducts.ts";
import { getInternalPriceBenchmark, type InternalPriceBenchmark } from "./data-layer/price-benchmark-db.ts";
import { getUnbrandedBenchmark, type UnbrandedBenchmark } from "./data-layer/unbranded-benchmark-db.ts";
import { CONDITION_MULTIPLIERS, normalizeConditionGrade } from "./data-layer/config.ts";
import { materialTier } from "./material-tier.ts";
import { AI_MODELS } from "./ai-models.ts";
import { recordAnthropic } from "./cost-tracker.ts";

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
 /** The valuation model did not answer; this price is a raw comp median standing in for it. */
 modelFallback?: boolean;
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

// Garment/accessory nouns that already pin the item type. If the query has one, appending the
// category adds nothing; if it has none, the category is what stops a bare model name from
// matching the wrong product entirely.
// Compound forms matter: "sundress" must count as a garment or we append a redundant "dress".
const GARMENT_NOUN = /\b(?:(?:sun|shirt|slip|shift|wrap|tea|maxi|midi|mini|sweater|smock)?dress(?:es)?|gown|skirt|top|blouse|shirt|tee|t-shirt|tshirt|tank|sweater|cardigan|knit|jacket|coat|blazer|trousers|pants|jeans|shorts|suit|jumpsuit|romper|bodysuit|corset|bra|lingerie|slip|robe|kimono|vest|bag|handbag|purse|clutch|tote|backpack|belt|scarf|hat|shoes?|boots?|heels?|sandals?|sneakers?|loafers?|flats?|pumps?|jewellery|jewelry|necklace|bracelet|earrings?|ring|watch|sunglasses)\b/i;

/** "dresses" → "dress", "accessories" → "accessory", "bags" → "bag". A bare /s$/ strip turns
 *  "dresses" into "dresse", which then reads as a different word entirely. */
function singular(word: string): string {
 return word
  .replace(/ies$/i, "y")
  .replace(/(ss|sh|ch|x|z)es$/i, "$1")
  .replace(/([^s])s$/i, "$1");
}

/**
 * Force the resolved brand to the FRONT of a comp query, and attach the category when the query
 * names no garment.
 *
 * The vision draft writes `searchQuery` before reverse-image has resolved the brand, so a piece
 * whose brand was only identified from web matches was searched for generically — a Valentino
 * Boutique dress ran every comp search as "vintage 1970s 1980s pink polka dot ruched sundress"
 * and came back priced against $18–$95 no-name sundresses. Brand first, category attached, every
 * time: that is what makes the comps this brand's own market rather than a look-alike's.
 */
export function brandFirstQuery(query: string, brand?: string | null, category?: string | null): string {
 const q = (query || "").trim();
 const b = (brand || "").trim();
 if (!q) return q;
 const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
 let out = b && norm(b).length >= 3 && !norm(q).includes(norm(b)) ? `${b} ${q}` : q;
 // Category is a garment word ("dresses" → "dress"); only add it when the query lacks one.
 const cat = categoryWord(category || "");
 if (cat && !GARMENT_NOUN.test(out)) out = `${out} ${cat}`;
 return out.replace(/\s+/g, " ").trim().slice(0, 200);
}

/** The category arrives as a DATABASE slug — "other-clothing", "coats-jackets" — not a word a
 *  shopper would ever type. These were being pasted straight into Google Shopping, producing
 *  searches like "Emilio Pucci blue and white tshirt other-clothing". A slug that names no garment
 *  ("other", "uncategorized") adds nothing and is dropped; a compound slug keeps its first word. */
function categoryWord(category: string): string {
 const c = category.toLowerCase().trim();
 if (!c || /^(other|misc|uncategori[sz]ed|unknown|general)\b/.test(c)) return "";
 return singular(c.split(/[-/,]/)[0].trim());
}

/**
 * One comp as the valuation model sees it, led by HOW WELL IT MATCHES THIS PIECE.
 *
 * Sold-vs-asking used to lead this line, and that ordering was the single biggest source of
 * underpricing: whether a listing happened to transact says far less about value than whether
 * it is the same garment. A visually-confirmed listing of THIS piece is the strongest evidence
 * available and is labelled so it cannot be outvoted by keyword matches. Realized/auction status
 * stays on the line as context, never as the hierarchy.
 */
export function compLine(c: Comp, i: number): string {
 const match = c.exactPiece ? `SAME PIECE${c.similarity ? ` ✓${c.similarity.toFixed(2)}` : ""}` : "keyword match";
 const kind = c.sold ? (c.saleType === "auction" ? "auction close" : "realized sale") : "listed";
 return `${i}. [${match} · ${sourceTier(c.source)} · ${kind}] $${Math.round(c.priceCents / 100)} — ${c.title.slice(0, 90)} (${c.source})`;
}

/** How much same-piece evidence the comp set carries. Replaces the old sold-count gate. */
export function exactPieceEvidence(comps: Comp[]): { exactCount: number; exactPrices: number[] } {
 const exact = comps.filter((c) => c.exactPiece && c.priceCents > 0);
 return { exactCount: exact.length, exactPrices: exact.map((c) => c.priceCents).sort((a, b) => a - b) };
}

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
 ctx?: { brand?: string | null; era?: string | null; material?: string | null; condition?: string | null; conditionGrade?: string | null; runway?: string | null; celebrity?: string | null; knowledgeHintCents?: number | null; trend?: string | null; internalBenchmark?: InternalPriceBenchmark | null; unbrandedBenchmark?: UnbrandedBenchmark | null },
) {
 const fallback = () => {
 // Prefer same-piece listings over anything else — that ordering is the whole point. Sold
 // status is deliberately NOT considered here; a realized sale of a different garment is
 // weaker evidence than a live listing of this one.
 const exact = comps.filter((c) => c.exactPiece).map((c) => c.priceCents);
 // New-at-retail prices are the ORIGINAL cost of the garment, not evidence of its resale value.
 // Including them in a bare median is how a used Saint Laurent blouse drew a $2,190 Editorialist
 // listing and a $1,100 FWRD one into its comp set and came out at ~$400.
 const resaleOnly = comps.filter((c) => sourceTier(c.source) !== "retail");
 const pool = resaleOnly.length >= 3 ? resaleOnly : comps; // never filter down to nothing
 const raw = exact.length ? exact : pool.map((c) => c.priceCents);
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
 confidence: useK ? 0.35 : exact.length >= 2 ? 0.6 : 0.4,
 kept: comps.slice(0, 8),
 rationale: useK ? "Estimated from expert knowledge of this piece (no true marketplace comps)." : exact.length ? "Median of listings of this exact piece." : "Median of comparable resale prices.",
 // The caller has to be able to TELL. A fallback price is indistinguishable from a model price
 // downstream — same shape, and src='comps' either way — which is how two grading runs silently
 // measured a raw median instead of the pricer and reported the result as accuracy.
 modelFallback: true,
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
 ? `\n\nVYA GOLDEN SET (your strongest anchor for this unbranded piece): comparable unbranded VYA pieces — "${ub.segment}" — ${ub.basis === "sold" ? "SOLD FOR" : "are listed at"} a median of $${Math.round(ub.medianCents / 100)} (typical $${Math.round(ub.p25Cents / 100)}–$${Math.round(ub.p75Cents / 100)}), across ${ub.count} ${ub.basis === "sold" ? "completed sales" : "live listings"} from ${ub.storeCount}+ stores. ${ub.basis === "sold" ? "These are prices buyers ACTUALLY PAID for the same kind of piece — the strongest evidence available for an unbranded garment. ANCHOR to this median" : "These are asking prices, so they run ahead of what pieces realize; treat the median as an upper reference rather than the expected price"} — move off it only for clearly better/worse material or construction than the typical piece in that set.`
 : "";
 const unbrandedLine = isUnbranded
 ? `\n\nUNBRANDED PIECE — no brand to anchor to, so value it from INTRINSIC qualities in this order:\n- MATERIAL (primary): for the SAME garment, natural/luxury fibers (silk, leather, suede, cashmere, wool, linen) resell WELL ABOVE synthetics (polyester, acrylic, nylon). ${materialGuide}\n- CONSTRUCTION/QUALITY: bias cut, French seams, full lining, hand-finishing, quality hardware read as a better piece — nudge up only when visibly present in the photo.\n- ERA: genuine age adds a MODEST rarity premium, but you CANNOT reliably date a garment from photos (a bias-cut silk slip could be 1930s OR a 1990s revival). Do NOT price up on a guessed decade — only apply an age premium when the era is genuinely corroborated (a datable union label / metal zipper, or a seller-stated era). When the era is uncertain, treat it as UNCERTAINTY: WIDEN the low–high band and keep confidence ≤ 0.45.\n- Anchor to what this GARMENT TYPE in this MATERIAL realistically resells for UNBRANDED — realistic, not a designer wish-price. In the rationale, name the material as the driver, and if the era would change the value, say it's worth confirming.`
 : "";
 const list = comps.map((c, i) => compLine(c, i)).join("\n");
 // How much realized evidence there actually is. Sold-anchoring is right for a common, findable
 // piece with a deep sold set and WRONG for a rare/archival one with a single close — which is
 // where the worst underpricing happened. The rule now switches on the evidence, not on faith.
 const ev = exactPieceEvidence(comps);
 const usd = (c: number) => `$${Math.round(c / 100)}`;
 const evidenceLine = ev.exactCount
  ? `\n\nSAME-PIECE EVIDENCE: ${ev.exactCount} listing${ev.exactCount === 1 ? " is" : "s are"} visually confirmed to be THIS EXACT GARMENT, priced ${ev.exactPrices.length > 1 ? `${usd(ev.exactPrices[0])}–${usd(ev.exactPrices[ev.exactPrices.length - 1])}` : usd(ev.exactPrices[0])}. This is the market for this piece. ANCHOR HERE. Keyword matches — even ones that sold — describe different garments and may not move you off this range; use them only to sanity-check it.`
  : `\n\nNO SAME-PIECE EVIDENCE: no listing was visually confirmed as this exact garment, so every comp below is a keyword match on brand/era/description. Weigh them by how closely they match THIS piece (same brand AND same garment type beats same brand alone), widen the low–high band, and keep confidence ≤ 0.5.`;
 const prompt = `Item being priced: "${query}".${idLine}${condLine}${benchLine}${goldenLine}${unbrandedLine}${evidenceLine}\n\nCandidate resale comps. Each is tagged [match quality · seller tier · status]:\n- SAME PIECE = reverse-image confirmed to be THIS EXACT GARMENT (✓score = visual similarity). These outrank everything else, whether they sold or are merely listed. A listing of the same piece tells you more about its value than a completed sale of a different one.\n- keyword match = found by brand/description text. It is a DIFFERENT garment that shares words. Never let a cluster of these outvote same-piece evidence.\n- Seller tier: vya = this marketplace's own data; specialist = authenticated/curated resale (Vestiaire, RealReal, 1stDibs, archival dealers); marketplace = general sites (eBay, Depop, Etsy); retail = the item sold NEW at full price (Net-a-Porter, FWRD, Editorialist, Nordstrom, H&M...). A RETAIL comp is the ORIGINAL price, NOT a resale comparable: treat it as a CEILING and nothing else — never anchor marketCents to one, never include one in a median, and never let a new-season ask lift the price of a worn piece. Treat marketplace comps as a REAL market carrying roughly comparable weight — sellers genuinely transact there, and a well-matched eBay listing is strong evidence. Use the tier only to break ties: when two comps match this piece equally well but disagree on price, lean toward the specialist/vya one for caliber and authentication. Do NOT discount a comp merely for being from a marketplace.\n- status (listed / realized sale / auction close) is CONTEXT ONLY. Do not rank a comp above a better-matching one because it sold; an auction close in particular reflects bidding dynamics, not value.\n- All prices are already converted to USD from the seller's local currency.\n${list}\n\nReturn ONLY JSON: {"marketCents": int, "lowCents": int, "highCents": int, "confidence": 0..1, "keptIndices": int[], "rationale": string}.\nRules:\n- Keep ONLY TRUE comparables: the SAME designer at a similar caliber, a similar garment and era, roughly the photographed condition. Discard fast-fashion, unrelated/diffusion brands, different garments, parts/accessories, wild outliers — never use them as an anchor, ceiling, or floor.\n- OUTLIERS, BOTH DIRECTIONS: a comp sitting far outside the main cluster (roughly 3x above or 3x below the cluster's middle) is an outlier — a mislisted item, a different product, a fire-sale, or a wish-price. Never anchor, median, or ceiling to one, whatever its source or sold status; name it in the rationale and price off the cluster. This applies to a cheap marketplace listing and an aspirational specialist ask alike.
- ANCHOR TO THE SAME-PIECE LISTINGS when the evidence note above says there are any — marketCents ≈ their median (or their level, if there is one). Do NOT discount that range because those listings are 'only asking prices'; they are the market for this exact garment. Keyword matches never override same-piece evidence, no matter how many of them there are or whether they sold. This is a curated marketplace, so don't fire-sale — but a common, findable piece with several comps is priced at what it REPEATEDLY sells for, NOT near its single highest-ever sale.\n- RARE-VARIANT / BIMODAL CLUSTER: if the SOLD comps split into two groups — a larger COMMON cluster and a smaller high cluster driven by rare variants (collector sizes, sought colorways, redline/early production, deadstock) that CANNOT be confirmed for THIS piece from the query/photo — anchor marketCents to the COMMON (larger, lower) cluster and use the premium group only as the HIGH ceiling. A typical example is NOT priced at the blended median that a few rare variants pull up; widen the low–high band and lower confidence to reflect the spread.\n- ASKING vs SOLD: don't anchor to the single HIGHEST aspirational ask (RealReal/Vestiaire/1stDibs asks can sit unsold) — but do NOT swing the other way and price BELOW the market either. Asking prices set the upper band; comparable shop/sold prices set the realistic level. Land AT market — the low-to-median of the true comps — NOT a quick-sale discount beneath the comp range. Judge every comp by how well it matches THIS piece first, and by seller caliber second. A general-marketplace sale of a loosely similar garment is WEAK evidence; a specialist dealer listing the same archival piece is STRONG evidence. Never price a piece below what specialist dealers ask for the same garment just because a cheaper, different item sold somewhere.\n- ONLY IF there are essentially NO true comps (truly rare/archival, nothing comparable) may you price from expert knowledge of where this exact piece sells — realistic, not aspirational; don't lowball to fast-fashion, but don't invent a luxury wish-price either. Set confidence ≈0.4.\n- DEMAND / TREND: a sought-after designer/era earns only a MODEST premium — at most ~10-15%, and only when the comps support it. A demand-momentum percentage is NOT a price-increase percentage: NEVER multiply the price by it.${ctx?.trend ? ` Demand note: ${ctx.trend} — apply at most a small nudge, not a large one.` : ""}\n- UNCERTAIN VARIANT: if the exact material/variant can't be pinned down (e.g. a bag or piece that comes in several materials/versions at very different prices, and the comps span a wide range), WIDEN the low–high band to honestly reflect that spread and set confidence ≤ 0.5 — do NOT output a falsely precise number for a piece you can't fully identify.\n- marketCents = the level the SAME-PIECE listings sit at when there are any; otherwise the level of the closest-matching comps (same brand AND same garment type), weighted toward specialist sellers; lowCents = a competitive quick-sell within the sold cluster; highCents = a patient strong-demand ceiling near the top genuine comps; keptIndices = the true comps relied on; rationale = one brief sentence — describe the comps as "comparable", and NEVER call a comp "identical" or "the same piece" unless it is a verified exact match (a visual look-alike with the same logo is NOT identical).`;
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
 // NEVER fall back silently. A dropped valuation looks identical to a real one downstream —
 // it just quietly prices off a raw median instead (a Versace runway dress with $1.7k–$3.2k
 // comps came out at $512 this way, and nothing in the output said the model hadn't run).
 if (!res || !res.ok) { console.error(`[pricing] FELL BACK: Anthropic ${res?.status ?? "no response"}`); return fallback(); }
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
 await recordAnthropic(MODEL, "pricing", data);
 const t = data.content?.find((c) => c.type === "text")?.text ?? "";
 // First BALANCED object, not first-brace-to-last-brace: a trailing markdown fence or a closing
 // sentence used to run the capture past the end of the JSON and throw away a correct answer.
 const m = extractFirstJsonObject(t);
 let raw: any = {};
 try {
 raw = m ? JSON.parse(m) : {};
 } catch (e) {
 console.error(`[pricing] FELL BACK: JSON.parse failed. stop_reason=${data.stop_reason} chars=${t.length} comps=${comps.length} tail=${JSON.stringify(t.slice(-120))} err=${String(e).slice(0, 80)}`);
 return fallback();
 }
 // Truncated/unparseable response (no marketCents) → degrade to the honest sold-median fallback
 // with its correct confidence + rationale, rather than a half-defaulted mix of model + defaults.
 if (typeof raw.marketCents !== "number" || raw.marketCents <= 0) {
 console.error(`[pricing] FELL BACK: no marketCents. stop_reason=${data.stop_reason} chars=${t.length} comps=${comps.length} head=${JSON.stringify(t.slice(0, 120))}`);
 return fallback();
 }
 const keptIdx: number[] = Array.isArray(raw.keptIndices) ? raw.keptIndices.filter((n: any) => Number.isInteger(n) && comps[n]) : [];
 const kept = keptIdx.length ? keptIdx.map((i: number) => comps[i]) : comps.slice(0, 8);
 return {
 marketCents: typeof raw.marketCents === "number" && raw.marketCents > 0 ? Math.round(raw.marketCents) : fallback().marketCents,
 low: typeof raw.lowCents === "number" ? Math.round(raw.lowCents) : null,
 high: typeof raw.highCents === "number" ? Math.round(raw.highCents) : null,
 confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
 kept,
 rationale: typeof raw.rationale === "string" ? raw.rationale : "Based on comparable resale prices.",
 modelFallback: false,
 };
 } catch (e) {
 console.error(`[pricing] FELL BACK: threw — ${String(e).slice(0, 160)}`);
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
 excludeSoldId?: number | null; // accuracy eval only: keep the sale being graded out of its own comps
 /**
  * The SELLER's shop name. Used only to strip it back out of the query — Shopify defaults a
  * product's vendor to the shop name, so store names leak into titles and were being searched
  * verbatim ("to us vintage stuart weiztman brown heels sku tuv 7896").
  */
 storeName?: string | null;
 context?: { brand?: string | null; era?: string | null; material?: string | null; condition?: string | null; conditionGrade?: string | null; runway?: string | null; celebrity?: string | null; trend?: string | null }; // the identified piece + condition + live demand signal, for knowledge/trend-aware valuation
}): Promise<PriceEstimate> {
 // Fetch external comps and THIS platform's own realized-price benchmark together. The
 // internal benchmark (privacy-gated, from the nightly market_metrics) is the strongest
 // signal — actual sales on our marketplace for this brand/category.
 const category = inferCategoryFromTitle(opts.query) as string;
 const brand = opts.context?.brand ?? null;
 const material = opts.context?.material ?? null;
 // BRAND FIRST. The vision draft writes searchQuery before reverse-image resolves the brand, so
 // without this every downstream search (eBay, Shopping, RealReal, Vestiaire) runs brand-less and
 // prices the piece against look-alikes. Rewriting it here fixes ALL of them at once, including
 // the retailer passes and the comp-cache key, so the cache is keyed to the branded query too.
 // Strip what no marketplace can match — the store's own name and internal SKUs — BEFORE the brand
 // is prepended. A search carrying "sku tuv #62314" returns loosely-related items across every price
 // point, which is how a $265 dress came to be priced from a pool whose median was $36.
 const cleaned = cleanQuery(opts.query, opts.storeName);
 if (cleaned !== opts.query.trim()) {
  const e = explainClean(opts.query, opts.storeName);
  console.log(`[pricing] query cleaned (removed ${e.removed.join(", ")}): ${JSON.stringify(opts.query)} → ${JSON.stringify(cleaned)}`);
 }
 const query = brandFirstQuery(cleaned, brand, category);
 if (query !== opts.query) console.log(`[pricing] query rewritten brand-first: "${opts.query}" → "${query}"`);
 // For an UNBRANDED piece, anchor to VYA's own golden set (how comparable unbranded pieces price,
 // by category × material tier) instead of guessing — real prices from curated stores.
 const unbrandedBenchmark = !brand ? await getUnbrandedBenchmark({ category, material, excludeSoldId: opts.excludeSoldId ?? null }).catch(() => null) : null;
 // Owned-data-first: reuse recently-cached comps (from past PAID lookups) before spending on a
 // new SerpApi basket. Only hit the live full basket (reverse-image + eBay + Shopping + RealReal)
 // on a cold/thin cache, then write every fresh comp back so the next similar item is free.
 // (Reverse-image comps in extraComps are always fresh — per photo — and also cached.)
 const [cached, benchmark, vyaComps, cacheAgeDays] = await Promise.all([
 getCachedComps({ query: query, brand, category, maxAgeDays: 45, limit: 40 }).catch(() => []),
 getInternalPriceBenchmark({ brand, category }).catch(() => null),
 getVyaComps({ brand, limit: 15, excludeSoldId: opts.excludeSoldId ?? null }).catch(() => []),
 newestCompAgeDays(query).catch(() => null),
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
 live = await fetchComps(query).catch(() => []);
 }
 if (isCompsConfigured()) console.log(`[serpapi] estimate "${query.slice(0, 60)}" brand=${brand ?? "?"} cached=${cached.length} ageDays=${cacheAgeDays ?? "none"} stale=${stale} live=${live.length}`);
 // Persist this run's fresh EXTERNAL comps (reverse-image + any live) for future reuse. VYA
 // comps come straight from our own tables, so there's nothing to cache.
 const fresh = rankComps([...(opts.extraComps || []), ...live]);
 if (fresh.length) await saveComps(fresh, { query: query, brand, category });
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
 const modelFiltered = filterModelConflicts(ranked, query);
 const comps = (modelFiltered.length >= 3 ? modelFiltered : ranked).slice(0, 40);

 // Comp CLUSTERING IS DELIBERATELY NOT USED HERE. It measured neutral in a controlled A/B (40 items,
 // same items before and after: 28% -> 23% within +/-20%, inside noise), and once same-piece
 // detection started working it turned actively harmful: with a single visually-confirmed match, the
 // densest-window rule discards it as a price OUTLIER and prices off the surrounding pile of cheap
 // keyword matches instead. Measured on a real Moschino top — one confirmed same-piece listing at
 // $550 dropped, priced from $52-$68 look-alike tanks, output $65.
 //
 // The lesson worth keeping: tighter is not righter. A cohesive cluster of the WRONG garment is a
 // confident wrong answer, and it outvotes the one comp that is actually this piece. Same-piece
 // evidence must never be filtered out by a rule about price distribution.
 //
 // selectComps stays in the tree (with its tests) as a measurement tool — comp-cohesion.ts reports
 // the spread and sample size honestly, which is useful for diagnosis — but it does not choose what
 // the price is built from.
 const modelComps = comps;

 let marketCents: number | null = null, low: number | null = null, high: number | null = null, confidence = 0, rationale = "", kept: Comp[] = [];
 // True when the valuation model did not answer and a raw comp median stood in for it.
 let modelFallback = false;

 if (comps.length) {
 const v = await valueFromComps(query, opts.photoUrl, modelComps, { ...opts.context, knowledgeHintCents: opts.knowledgeHintCents, internalBenchmark: strongExternal ? null : benchmark, unbrandedBenchmark });
 marketCents = v.marketCents; low = v.low; high = v.high; confidence = v.confidence; rationale = v.rationale; kept = v.kept;
 modelFallback = v.modelFallback ?? false;
 } else if (unbrandedBenchmark) {
 // No external comps + unbranded → anchor to the golden set (comparable unbranded VYA pieces).
 marketCents = unbrandedBenchmark.medianCents;
 low = unbrandedBenchmark.p25Cents;
 high = unbrandedBenchmark.p75Cents;
 confidence = 0.5;
 rationale = unbrandedBenchmark.basis === "sold"
   ? `Anchored to what comparable unbranded pieces (${unbrandedBenchmark.segment}) actually sold for — ${unbrandedBenchmark.count} completed sales across ${unbrandedBenchmark.storeCount}+ stores.`
   : `Anchored to VYA's golden set — how comparable unbranded pieces (${unbrandedBenchmark.segment}) are priced across ${unbrandedBenchmark.count} live listings from ${unbrandedBenchmark.storeCount}+ stores.`;
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

 // ── The band must reflect the comps, not a fixed cushion ────────────────────
 // Measured: only ~19% of realized sales landed inside the predicted range. The band was a tight
 // ±15%/+20% around the point estimate — so whenever the point was wrong, the band was wrong with
 // it, and it carried no information about how uncertain the answer actually was.
 //
 // A one-of-one piece genuinely sells across a spread; the kept comps ARE the observation of that
 // spread. So widen the band to at least cover the middle of them (p25–p75). A tight cluster still
 // yields a tight band — this only widens where the evidence is genuinely scattered, which is
 // exactly where a confident-looking narrow range was misleading the seller.
 // When comp selection found a coherent basis, the band is that cluster's OWN p25-p75. No cap is
 // needed there: a cohesive cluster is tight by construction, so this reports the real spread
 // instead of a decorative cushion. The capped path below remains for the thin/fallback case, where
 // the comps genuinely disagree and the honest answer is a wide band plus low confidence.
 if (marketCents != null && kept.length >= 3) {
 const prices = kept.map((c) => c.priceCents).filter((v) => v > 0).sort((a, b) => a - b);
 if (prices.length >= 3) {
  const at = (q: number) => prices[Math.min(prices.length - 1, Math.max(0, Math.round((prices.length - 1) * q)))];
  const p25 = at(0.25), p75 = at(0.75);
  // Widen toward the comps — but a band is only useful if a seller can act on it. Taking the raw
  // p25–p75 produced ranges averaging 311% of the price ("worth $700, somewhere between $200 and
  // $2,400"): right 65% of the time and worth nothing. Cap it at roughly the market's own spread
  // (the measured noise floor is ~25% median deviation), so the band stays honest AND usable.
  // When the comps disagree by more than this, the answer is lower confidence and better comp
  // filtering — not a range wide enough to contain any outcome.
  const FLOOR_MULT = 0.7, CEIL_MULT = 1.5;
  const minLow = Math.round(marketCents * FLOOR_MULT);
  const maxHigh = Math.round(marketCents * CEIL_MULT);
  if (low != null && p25 < low) low = Math.max(p25, minLow);
  if (high != null && p75 > high) high = Math.min(p75, maxHigh);
  // Keep the point estimate inside its own band — a comp spread skewed to one side can otherwise
  // leave marketCents sitting outside the range we just derived.
  if (low != null && marketCents < low) low = marketCents;
  if (high != null && marketCents > high) high = marketCents;
 }
 }

 // The model reports its own confidence, and it reports 0.8 on comp sets that disagree by 3x — it
 // is judging its reasoning, not the evidence. Cap it by the measured strength of the comps, so a
 // confident-sounding number can never outrun what the comps actually support. This is what lets
 // the caller (and the seller-question flow) tell "we know" from "we guessed".

 const floorCents = opts.costCents && opts.costCents > 0 ? Math.round(opts.costCents * (1 + opts.minMarkupBps / 10000)) : null;
 const suggestedCents = Math.max(marketCents ?? 0, floorCents ?? 0);

 let source: PriceEstimate["source"] = "none";
 if (suggestedCents > 0) {
 if (floorCents && suggestedCents === floorCents && (marketCents == null || floorCents >= marketCents)) source = "floor";
 else if (comps.length) source = "comps";
 else if (benchmark && marketCents === benchmark.medianCents) source = "benchmark";
 else source = "knowledge";
 }

 return { suggestedCents, marketCents, floorCents, lowCents: low, highCents: high, confidence, comps: kept, rationale, source, modelFallback };
}

export { isCompsConfigured };
