// Real resale comps via SerpApi — eBay *sold* listings (actual transaction prices,
// the gold standard) plus Google Shopping (broad market). Gated behind the key AND
// an explicit enable flag, so it's fully dormant — no calls, no spend — until you
// subscribe and flip PHOTOROOM-style SERPAPI_ENABLED=true.

// ".js" is required for Node's native TS runner (`node --test`) to resolve this — next has no
// package "exports" map, so extensionless subpaths fail in ESM. Webpack/Next resolve it the same.
import { unstable_cache } from "next/cache.js";
import { getCachedLens, saveCachedLens } from "./lens-cache-db.ts";
import { lensPriceToUsdCents, symbolToIso, toUsdCents } from "./currency.ts";
import { recordSerp } from "./cost-tracker.ts";
import { embedImages, cosine } from "./embeddings.ts";
import { inferBrandFromTitle } from "./market-data-db.ts";

/** Two brand strings refer to the same house (ignoring case/punctuation and sub-line wording). */
function sameBrand(a: string, b: string): boolean {
 const n = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
 const [x, y] = [n(a), n(b)];
 return Boolean(x && y) && (x.includes(y) || y.includes(x));
}

const SERPAPI_URL = "https://serpapi.com/search.json";

// saleType distinguishes a Buy It Now sale (someone paid the seller's price — the real signal)
// from an auction close (whatever the bidding happened to reach). Conflating them let a $900
// auction close anchor a piece whose asking cluster sat at $1,459–$2,082.
export type SaleType = "bin" | "auction" | null;
export type SourceTier = "vya" | "specialist" | "marketplace";
// exactPiece: this listing was VISUALLY confirmed to be the same garment as the seller's photo.
// It is the strongest comp there is and outranks every keyword match, sold or not — nine listings
// of one Versace runway dress ($1,733–$3,200) once lost to two unrelated sold dresses at $350–$500
// purely because the unrelated ones had `sold: true`.
export type Comp = { title: string; priceCents: number; currency: string; sold: boolean; source: string; link?: string; condition?: string; saleType?: SaleType; exactPiece?: boolean; similarity?: number };

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

/** Coerce SerpApi's many price shapes (number | {extracted_value} | {raw} | {from}) into cents. */
export function priceToCents(p: any): number | null {
 let v: number | null = null;
 if (typeof p === "number") v = p;
 else if (typeof p?.extracted_value === "number") v = p.extracted_value;
 else if (typeof p?.extracted === "number") v = p.extracted; // eBay engine
 else if (typeof p?.from?.extracted_value === "number") v = p.from.extracted_value;
 else if (typeof p?.from?.extracted === "number") v = p.from.extracted; // eBay price range
 else if (typeof p?.raw === "string") { const n = parseFloat(p.raw.replace(/[^0-9.]/g, "")); v = Number.isFinite(n) ? n : null; }
 else if (typeof p === "string") { const n = parseFloat(p.replace(/[^0-9.]/g, "")); v = Number.isFinite(n) ? n : null; }
 return v && v > 0 ? Math.round(v * 100) : null;
}

// nativePriceCents/nativeCurrency are set by link price-verify: what the product page stated
// before USD conversion, kept as comp provenance.
// `image` is the ORIGINAL store image; `thumbnail` is Google's ~225px re-crop. Scoring the full
// image separates the same garment from a look-alike about 10x better (measured on a real dress:
// same piece 0.744 → 0.954, best non-match 0.733 → 0.849), so we keep both and prefer the former.
export type VisualMatch = { title: string; priceCents: number | null; source: string; link?: string; thumbnail?: string; image?: string; similarity?: number; visuallyVerified?: boolean; sold?: boolean; nativePriceCents?: number; nativeCurrency?: string };

/** Reverse-image search (Google Lens) for the exact / visually-identical product.
 *  This is the single best signal for BRAND ID and true price — it finds the same
 *  piece listed across the web instead of guessing from the look. [] if not enabled. */
export async function reverseImageMatches(imageUrl: string, q?: string): Promise<VisualMatch[]> {
 if (!isCompsConfigured() || !imageUrl) return [];
 // Same photo + same refinement → same matches. The refinement is part of the cache key, so
 // tier 2/3 don't collide with tier 1's cached result for the same photo.
 const cacheKey = q ? `${imageUrl}#q=${q}` : imageUrl;
 const cached = await getCachedLens(cacheKey);
 if (cached) return cached;
 const r = await serp({ engine: "google_lens", url: imageUrl, country: "us", ...(q ? { q } : {}) });
 const matches = ((r?.visual_matches || []) as any[])
 .slice(0, 25)
 // lensPriceToUsdCents, not priceToCents: Lens matches are international, and their currency
 // symbol must convert (€450 ≠ $450). Ambiguous currency → unpriced (link-verify can rescue it).
 .map((m) => ({ title: String(m.title || ""), priceCents: lensPriceToUsdCents(m.price), source: String(m.source || ""), link: m.link as string | undefined, thumbnail: (typeof m.thumbnail === "string" && m.thumbnail) || undefined, image: (typeof m.image === "string" && m.image) || undefined }))
 .filter((m) => m.title);
 // Cache only a genuine SerpApi response (r != null) — never persist a transient timeout/error as
 // "no matches", which would poison this photo's lookups for the whole TTL.
 if (r) await saveCachedLens(cacheKey, matches);
 return matches;
}

/**
 * Tiered reverse-image search: image → image + BRAND → image + BRAND + CATEGORY.
 *
 * A photo alone often returns look-alikes from other labels, or too few priced matches to price
 * from. Re-running Lens with the brand attached narrows it to that brand's own market; adding the
 * category narrows it to the right garment. Brand ALWAYS leads the refinement, and a brand guard
 * drops any match whose title resolves to a different label — phrasing alone can't prevent a
 * refinement from wandering into another brand's listings.
 *
 * Escalation is evidence-driven, so a clean product shot still costs exactly one Lens call.
 * Unbranded pieces skip the brand tier and refine on category + material instead.
 */
export async function reverseImageTiered(
 imageUrl: string,
 opts: {
  brand?: string | null;
  category?: string | null;
  material?: string | null;
  queryEmbedding?: number[] | null;
  tier1Min?: number;
  tier2Min?: number;
  search?: (imageUrl: string, q?: string) => Promise<VisualMatch[]>;
  verifyAll?: boolean; // tests: treat every match as visually verified
 },
): Promise<{ matches: VisualMatch[]; tiersUsed: number; queries: (string | undefined)[] }> {
 const search = opts.search ?? ((u: string, q?: string) => reverseImageMatches(u, q));
 const tier1Min = opts.tier1Min ?? 5;
 const tier2Min = opts.tier2Min ?? 2;
 let brand = (opts.brand || "").trim();
 const cat = (opts.category || "").trim().replace(/ies$/i, "y").replace(/(ss|sh|ch|x|z)es$/i, "$1").replace(/([^s])s$/i, "$1");
 const material = (opts.material || "").trim();

 // Brand first, always. Without a brand, refine on what the piece intrinsically is.
 const refinements: string[] = [
  brand || null,
  brand ? [brand, cat].filter(Boolean).join(" ") : [material, cat].filter(Boolean).join(" ") || null,
 ].filter((q, i, a) => q && a.indexOf(q) === i) as string[];

 const merged: VisualMatch[] = [];
 const seen = new Set<string>();
 const queries: (string | undefined)[] = [];
 const add = (ms: VisualMatch[], refined: boolean) => {
  for (const m of ms) {
   // Brand guard: on a REFINED tier, a title that resolves to a different brand is dropped.
   // A title with no brand signal keeps the benefit of the doubt — many true same-piece
   // listings never name the label.
   if (refined && brand) {
    const inferred = inferBrandFromTitle(m.title);
    if (inferred && !sameBrand(inferred, brand)) continue;
   }
   const k = m.link || `${m.title}|${m.priceCents}`;
   if (seen.has(k)) continue;
   seen.add(k);
   merged.push(m);
  }
 };
 const pricedVerified = async (): Promise<number> => {
  const priced = merged.filter((m) => m.priceCents && m.priceCents > 0);
  if (opts.verifyAll) return priced.length;
  if (!opts.queryEmbedding) return priced.length;
  const { verified } = await partitionByVisualMatch(priced, { queryEmbedding: opts.queryEmbedding });
  return verified.length;
 };

 queries.push(undefined);
 add(await search(imageUrl).catch(() => []), false);
 let tiersUsed = 1;
 if ((await pricedVerified()) >= tier1Min) return { matches: merged, tiersUsed, queries };

 // At intake the brand usually ISN'T known yet — resolving it is half of what reverse-image is
 // for. So when the caller didn't supply one, take the consensus brand off tier 1's own match
 // titles and refine with that. Without this, an unlabelled photo could never escalate at all.
 if (!brand) {
  const tally = new Map<string, number>();
  for (const m of merged) {
   const b = inferBrandFromTitle(m.title);
   if (b) tally.set(b, (tally.get(b) || 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
   brand = top[0];
   refinements.length = 0;
   refinements.push(brand, [brand, cat].filter(Boolean).join(" "));
   console.log(`[comps] tier-1 brand consensus: ${brand} (${top[1]} matches)`);
  }
 }

 for (let i = 0; i < refinements.length; i++) {
  const q = refinements[i];
  queries.push(q);
  add(await search(imageUrl, q).catch(() => []), true);
  tiersUsed++;
  const enough = await pricedVerified();
  if (i === 0 && enough >= tier2Min) break;
 }
 console.log(`[comps] reverse-image tiers=${tiersUsed} queries=${JSON.stringify(queries)} matches=${merged.length}`);
 return { matches: merged, tiersUsed, queries };
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

/**
 * Split reverse-image matches into visually VERIFIED (same piece), REJECTED (provably different),
 * and UNCHECKED (no thumbnail, or scoring unavailable) — instead of silently dropping everything
 * that couldn't be scored.
 *
 * This exists so the caller can filter in the right ORDER. Filtering by brand text first threw
 * away the strongest evidence there is: a listing of the SAME dress whose title never mentions the
 * brand ("Pink Polka Dot Swing Dress"). A visual match outranks a title match, so verified matches
 * should survive on their own merit and only the unchecked ones need the brand-text fallback.
 *
 * `scoreOne` is injectable for testing; by default each thumbnail is embedded and compared to the
 * query photo. When nothing can be scored, `ran` is false and EVERYTHING lands in `unchecked` —
 * the caller then keeps its previous behaviour rather than loosening a filter with nothing to
 * replace it.
 */
export async function partitionByVisualMatch(
 matches: VisualMatch[],
 opts: { min?: number; max?: number; queryEmbedding?: number[] | null; scoreOne?: (imageUrl: string) => Promise<number | null> },
): Promise<{ verified: VisualMatch[]; rejected: VisualMatch[]; unchecked: VisualMatch[]; ran: boolean }> {
 const min = opts.min ?? VISUAL_MATCH_MIN;
 const max = opts.max ?? 16;
 const verified: VisualMatch[] = [], rejected: VisualMatch[] = [], unchecked: VisualMatch[] = [];

 // Default scorer: embed each thumbnail and compare against the query photo's embedding.
 // Scores ONE image URL. The image-vs-thumbnail fallback lives in the loop below, not in here,
 // so it applies to any injected scorer too (and is testable on its own).
 const scoreOne = opts.scoreOne ?? (async (url: string) => {
  if (!opts.queryEmbedding) return null;
  const [e] = await embedImages([url]).catch(() => [null]);
  return e ? cosine(opts.queryEmbedding, e) : null;
 });

 // Full image first, Google's ~225px thumbnail as fallback. Some hosts (Vestiaire, Poshmark,
 // TikTok) block the embedding API outright, and losing those matches entirely would be worse
 // than scoring their lower-fidelity thumbnail.
 const scoreMatch = async (m: VisualMatch): Promise<number | null> => {
  for (const url of [m.image, m.thumbnail]) {
   if (!url) continue;
   const s = await scoreOne(url).catch(() => null);
   if (s != null) return s;
  }
  return null;
 };

 let scored = 0;
 // A match with no thumbnail is unscoreable by definition — never hand it to the scorer.
 const scores = await Promise.all(matches.slice(0, max).map((m) => (m.image || m.thumbnail ? scoreMatch(m) : Promise.resolve(null))));
 matches.forEach((m, i) => {
  const s = i < scores.length ? scores[i] : null;
  if (s == null) { unchecked.push(m); return; }
  scored++;
  if (s >= min) verified.push({ ...m, similarity: s, visuallyVerified: true });
  else rejected.push({ ...m, similarity: s });
 });
 if (!scored) return { verified: [], rejected: [], unchecked: matches, ran: false };
 console.log(`[comps] visual-partition: verified ${verified.length}, rejected ${rejected.length}, unchecked ${unchecked.length} (min=${min})`);
 return { verified, rejected, unchecked, ran: true };
}

/** Reverse-image matches that carry a price → resale comps. Visually-identical items
 *  are the truest comps there are, so these anchor the valuation. A match link-verified
 *  as SoldOut enters as a SOLD comp — a realized transaction, the strongest signal. */
export function matchesToComps(matches: VisualMatch[]): Comp[] {
 return matches
 .filter((m) => m.priceCents && m.priceCents > 0)
 .map((m) => ({
  title: m.title, priceCents: m.priceCents as number, currency: "USD", sold: m.sold === true,
  source: m.source || "Visual match", link: m.link,
  ...(m.visuallyVerified ? { exactPiece: true as const, similarity: m.similarity } : {}),
 }));
}

// Authenticated-luxury resellers — the truest comps for designer pieces; surfaced first so
// they survive any downstream truncation before the valuation step sees them.
const PREMIUM_SOURCE = /real\s?real|vestiaire|fashionphile|rebag|luxury\s?closet|1st\s?dibs|farfetch/i;
// General marketplaces: anyone can list anything, so caliber and authentication vary wildly.
const MARKETPLACE_SOURCE = /ebay|depop|etsy|poshmark|mercari|grailed|vinted|shopozz|aliexpress|amazon|google shopping|visual match/i;

/** Which caliber of seller a comp came from. A specialist archival dealer's price is far better
 *  evidence for a 1999 runway piece than a general-marketplace listing, and VYA's own realized
 *  prices are the strongest signal of all. Unrecognized sources default to `specialist` — they're
 *  overwhelmingly the independent boutiques link-verify surfaces (Time's Up Vintage, Anteactus),
 *  which are curated sellers, not general marketplaces. */
export function sourceTier(source: string): SourceTier {
 const s = (source || "").trim();
 if (/^vya\b/i.test(s)) return "vya";
 if (MARKETPLACE_SOURCE.test(s)) return "marketplace";
 return "specialist"; // PREMIUM_SOURCE and independent curated dealers alike
}

/** Dedupe a comp set and rank by match quality first, source tier second.
 *  Same-piece comps must survive the .slice(0, 40) cap in estimatePrice — if they
 *  sort below keyword matches from premium sources, they get truncated out and the
 *  model never sees the branch's strongest evidence. */
export function rankComps(comps: Comp[]): Comp[] {
 const seen = new Set<string>();
 const unique = comps.filter((c) => { const k = c.link || `${c.title}|${c.priceCents}`; if (seen.has(k)) return false; seen.add(k); return true; });
 return unique.sort((a, b) =>
  (b.exactPiece ? 1 : 0) - (a.exactPiece ? 1 : 0)
  || (PREMIUM_SOURCE.test(b.source) ? 1 : 0) - (PREMIUM_SOURCE.test(a.source) ? 1 : 0)
 );
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

/** Parse eBay sold rows into comps, separating Buy It Now sales from auction closes.
 *  Pure + exported for testing. A BIN sale means a buyer paid the seller's asking price; an
 *  auction close only means the bidding stopped there. They are labelled distinctly so the
 *  valuation can anchor on the former and treat the latter as a floor. */
export function parseEbayRows(rows: any[]): Comp[] {
 const comps: Comp[] = [];
 for (const row of (rows || []).slice(0, 25)) {
 const cents = priceToCents(row?.price);
 if (!cents) continue;
 const fmt = String(row?.buying_format ?? row?.buying_format_text ?? "").toLowerCase().replace(/[\s_-]/g, "");
 // Only label what eBay actually told us — an unlabelled row is unknown, never assumed BIN.
 const saleType: SaleType = fmt.includes("auction") ? "auction" : fmt.includes("buyitnow") || fmt === "bin" ? "bin" : null;
 comps.push({
  title: String(row.title || ""),
  priceCents: cents,
  currency: "USD",
  sold: true,
  saleType,
  source: saleType === "auction" ? "eBay (auction)" : "eBay (sold)",
  link: row.link,
  condition: row.condition,
 });
 }
 return comps;
}

/** eBay SOLD + completed — real transaction prices (the reality anchor reverse-image can't
 *  give, since Google Lens shows asking/active listings). One SerpApi call. Searched on a COMPACT
 *  query so the model actually matches recent sold listings (recency also fixes stale valuations).
 *  Requests BUY IT NOW sales specifically: auction closes reflect bidding dynamics, not market
 *  value, and a single low close was dragging archival pieces ~45% under. */
export async function fetchEbaySold(query: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 const r = await serp({ engine: "ebay", _nkw: compactQuery(query), ebay_domain: "ebay.com", LH_Sold: "1", LH_Complete: "1", buying_format: "BIN" });
 return parseEbayRows(r?.organic_results || []);
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

export const REALREAL_SOURCE = /real\s?real/i;
export const VESTIAIRE_SOURCE = /vestiaire/i;

/** Keep only the Shopping rows that genuinely come from the retailer we asked for, as USD comps.
 *  Pure + exported so the filtering/pricing is testable without a SerpApi call. A row whose
 *  currency can't be resolved is DROPPED rather than assumed USD (same rule as everywhere else). */
export function pickRetailerRows(rows: any[], sourceRe: RegExp, label: string): Comp[] {
 const comps: Comp[] = [];
 for (const row of (rows || []).slice(0, 20)) {
 if (!sourceRe.test(String(row?.source || ""))) continue;
 const cents = priceToCents(row.extracted_price ?? row.price);
 if (!cents) continue;
 // gl=us means these are almost always USD, but Shopping does surface foreign merchants —
 // take the symbol from the raw price string when there is one.
 const symbol = typeof row.price === "string" ? (row.price.match(/[^\d\s.,]+/)?.[0] ?? null) : null;
 const iso = symbol ? symbolToIso(symbol) : "USD";
 const usdCents = iso ? toUsdCents(cents, iso) : null;
 if (!usdCents) continue;
 comps.push({ title: String(row.title || ""), priceCents: usdCents, currency: "USD", sold: false, source: label, link: row.link });
 }
 return comps;
}

/** Dedicated retailer keyword pass through Google Shopping. This is how we price retailers whose
 *  own pages block automated access — Vestiaire returns 403 even to a full browser header set,
 *  but Google has already crawled them, so we read the price out of SerpApi's index instead of
 *  the retailer. One SerpApi call per pass. */
async function fetchRetailerPass(query: string, term: string, sourceRe: RegExp, label: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 const r = await serp({ engine: "google_shopping", q: `${query} ${term}`, gl: "us" });
 return pickRetailerRows(r?.shopping_results || [], sourceRe, label);
}

const fetchRealRealPass = (query: string) => fetchRetailerPass(query, "the real real", REALREAL_SOURCE, "The RealReal");
/** Vestiaire Collective — a top-tier authenticated-resale comp source we cannot fetch directly. */
export const fetchVestiairePass = (query: string) => fetchRetailerPass(query, "vestiaire collective", VESTIAIRE_SOURCE, "Vestiaire Collective");

/** Full basket: eBay sold + Google Shopping + RealReal + Vestiaire passes — 4 SerpApi calls
 *  (3 when the Vestiaire pass is disabled with VYA_VESTIAIRE_PASS=false). The Vestiaire pass
 *  costs one extra search per live fetch and buys prices from a source we otherwise cannot
 *  read at all, since their pages 403 automated requests. */
export async function fetchComps(query: string): Promise<Comp[]> {
 if (!isCompsConfigured() || !query.trim()) return [];
 const vestiaireOn = process.env.VYA_VESTIAIRE_PASS !== "false";
 const [ebay, shopping, realReal, vestiaire] = await Promise.all([
 fetchEbaySold(query),
 fetchGoogleShopping(query),
 fetchRealRealPass(query),
 vestiaireOn ? fetchVestiairePass(query) : Promise.resolve([] as Comp[]),
 ]);
 return rankComps([...ebay, ...shopping, ...realReal, ...vestiaire]);
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
