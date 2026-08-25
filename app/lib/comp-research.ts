import { partitionByVisualMatch, type VisualMatch } from "./comps.ts";
import { verifyMatchPrices } from "./comp-price-verify.ts";
import { recoverBlockedPrices } from "./price-via-search.ts";
import { titleHasBrand } from "./intake-pricing.ts";
import { getCachedLinkPrice, saveCachedLinkPrice } from "./link-price-cache-db.ts";

// ───────────────────────────────────────────────────────────────────────────
// The comp RESEARCHER — everything between "Google Lens returned 25 pictures" and
// "here is a clean list of comparable sales".
//
// This sequence used to live inline inside app/api/store/intake/route.ts, which meant only a
// seller upload ever got it. Every other caller — the price eval above all — did the one-line
// version (`matchesToComps(rawMatches)`) and silently priced off an unchecked pile: look-alikes
// never rejected, listings never opened for their price, blocked hosts never recovered. It did
// not error. It just returned a worse number, and the eval then reported that worse number as
// VYA's accuracy.
//
// So it lives here, as one function both paths call. If you add a step to how evidence is
// gathered, add it HERE and the measurement moves with production instead of drifting from it.
//
// Order matters, and is not obvious:
//  1. verify by IMAGE first — a visual match outranks a title match
//  2. brand-filter only what the image check could NOT score
//  3. open the surviving listings to read their price + sold status  (flag-gated)
//  4. for same-piece listings whose host blocks us, ask Google for the price instead
//
// Brand-filtering BEFORE the image check threw away the strongest comps we had: a Valentino dress
// lost all 8 of its priced matches because their titles ("Pink Polka Dot Swing Dress") never said
// Valentino, though they were photographs of the same dress.
// ───────────────────────────────────────────────────────────────────────────

export type CompResearch = {
 /** The finished comp-quality match list — hand this to matchesToComps(). */
 matches: VisualMatch[];
 /** What each stage did, so a caller can log it and a bad price can be diagnosed later. */
 visualRan: boolean;      // false = no embedding signal, so nothing could be image-verified
 verified: number;        // confirmed the same piece by image
 rejected: number;        // proved to be a different item, dropped
 uncheckedKept: number;   // unscoreable, kept on brand text alone
 pricesRead: number;      // gained a price by opening the listing page
 pricesRecovered: number; // gained a price via Google, because the host blocked us
 fellBack: boolean;       // filtering left nothing; priced off the unfiltered set instead
};

const linkVerifyOn = () => process.env.VYA_LINK_VERIFY_ENABLED === "true";
const priced = (ms: VisualMatch[]) => ms.filter((m) => m.priceCents && m.priceCents > 0).length;

/**
 * Turn raw reverse-image matches into evidence worth pricing from.
 *
 * Every stage is best-effort: a failure leaves the list as it was rather than emptying it. The
 * one thing this must never do is return nothing — pricing off an empty set is worse than
 * pricing off a rough one, which is why `fallback` exists.
 */
export async function researchComps(
 matches: VisualMatch[],
 opts?: {
  /** The query photo's embedding. Without it NOTHING can be image-verified — the check is skipped. */
  queryEmbedding?: number[] | null;
  /** Resolved brand, used only for matches the image check could not score. */
  brand?: string | null;
  /** What to price off if filtering leaves nothing. Defaults to the raw matches. */
  fallback?: VisualMatch[];
  /** Override the env flag (tests, and the admin debug route's ?linkVerify=1). */
  linkVerify?: boolean;
  /** Seams for tests — real callers should leave these alone. */
  scoreOne?: (url: string) => Promise<number | null>;
  fetcher?: (url: string) => Promise<string | null>;
 },
): Promise<CompResearch> {
 const brand = (opts?.brand || "").trim();
 const fallback = opts?.fallback ?? matches;
 const brandOf = (ms: VisualMatch[]) => (brand ? ms.filter((m) => titleHasBrand(m.title, brand)) : []);

 // ── 1. is it the same garment? ──
 const vis = await partitionByVisualMatch(matches, {
  queryEmbedding: opts?.queryEmbedding ?? null,
  ...(opts?.scoreOne ? { scoreOne: opts.scoreOne } : {}),
 }).catch(() => ({ verified: [] as VisualMatch[], rejected: [] as VisualMatch[], unchecked: matches, ran: false }));

 // ── 2. brand text, but only for what the image could not settle ──
 let kept: VisualMatch[];
 let uncheckedKept = 0;
 let fellBack = false;
 if (vis.ran) {
  const keptUnchecked = brandOf(vis.unchecked);
  uncheckedKept = keptUnchecked.length;
  kept = [...vis.verified, ...keptUnchecked];
  if (!kept.length) { kept = brandOf(matches).length ? brandOf(matches) : fallback; fellBack = true; }
 } else {
  const brandFiltered = brandOf(matches);
  kept = brandFiltered.length ? brandFiltered : fallback;
  fellBack = !brandFiltered.length;
 }

 const on = opts?.linkVerify ?? linkVerifyOn();
 const beforeRead = priced(kept);

 // ── 3. open the listing and read the price Google didn't carry ──
 const read = on
  ? await verifyMatchPrices(kept, {
     getCached: getCachedLinkPrice,
     saveCached: saveCachedLinkPrice,
     ...(opts?.fetcher ? { fetcher: opts.fetcher } : {}),
    }).catch(() => kept)
  : kept;
 const afterRead = priced(read);

 // ── 4. the host refused us; Google already crawled it ──
 const recovered = on ? await recoverBlockedPrices(read).catch(() => read) : read;

 return {
  matches: recovered,
  visualRan: vis.ran,
  verified: vis.verified.length,
  rejected: vis.rejected.length,
  uncheckedKept,
  pricesRead: Math.max(0, afterRead - beforeRead),
  pricesRecovered: Math.max(0, priced(recovered) - afterRead),
  fellBack,
 };
}

/** One-line summary for logs — the shape every pricing path should print. */
export const describeResearch = (r: CompResearch): string =>
 `verified=${r.verified} unchecked-kept=${r.uncheckedKept} rejected=${r.rejected}` +
 ` priced-by-page=${r.pricesRead} priced-by-search=${r.pricesRecovered}` +
 `${r.visualRan ? "" : " (no image signal)"}${r.fellBack ? " FELL BACK" : ""}`;
