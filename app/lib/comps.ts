// Real resale comps via SerpApi — eBay *sold* listings (actual transaction prices,
// the gold standard) plus Google Shopping (broad market). Gated behind the key AND
// an explicit enable flag, so it's fully dormant — no calls, no spend — until you
// subscribe and flip PHOTOROOM-style SERPAPI_ENABLED=true.

import { unstable_cache } from "next/cache";
import { getCachedLens, saveCachedLens } from "./lens-cache-db";
import { recordSerp } from "./cost-tracker";
import { embedImages, cosine } from "./embeddings";
import { parseLensMatches, mergeLensMatches, pricedCount, priceToCents } from "./lens-products";
export { priceToCents };

const SERPAPI_URL = "https://serpapi.com/search.json";

export type Comp = { title: string; priceCents: number; currency: string; sold: boolean; source: string; link?: string; condition?: string };

export function isCompsConfigured(): boolean {
 return Boolean(process.env.SERPAPI_API_KEY) && process.env.SERPAPI_ENABLED === "true";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function serp(params: Record<string, string>): Promise<any | null> {
 const apiKey = process.env.SERPAPI_API_KEY;
 if (!apiKey) return null;
 const url = new URL(SERPAPI_URL);
 url.searchParams.set("api_key", apiKey);
 for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
 const q = (params.q ?? params._nkw ?? params.url ?? "").slice(0, 50);
 const t0 = Date.now();
 try {
 const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
 console.log(`[serpapi] call engine=${params.engine} q="${q}" ${res.ok ? "ok" : res.status} ${Date.now() - t0}ms`);
 if (!res.ok) return null;
 const json = await res.json();
 await recordSerp(params.engine);
 return json;
 } catch {
 console.log(`[serpapi] call engine=${params.engine} q="${q}" error ${Date.now() - t0}ms`);
 return null;
 }
}


// Fewer priced matches than this from the default Lens tab → also query the products tab.
const LENS_PRODUCTS_MIN_PRICED = Number(process.env.VYA_LENS_PRODUCTS_MIN_PRICED) || 3;

export type VisualMatch = { title: string; priceCents: number | null; source: string; link?: string; thumbnail?: string; similarity?: number; pricedFrom?: "products" };

/** Reverse-image search (Google Lens) for the exact / visually-identical product.
 *  This is the single best signal for BRAND ID and true price — it finds the same
 *  piece listed across the web instead of guessing from the look. [] if not enabled. */
export async function reverseImageMatches(imageUrl: string): Promise<VisualMatch[]> {
 if (!isCompsConfigured() || !imageUrl) return [];
 // Same photo → same matches. Reuse a cached result (no SerpApi spend) before searching.
 const cached = await getCachedLens(imageUrl);
 if (cached) return cached;
 const r = await serp({ engine: "google_lens", url: imageUrl, country: "us" });
 let matches = parseLensMatches(r);
 // Google badges a price on only a minority of default-tab results. When that leaves too few comps,
 // spend ONE more credit on Lens's products tab (every hit there is priced) and merge it in. Runs
 // before caching so a repeat lookup reuses the enriched set. VYA_LENS_PRODUCTS=false switches it off.
 if (r && pricedCount(matches) < LENS_PRODUCTS_MIN_PRICED && process.env.VYA_LENS_PRODUCTS !== "false") {
 const p = await serp({ engine: "google_lens", url: imageUrl, country: "us", type: "products" });
 const products = parseLensMatches(p, "products");
 matches = mergeLensMatches(matches, products);
 console.log(`[lens-products] primary_priced=${pricedCount(parseLensMatches(r))} products=${products.length} merged_priced=${pricedCount(matches)}`);
 }
 // Cache only a genuine SerpApi response (r != null) — never persist a transient timeout/error as
 // "no matches", which would poison this photo's lookups for the whole TTL.
 if (r) await saveCachedLens(imageUrl, matches);
 return matches;
}

/** Adaptive multi-frame reverse image. Sellers upload several photos but only the first
 *  ever gets searched — a bad primary frame (folded, back, a detail shot) finds nothing
 *  even when a later frame would nail the exact piece. This tries the primary first and
 *  only escalates to the next frames when the evidence so far is WEAK, merging + deduping
 *  matches across the frames it actually ran. Quota-aware: a clean product shot still
 *  costs exactly one Lens call; extra calls are spent only on the hard cases that need them.
 *  `strong(matchesSoFar)` decides "we have enough, stop" — the caller supplies it because
 *  what counts as enough (brand consensus vs. priced comps) depends on the intake context. */
export async function reverseImageBestOf(
 imageUrls: string[],
 opts?: { maxFrames?: number; strong?: (matches: VisualMatch[]) => boolean },
): Promise<{ matches: VisualMatch[]; framesUsed: number }> {
 const urls = (imageUrls || []).filter((u) => typeof u === "string" && u);
 if (!isCompsConfigured() || !urls.length) return { matches: [], framesUsed: 0 };
 const maxFrames = Math.max(1, Math.min(urls.length, opts?.maxFrames ?? 3));
 const strong = opts?.strong ?? ((ms: VisualMatch[]) => ms.filter((m) => m.priceCents && m.priceCents > 0).length >= 3);
 const merged: VisualMatch[] = [];
 const seen = new Set<string>();
 let framesUsed = 0;
 for (let i = 0; i < maxFrames; i++) {
 const found = await reverseImageMatches(urls[i]).catch(() => [] as VisualMatch[]);
 framesUsed++;
 for (const m of found) {
 const k = m.link || `${m.title}|${m.priceCents}`;
 if (seen.has(k)) continue;
 seen.add(k);
 merged.push(m);
 }
 if (strong(merged)) break; // enough evidence — don't spend more quota on this listing
 }
 return { matches: merged, framesUsed };
}

// Editorial / archival photo sources — Getty & the fashion press. Their captions are the richest
// PROVENANCE signal (who wore it, which show/season) and frequently DON'T name the brand, so they'd
// be dropped by the brand filter that guards pricing. We mine them separately for runway + celebrity.
const EDITORIAL_SOURCE = /getty|gettyimages|wireimage|imaxtree|shutterstock|vogue|wwd\.com|\bwwd\b|gorunway|firstview|nowfashion|launchmetrics|harper|harpersbazaar|elle\.com|hola|popsugar|whowhatwear|redcarpet/i;

/** Titles/captions of reverse-image matches that come from editorial/Getty sources — the raw
 *  evidence for "documented on the runway" and "as seen on <celebrity>". Kept UN-brand-filtered
 *  on purpose: a red-carpet caption naming the wearer rarely repeats the brand. [] if none. */
export function editorialCaptions(matches: VisualMatch[]): string[] {
 return matches.filter((m) => m.title && EDITORIAL_SOURCE.test(m.source || "")).map((m) => m.title).slice(0, 20);
}

// Similarity floor for "this web result is actually the SAME product as the photo". A seller's
// raw photo vs a clean catalog thumbnail sits lower than photo-to-photo, so this is deliberately
// below the same-physical-item bar used in bulk grouping. Tunable per real data via env + the log.
const VISUAL_MATCH_MIN = Number(process.env.VYA_VISUAL_MATCH_MIN) || 0.68;

/** Google Lens returns visually-APPROXIMATE results — a different model of the same brand, a
 *  look-alike — and those wrong comps drag the price to the wrong number (the "$685 Gucci that
 *  actually resells for $1,800" case: the matched bag wasn't the same bag). This embeds each
 *  match's thumbnail and keeps only those that genuinely look like the query photo, tagging each
 *  with its `similarity` (best first). It only ever FILTERS when it has the signal: with no query
 *  embedding, no thumbnails, or a total embedding failure it returns the input unchanged, so we
 *  never make pricing worse — we just remove the matches we can prove are a different item. */
export async function verifyMatchesByImage(
 queryEmbedding: number[] | null,
 matches: VisualMatch[],
 opts?: { min?: number; max?: number },
): Promise<{ verified: VisualMatch[]; checked: number; filtered: boolean }> {
 const min = opts?.min ?? VISUAL_MATCH_MIN;
 const max = opts?.max ?? 16;
 if (!queryEmbedding || !matches.length) return { verified: matches, checked: 0, filtered: false };
 const candidates = matches.filter((m) => m.thumbnail).slice(0, max);
 if (!candidates.length) return { verified: matches, checked: 0, filtered: false };

 const embs = await embedImages(candidates.map((m) => m.thumbnail as string)).catch(() => candidates.map(() => null));
 let embedded = 0;
 const scored = candidates.map((m, i) => {
 const e = embs[i];
 if (e) { embedded++; return { ...m, similarity: cosine(queryEmbedding, e) }; }
 return { ...m } as VisualMatch;
 });
 if (!embedded) return { verified: matches, checked: 0, filtered: false }; // couldn't verify → don't strip

 const kept = scored
 .filter((m) => m.similarity != null && m.similarity >= min)
 .sort((a, b) => (b.similarity as number) - (a.similarity as number));
 const sims = scored.filter((m) => m.similarity != null).map((m) => (m.similarity as number).toFixed(2)).sort().reverse();
 console.log(`[comps] visual-verify: kept ${kept.length}/${embedded} at min=${min} · sims=[${sims.join(", ")}]`);
 return { verified: kept, checked: embedded, filtered: true };
}

/** Reverse-image matches that carry a price → resale comps. Visually-identical items
 *  are the truest comps there are, so these anchor the valuation. */
export function matchesToComps(matches: VisualMatch[]): Comp[] {
 return matches
 .filter((m) => m.priceCents && m.priceCents > 0)
 .map((m) => ({ title: m.title, priceCents: m.priceCents as number, currency: "USD", sold: false, source: (m.source || "Visual match") + (m.pricedFrom === "products" ? " (Lens products)" : ""), link: m.link }));
}

// Authenticated-luxury resellers — the truest comps for designer pieces; surfaced first so
// they survive any downstream truncation before the valuation step sees them.
const PREMIUM_SOURCE = /real\s?real|vestiaire|fashionphile|rebag|luxury\s?closet|1st\s?dibs|farfetch/i;

/** Dedupe a comp set and rank authenticated-luxury sources first. */
export function rankComps(comps: Comp[]): Comp[] {
 const seen = new Set<string>();
 const unique = comps.filter((c) => { const k = c.link || `${c.title}|${c.priceCents}`; if (seen.has(k)) return false; seen.add(k); return true; });
 return unique.sort((a, b) => (PREMIUM_SOURCE.test(b.source) ? 1 : 0) - (PREMIUM_SOURCE.test(a.source) ? 1 : 0));
}

// Distinctive bag-MODEL names. Used to reject comps that are a different model than the query (e.g.
// pricing a "Jumbo Single Flap" off "Accordion"/"Camera"/"Westminster" bags dragged the median wrong).
// Generic words ("flap", "bag") are deliberately excluded — too many models share them.
const BAG_MODELS = [
 "jumbo", "maxi", "single flap", "double flap", "classic flap", "medium flap", "small flap", "mini flap",
 "2.55", "reissue", "wallet on chain", "woc", "accordion", "camera bag", "westminster", "boy bag",
 "gabrielle", "coco handle", "deauville", "cerf", "business affinity", "kelly", "birkin", "constance",
 "garden party", "evelyne", "picotin", "lindy", "bolide", "saddle", "baguette", "peekaboo", "spy",
 "speedy", "neverfull", "alma", "keepall", "pochette", "capucines", "twist", "petite malle", "lady dior",
 "book tote", "montaigne", "gaucho", "marcie", "paddington", "faye", "antigona", "nightingale", "pandora",
 "luggage tote", "trapeze", "sunset", "vanity", "bucket", "backpack",
 // Distinctive silhouettes/shapes — a Saddle should not be priced off a Hobo, etc.
 "hobo", "saddle", "pochette", "clutch", "tote bag", "shopper", "duffle", "bowling", "boston bag",
];

/** Reduce a long SEO title to a searchable brand + model + material core for eBay-SOLD lookup. The
 *  full listing title ("… Vertical Stitch … Bag Ruthenium Hardware") is too specific to match any
 *  sold listing, so eBay returns nothing and the pricer falls back to inflated asking prices. */
export function compactQuery(query: string): string {
 let q = " " + query.toLowerCase() + " ";
 q = q
  .replace(/\b(ruthenium|gunmetal|palladium|brushed|antiqued?|aged|light\s+gold|gold|silver)\s+hardware\b/g, " ")
  .replace(/\bhardware\b/g, " ")
  .replace(/\b(vertical|diagonal|horizontal)\s+stitch(ing)?\b/g, " ")
  .replace(/\b(authentic|genuine|pre[-\s]?owned|preowned|nwt|nwot|brand\s+new|excellent|very\s+good|good\s+condition|mint|rare|iconic|stunning|beautiful|gorgeous)\b/g, " ")
  .replace(/\b(bag|handbag|purse|pouch|tote)\b/g, " ")
  .replace(/\b(with|and|the|a|an|in|for|of|by)\b/g, " ")
  .replace(/[^\w\s&-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();
 return q.split(" ").slice(0, 8).join(" ");
}

/** Drop comps that are a DIFFERENT bag model than the query. Only fires when the query names a model
 *  AND a comp names ONLY other model(s) — comps with no model signal get the benefit of the doubt, and
 *  the caller falls back to the unfiltered set if this leaves too few. */
export function filterModelConflicts(comps: Comp[], query: string): Comp[] {
 const q = query.toLowerCase();
 const qModels = BAG_MODELS.filter((m) => q.includes(m));
 if (!qModels.length) return comps; // query has no model signal → nothing to conflict with
 return comps.filter((c) => {
  const t = (c.title || "").toLowerCase();
  const cModels = BAG_MODELS.filter((m) => t.includes(m));
  if (!cModels.length) return true; // comp names no model → keep (benefit of the doubt)
  return cModels.some((m) => qModels.includes(m)); // keep only if it shares the query's model
 });
}

/** eBay SOLD + completed — real transaction prices (the reality anchor reverse-image can't
 *  give, since Google Lens shows asking/active listings). One SerpApi call. Searched on a COMPACT
 *  query so the model actually matches recent sold listings (recency also fixes stale valuations). */
export async function fetchEbaySold(query: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 const r = await serp({ engine: "ebay", _nkw: compactQuery(query), ebay_domain: "ebay.com", LH_Sold: "1", LH_Complete: "1" });
 const comps: Comp[] = [];
 for (const row of (r?.organic_results || []).slice(0, 25)) {
 const cents = priceToCents(row.price);
 if (cents) comps.push({ title: String(row.title || ""), priceCents: cents, currency: "USD", sold: true, source: "eBay (sold)", link: row.link, condition: row.condition });
 }
 return comps;
}

/** Google Shopping — broad keyword market. One SerpApi call. Used as a FALLBACK when the
 *  reverse-image + eBay-sold set is thin (poor photo / very rare piece). */
export async function fetchGoogleShopping(query: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 const r = await serp({ engine: "google_shopping", q: query, gl: "us" });
 const comps: Comp[] = [];
 for (const row of (r?.shopping_results || []).slice(0, 30)) {
 const cents = priceToCents(row.extracted_price ?? row.price);
 if (cents) comps.push({ title: String(row.title || ""), priceCents: cents, currency: "USD", sold: false, source: String(row.source || "Google Shopping"), link: row.link });
 }
 return comps;
}


/** Legacy full basket (eBay sold + Google Shopping + RealReal pass) — 3 SerpApi calls. Kept
 *  for the dry-run comparison; estimatePrice now uses the leaner reverse-image + eBay-sold path. */
export async function fetchComps(query: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 // eBay-SOLD is the anchor and usually enough on its own. Two redundant calls dropped for speed:
 //  • the dedicated RealReal pass — reverse-image already surfaces RealReal/Vestiaire/etc. natively;
 //  • Google Shopping — now only fetched as a FALLBACK when the sold set is thin.
 // Cold lookups go from 3 SerpApi calls to 1 (common case) or 2 (thin), and the slow stragglers are gone.
 const ebay = await fetchEbaySold(query);
 if (ebay.length >= 6) return rankComps(ebay);
 const shopping = await fetchGoogleShopping(query).catch(() => []);
 return rankComps([...ebay, ...shopping]);
}

export type ResaleTrend = { momentumPct: number; trending: boolean; note: string; source: string };

/** Broad resale-world demand trend for a brand/item via Google Trends (SerpApi).
 *  Google search interest is the best cross-market proxy for real resale demand — it
 *  spans the whole secondhand world (what shoppers are hunting for across every site),
 *  not VYA's thin pilot traffic. Compares recent vs prior interest over ~3 months.
 *  Returns null when comps aren't enabled or there isn't enough signal. */
async function _fetchResaleTrendUncached(query: string): Promise<ResaleTrend | null> {
 if (!isCompsConfigured() || !query.trim()) return null;
 const r = await serp({ engine: "google_trends", q: query.trim(), data_type: "TIMESERIES", date: "today 3-m" });
 const timeline = (r?.interest_over_time?.timeline_data ?? []) as any[];
 const vals = timeline
 .map((t) => Number(t?.values?.[0]?.extracted_value ?? t?.values?.[0]?.value ?? NaN))
 .filter((n) => Number.isFinite(n));
 if (vals.length < 8) return null; // not enough of a series to trust a direction
 const half = Math.floor(vals.length / 2);
 const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / (a.length || 1);
 const prior = avg(vals.slice(0, half));
 const recent = avg(vals.slice(half));
 if (prior <= 0) return null;
 const momentumPct = Math.round(((recent - prior) / prior) * 100);
 return {
 momentumPct,
 trending: momentumPct >= 10, // a real, sustained uptick — not noise
 note: `${momentumPct >= 0 ? "+" : ""}${momentumPct}% resale search demand vs prior 3mo`,
 source: "Google Trends",
 };
}

// Cache by query (brand+category) for a week: a brand's search-trend momentum barely moves
// week to week and is shared across every listing of that brand — so this collapses the cost
// from one SerpApi call per listing to roughly one call per brand per week.
export const fetchResaleTrend = unstable_cache(_fetchResaleTrendUncached, ["resale-trend"], {
 revalidate: 604800, // 7 days
});
