// Recovering the price of a listing whose page we cannot open.
//
// The problem: reverse image finds the EXACT garment on Vestiaire, gem.app or Depop, Google gives
// us a title and a link but no price, and fetching the page ourselves returns 403 (Vestiaire, both
// subdomains), 202-with-no-body (gem.app) or a block page (Depop). The strongest comp we have is
// then discarded for lacking a number, and the estimate falls back to whatever loose keyword
// matches happened to be readable — a $30 koi artwork and a $99 sweater vest, in the case that
// prompted this.
//
// The insight (Hana's): SerpApi is never blocked. Google has already crawled those listings and
// knows their prices; we do not need to reach the site at all. Searching Google Shopping for the
// listing's own title returns the price we were trying to scrape:
//
//   query "Moschino Black Koi Fish Graphic Sleeveless Top Size 10 US"
//   → $580.00 · Depop · "Vintage Moschino Y2K Japanese Koi Fish Sleeveless…"
//
// One search, no proxies, no scraping infrastructure, using a service already being paid for.

import { serp, priceToCents, type VisualMatch } from "./comps.ts";

/** How many blocked same-piece matches to look up per item. Each is one SerpApi search. */
const MAX_LOOKUPS = 3;

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const hostOf = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\.|^us\./, "") : ""; } catch { return ""; } };

/**
 * Do a shopping result and the match we're pricing describe the same listing?
 *
 * Two independent checks, either of which is enough:
 *   • same host — the shopping result points at the same shop as the match
 *   • strong title overlap — Google often rewrites titles, so exact equality is too strict, but a
 *     listing sharing most of its distinctive words is the same item
 *
 * This guard is the whole safety of the approach. Without it, a title search returns *something*
 * priced for every query, and we would be laundering an unrelated listing into a same-piece comp —
 * which is exactly the failure this is meant to fix.
 */
export function looksLikeSameListing(matchTitle: string, matchLink: string | undefined, resultTitle: string, resultSource: string, resultLink?: string): boolean {
 const mh = hostOf(matchLink);
 const rh = hostOf(resultLink);
 if (mh && (mh === rh || norm(resultSource).includes(norm(mh).split(" ")[0]))) return true;

 const a = new Set(norm(matchTitle).split(" ").filter((w) => w.length > 3));
 const b = new Set(norm(resultTitle).split(" ").filter((w) => w.length > 3));
 if (a.size < 3) return false;
 let shared = 0;
 for (const w of a) if (b.has(w)) shared++;
 return shared / a.size >= 0.6;
}

/**
 * Price a single listing by searching for its title. null when nothing convincing comes back —
 * silence is correct here, an invented price is not.
 */
export async function priceByTitleSearch(m: VisualMatch): Promise<{ priceCents: number; source: string } | null> {
 const title = (m.title || "").trim();
 if (title.length < 12) return null; // too generic to identify anything
 const r = await serp({ engine: "google_shopping", q: title }).catch(() => null);
 const rows = (r?.shopping_results ?? []) as Array<Record<string, unknown>>;
 for (const row of rows.slice(0, 8)) {
  const cents = priceToCents(row.price ?? row.extracted_price);
  if (!cents || cents <= 0) continue;
  if (!looksLikeSameListing(title, m.link, String(row.title || ""), String(row.source || ""), String(row.link || ""))) continue;
  return { priceCents: cents, source: String(row.source || "Google Shopping") };
 }
 return null;
}

/**
 * Fill in prices for same-piece matches we could not read, by asking Google what they cost.
 *
 * Deliberately narrow: only matches that are already visually confirmed as THIS garment, only ones
 * still missing a price after the direct fetch, and only the first few. A blocked look-alike is not
 * worth a search; a blocked same-piece listing is the most valuable comp on the page.
 */
export async function recoverBlockedPrices(matches: VisualMatch[], max = MAX_LOOKUPS): Promise<VisualMatch[]> {
 const needy = matches.filter((m) => m.visuallyVerified && !(m.priceCents && m.priceCents > 0) && (m.title || "").length >= 12);
 if (!needy.length) return matches;

 const targets = needy.slice(0, max);
 const found = new Map<VisualMatch, { priceCents: number; source: string }>();
 await Promise.all(targets.map(async (m) => {
  const hit = await priceByTitleSearch(m).catch(() => null);
  if (hit) found.set(m, hit);
 }));

 if (found.size) {
  console.log(`[price-via-search] looked up ${targets.length} blocked same-piece listing(s), recovered ${found.size}`);
 }
 return matches.map((m) => {
  const hit = found.get(m);
  // `sold` is deliberately left alone: a shopping result is a live offer, and inferring a realized
  // sale from one would be inventing evidence.
  return hit ? { ...m, priceCents: hit.priceCents, source: m.source || hit.source } : m;
 });
}
