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
import { symbolToIso, toUsdCents } from "./currency.ts";

/** How many blocked same-piece matches to look up per item. Each is one SerpApi search. */
const MAX_LOOKUPS = 3;
/** Confirmed, priced listings of THIS garment above which another lookup isn't worth a search.
 *  Overridable so the gate itself can be A/B'd: VYA_RECOVERY_ENOUGH=999 disables it entirely. */
const ENOUGH_PRICED = Number(process.env.VYA_RECOVERY_ENOUGH) || 3;

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

// ── Realized sale prices from a host that will not let us in ──
//
// Sold-through is the most valuable signal in the whole system and has been the biggest open gap:
// a direct page fetch can read it, but the hosts worth reading block us, and a Google Shopping
// result is a live offer, so inferring a completed sale from one would be inventing evidence.
//
// It turns out we do not have to infer anything. Google's own crawl of those pages carries the
// realized price in the result snippet, verbatim:
//
//   "Celine. Triomphe Vintage leather travel bag. Very good condition. Brown, Leather.
//    Sold at £313.71."
//
// That is the transaction, quoted by Google, for a listing that returns 403 to us. Not a guess.
//
// The extraction is deliberately narrow. Only "Sold at <price>" counts — Vestiaire's own phrasing
// for a completed sale. A snippet reading "Sold with. Dust bag" or "item sold. shipped. canceled"
// is not a realized price, and a bare /sold/ match would sweep both in.
// The currency marker is REQUIRED, not optional. "Sold at 4 500 kr" with an optional marker parsed
// as $4.00 — a plausible-looking number that would have entered the comp set as a real sale. An
// unrecognised or absent currency means we cannot say what the piece sold for, so we don't.
const SOLD_AT = /\bsold\s+(?:at|for)\s*(US\$|CA\$|AU\$|C\$|A\$|[€£$¥₩]|EUR|GBP|USD|CAD|AUD|CHF|JPY)\s*([\d][\d.,]*\d|\d)/i;

/** Pull a realized sale price out of a search snippet, in USD cents. null when there isn't one. */
export function extractSoldPrice(text: string): number | null {
 const m = SOLD_AT.exec(text || "");
 if (!m) return null;
 const cents = priceToCents(m[2]);
 if (!cents || cents <= 0) return null;
 const iso = symbolToIso(m[1]);
 // A foreign price we cannot convert is worse than no price — it would enter the comp set as if
 // it were dollars. Drop it rather than quote it wrong.
 const usd = toUsdCents(cents, iso);
 return usd && usd > 0 ? usd : null;
}

/**
 * Ask Google what a blocked listing actually SOLD for, scoped to its own host.
 *
 * Returns the realized price and marks the comp sold, which promotes it above every asking price
 * in the valuation. null when the crawl shows no completed sale — silence is correct, and the
 * caller falls back to looking up the live asking price instead.
 */
export async function soldByTitleSearch(m: VisualMatch): Promise<{ priceCents: number; source: string } | null> {
 const title = (m.title || "").trim();
 if (title.length < 12) return null;
 const host = hostOf(m.link);
 if (!host) return null;
 const r = await serp({ engine: "google", q: `site:${host} "sold at" ${title}` }).catch(() => null);
 const rows = (r?.organic_results ?? []) as Array<Record<string, unknown>>;
 for (const row of rows.slice(0, 6)) {
  const rowTitle = String(row.title || "");
  const text = `${rowTitle} ${String(row.snippet || "")}`;
  const cents = extractSoldPrice(text);
  if (!cents) continue;
  // Same guard as the price lookup: the sale has to belong to THIS listing, not to any piece the
  // host happens to have sold.
  if (!looksLikeSameListing(title, m.link, rowTitle, host, String(row.link || ""))) continue;
  return { priceCents: cents, source: `${host} (sold)` };
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

 // Recovery is the most expensive step in the pipeline — 178 searches per 100 items, at up to
 // three per piece. It earns that when the same-piece evidence is thin, which is the case it was
 // built for. It earns much less when three confirmed listings of this exact garment already
 // carry prices: a fourth changes the median very little and costs a search every time.
 const alreadyPriced = matches.filter((m) => m.visuallyVerified && m.priceCents && m.priceCents > 0).length;
 if (alreadyPriced >= ENOUGH_PRICED) {
  console.log(`[price-via-search] ${alreadyPriced} same-piece comps already priced — skipping ${Math.min(needy.length, max)} lookup(s)`);
  return matches;
 }

 const targets = needy.slice(0, max);
 const found = new Map<VisualMatch, { priceCents: number; source: string; sold: boolean }>();
 await Promise.all(targets.map(async (m) => {
  // A realized sale beats a live offer at any price, so try for it first. Only when the crawl
  // shows no completed sale do we spend a second search on the asking price.
  const soldHit = await soldByTitleSearch(m).catch(() => null);
  if (soldHit) { found.set(m, { ...soldHit, sold: true }); return; }
  const hit = await priceByTitleSearch(m).catch(() => null);
  if (hit) found.set(m, { ...hit, sold: false });
 }));

 if (found.size) {
  const soldN = [...found.values()].filter((v) => v.sold).length;
  console.log(`[price-via-search] looked up ${targets.length} blocked same-piece listing(s), recovered ${found.size} (${soldN} as REALIZED sales)`);
 }
 return matches.map((m) => {
  const hit = found.get(m);
  if (!hit) return m;
  // `sold` is set ONLY for a price Google quoted as a completed sale. A shopping result is a live
  // offer, and inferring a realized sale from one would be inventing evidence.
  return { ...m, priceCents: hit.priceCents, source: m.source || hit.source, ...(hit.sold ? { sold: true } : {}) };
 });
}
