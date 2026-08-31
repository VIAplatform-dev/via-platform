/**
 * Which pieces belong in which of a seller's collections, read from their own store.
 *
 * This is the answer that decides what a collection page shows. When it comes back empty the page
 * has nothing to serve, and falls back to the copy we took of the seller's page — which only ever
 * knew page one — or, until recently, to the seller's entire catalogue.
 *
 * It was coming back empty a great deal, for two reasons that look alike from the outside:
 *
 *  1. THE READER STOPPED AFTER 25 COLLECTIONS. Everything past that was never asked about, so never
 *     filed, so its page had nothing to show. The numbers line up almost exactly:
 *
 *       store                collections   holding nothing   never even attempted
 *       shop-vintage-charm           267               197                    242
 *       thenicheshop                 131                86                    106
 *       blummier                      76                47                     51
 *
 *  2. THE STORE SAYS STOP AND WE DO NOT LISTEN. blummier answers 11 of her 76 with HTTP 429 — and
 *     they are every collection from "ralph-lauren" to the end of the alphabet. We read in
 *     alphabetical order, so what happens is her store puts up a wall two thirds of the way through
 *     and we bounce off it for the rest of the run. The old code waited about a second and gave up;
 *     a rate limit does not lift in a second. So the unread collections are not bad collections,
 *     they are wherever we happened to be standing when the wall went up.
 *
 * Hence: read them all, pace them, honour the store's own Retry-After, and stay slower for the rest
 * of that store once it has told us off. And never, under any circumstance, record a collection we
 * could not read as "empty" — that answer blanks a page for a shopper.
 */

export type CollectionProduct = {
 handle?: string | null;
 /** Kept so we can tell whether the SELLER lists sold pieces in this collection — see
  *  app/lib/collection-sold-policy.ts. The pages carry it and we used to discard it. */
 variants?: { available?: boolean | null }[] | null;
};
/** The store asked us to slow down. `retryAfterMs` is its own Retry-After, when it sent one. */
export type Throttled = { throttled: true; retryAfterMs?: number };
/** One page of one collection. `null` = the read failed for some other reason — never "empty". */
export type CollectionPageResult = CollectionProduct[] | Throttled | null;
export type CollectionPageFetch = (slug: string, page: number) => Promise<CollectionPageResult>;

export type MembershipRead = {
 /** product handle → the collections it belongs to. */
 membership: Map<string, Set<string>>;
 /**
  * collection slug → its product handles IN THE SELLER'S OWN ORDER, as her feed listed them.
  *
  * The pages come back ordered and we used to throw that away, so a hosted store's rails were
  * ordered from the copy we took of the collection page on capture day and never re-sorted after.
  * Rails are the most volatile part of a shop; within days they are yesterday's pieces in
  * yesterday's order. Keeping the order costs no extra requests — it is already on the wire.
  *
  * COMPLETE READS ONLY. A collection listed here was read to its end (or to our page ceiling, where
  * what we have is still a true prefix). One we could not finish is absent, because ordering from
  * half a list would push everything we failed to read to the bottom of the seller's rail — the
  * same reason the membership merge refuses to overwrite an unread collection.
  */
 order: Map<string, string[]>;
 /**
  * collection slug → how much of it she lists as unavailable.
  *
  * Absent for a collection we could not read: zero-of-zero would read as "she has no sold pieces",
  * which is how a network error would come to empty a seller's archive.
  */
 stock: Map<string, { unavailable: number; total: number }>;
 /** Collections we could not read. Their contents must be left alone, not overwritten. */
 incomplete: string[];
 /** Collections beyond the ceiling, never asked about. Recorded rather than silently dropped. */
 notAttempted: string[];
 /**
  * Collections bigger than we will read in one pass. What we read is kept and used — unlike an
  * unread collection, a truncated one is still mostly right — but the caller is told, because the
  * shortfall is ours and not the seller's.
  */
 truncated: string[];
 /** How many times the store told us to slow down. Worth seeing in a run log. */
 throttleHits: number;
};

/**
 * Pages per collection, 250 each. Six was 1,500 — under chill-boutique's catch-all collection of
 * 1,789, so we filed 1,500 of it and said nothing, and the shortfall read as the seller's drift
 * rather than our own ceiling. Twenty is 5,000, and hitting it is now reported.
 */
const MAX_PAGES = 20;
/** A ceiling so one pathological store cannot pin a fleet run open. Hitting it is reported. */
const MAX_COLLECTIONS = 300;
/** Between collections, before any store has objected. */
const DELAY_MS = 700;
/** Waits after a refusal with no Retry-After of its own. Seconds, because rate limits are seconds. */
const BACKOFF_MS = [5000, 15000, 40000];
/** However rude the store, the standing pace never exceeds this. */
const MAX_PACE_MS = 60000;

const isThrottled = (r: CollectionPageResult): r is Throttled =>
 !!r && !Array.isArray(r) && (r as Throttled).throttled === true;

export async function readCollectionMembership(
 slugs: string[],
 opts: {
  fetchPage: CollectionPageFetch;
  /** Injected so tests do not sleep. */
  wait?: (ms: number) => Promise<void>;
  delayMs?: number;
  maxCollections?: number;
  maxPages?: number;
 },
): Promise<MembershipRead> {
 const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
 const cap = opts.maxCollections ?? MAX_COLLECTIONS;
 const maxPages = opts.maxPages ?? MAX_PAGES;

 const membership = new Map<string, Set<string>>();
 const stock = new Map<string, { unavailable: number; total: number }>();
 const order = new Map<string, string[]>();
 const incomplete: string[] = [];
 const truncated: string[] = [];
 const attempt = slugs.slice(0, cap);
 const notAttempted = slugs.slice(cap);
 // The standing pace, which only ever gets slower. A store that objected once will object again if
 // we go straight back to the old rate — which is exactly what lost blummier everything from R on.
 let pace = opts.delayMs ?? DELAY_MS;
 let throttleHits = 0;

 for (const [i, slug] of attempt.entries()) {
  if (i > 0) await wait(pace);
  let complete = false;
  // The feed's own sequence, kept as we page through it. A Set beside it so a piece listed twice
  // holds its first position without an O(n²) scan on a 5,000-piece collection.
  const sequence: string[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
   const prods = await readPage(slug, page);
   if (!prods) break; // unread — `complete` stays false and the caller preserves what we hold
   for (const p of prods) {
    // Counted before the handle check: a product with no variants is unavailable, not absent.
    const st = stock.get(slug) ?? { unavailable: 0, total: 0 };
    st.total++;
    if (!(p.variants || []).some((v) => v?.available)) st.unavailable++;
    stock.set(slug, st);
    const key = String(p.handle || "").trim();
    if (!key) continue;
    if (!membership.has(key)) membership.set(key, new Set());
    membership.get(key)!.add(slug);
    if (!seen.has(key)) { seen.add(key); sequence.push(key); }
   }
   // A short page is the end of the listing, and an empty one confirmed twice is an empty
   // collection — both are complete reads.
   if (prods.length < 250) { complete = true; break; }
   // As much of it as we will ever read in one pass. Usable, but ours is a floor not a total.
   if (page === maxPages) { complete = true; truncated.push(slug); }
  }
  if (!complete) incomplete.push(slug);
  // Only a finished read may set an order. A truncated one qualifies: what we hold is the feed's
  // first N, which is a true prefix of the seller's order, and the tail simply keeps the positions
  // it already had. A half-read one does not — see the note on `order`.
  else if (sequence.length) order.set(slug, sequence);
 }
 return { membership, order, stock, incomplete, notAttempted, truncated, throttleHits };

 /** One page, with the store's own answer respected. Null means we could not read it. */
 async function readPage(slug: string, page: number): Promise<CollectionProduct[] | null> {
  let result = await opts.fetchPage(slug, page);

  for (let attemptNo = 0; isThrottled(result) && attemptNo < BACKOFF_MS.length; attemptNo++) {
   throttleHits++;
   // The store's own number beats our guess — it is telling us the rate it wants.
   await wait(result.retryAfterMs ?? BACKOFF_MS[attemptNo]);
   // …and slow the standing pace for everything after this, not just the retry.
   pace = Math.min(MAX_PACE_MS, Math.max(pace * 2, 1500));
   result = await opts.fetchPage(slug, page);
  }
  if (isThrottled(result)) return null; // still refusing: unread, never "empty"
  if (!result) return null;

  // An empty answer is ambiguous: a real ending, or a store telling us to slow down without saying
  // so. Ask again before recording "this collection is empty".
  if (result.length === 0) {
   await wait(pace);
   const again = await opts.fetchPage(slug, page);
   if (isThrottled(again) || !again) return null;
   return again;
  }
  return result;
 }
}
