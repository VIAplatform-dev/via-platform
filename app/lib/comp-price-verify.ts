import { symbolToIso, toUsdCents } from "./currency.ts";

// ───────────────────────────────────────────────────────────────────────────
// Link price-verify. Google Lens only returns a `price` when Google happens to have
// merchant data — many true visual matches (boutique resale stores) come back priceless
// even though their product page states one. This fetches those pages directly (our own
// fetch, zero SerpApi spend) and extracts price + currency + availability from the page's
// structured data: JSON-LD Product → OpenGraph price meta → microdata. No LLM on the
// default path. Everything is best-effort: a blocked/JS-rendered page degrades silently
// to the match staying unpriced — never an error, never a guessed number.
// ───────────────────────────────────────────────────────────────────────────

export type ExtractedPrice = { priceCents: number | null; currency: string | null; availability: "in_stock" | "sold" | null };

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Money string → cents, handling BOTH conventions. schema.org mandates dot-decimals, but
 * `og:price:amount` and microdata are unstandardized and European stores emit their local
 * format — "9.995,00" means 9,995 and "9,99" means 9.99. Reading those as US numbers priced
 * a 9,995 DKK dress at $9.99 (1000× low) and a 9,99 one at $999 (100× high).
 *
 * Rules: with both separators present, whichever comes LAST is the decimal point. With only
 * one, it's a decimal point when 1-2 digits follow and a thousands separator when 3 do — a
 * bare "9.995" is 9,995, since prices essentially never carry three decimal places.
 */
export function parseMoney(v: any): number | null {
 if (typeof v === "number") return v > 0 ? Math.round(v * 100) : null;
 if (typeof v !== "string") return null;
 const s = v.replace(/[^\d.,]/g, ""); // drop currency symbols, spaces, nbsp
 if (!/\d/.test(s)) return null;

 const lastDot = s.lastIndexOf(".");
 const lastComma = s.lastIndexOf(",");
 let normalized: string;
 if (lastDot !== -1 && lastComma !== -1) {
  // Both present — the later one is the decimal separator, the other groups thousands.
  const decimalAt = Math.max(lastDot, lastComma);
  normalized = s.slice(0, decimalAt).replace(/[.,]/g, "") + "." + s.slice(decimalAt + 1).replace(/[.,]/g, "");
 } else if (lastDot !== -1 || lastComma !== -1) {
  const sep = lastDot !== -1 ? "." : ",";
  const at = lastDot !== -1 ? lastDot : lastComma;
  const trailing = s.length - at - 1;
  const isDecimal = trailing === 1 || trailing === 2;
  normalized = isDecimal
   ? s.slice(0, at).split(sep).join("").replace(/[.,]/g, "") + "." + s.slice(at + 1)
   : s.replace(/[.,]/g, "");
 } else {
  normalized = s;
 }
 const n = parseFloat(normalized);
 return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

// Kept as the internal name used throughout extraction.
const toCents = parseMoney;

function availabilityOf(s: any): "in_stock" | "sold" | null {
 if (typeof s !== "string" || !s) return null;
 if (/soldout|outofstock|discontinued/i.test(s.replace(/[\s_-]/g, ""))) return "sold";
 if (/instock|preorder|limitedavailability/i.test(s.replace(/[\s_-]/g, ""))) return "in_stock";
 return null;
}

// Walk a parsed JSON-LD document (possibly @graph-wrapped, possibly an array) to the first
// Product node carrying an offer with a price.
function productFromJsonLd(doc: any): ExtractedPrice | null {
 const nodes: any[] = [];
 const push = (n: any) => { if (n && typeof n === "object") nodes.push(n); };
 if (Array.isArray(doc)) doc.forEach(push);
 else push(doc);
 for (const node of [...nodes]) if (Array.isArray(node["@graph"])) node["@graph"].forEach(push);

 for (const node of nodes) {
  const type = node["@type"];
  const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
  if (!isProduct) continue;
  const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
  for (const offer of offers) {
   if (!offer || typeof offer !== "object") continue;
   const cents = toCents(offer.price ?? offer.lowPrice);
   if (!cents) continue;
   const currency = typeof offer.priceCurrency === "string" && offer.priceCurrency.trim() ? offer.priceCurrency.trim().toUpperCase() : null;
   return { priceCents: cents, currency, availability: availabilityOf(offer.availability) };
  }
 }
 return null;
}

function meta(html: string, property: string): string | null {
 // <meta property="og:price:amount" content="..."> — attribute order varies by platform.
 const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property.replace(/[.:*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
 const tag = html.match(re)?.[0];
 if (!tag) return null;
 const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
 return content?.trim() || null;
}

/** Extract price + ISO currency + availability from a product page's structured data.
 *  JSON-LD Product (Shopify/WooCommerce both emit it) → og:price meta → microdata.
 *  null when the page states no structured price — we never regex a number out of prose. */
export function extractPriceFromHtml(html: string): ExtractedPrice | null {
 if (!html) return null;

 // 1) JSON-LD blocks (there are often several — site, breadcrumbs, product)
 for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  try {
   const found = productFromJsonLd(JSON.parse(m[1].trim()));
   if (found) return found;
  } catch {
   // malformed block — try the next one
  }
 }

 // 2) OpenGraph product meta (og: or product: namespace)
 const ogAmount = meta(html, "og:price:amount") ?? meta(html, "product:price:amount");
 if (ogAmount) {
  const cents = toCents(ogAmount);
  if (cents) {
   const currency = (meta(html, "og:price:currency") ?? meta(html, "product:price:currency"))?.toUpperCase() || null;
   return { priceCents: cents, currency, availability: availabilityOf(meta(html, "og:availability") ?? meta(html, "product:availability")) };
  }
 }

 // 3) Microdata itemprop
 const priceTag = html.match(/<[^>]+itemprop=["']price["'][^>]*>/i)?.[0];
 const priceVal = priceTag?.match(/content=["']([^"']*)["']/i)?.[1];
 if (priceVal) {
  const cents = toCents(priceVal);
  if (cents) {
   const curTag = html.match(/<[^>]+itemprop=["']priceCurrency["'][^>]*>/i)?.[0];
   const currency = curTag?.match(/content=["']([^"']*)["']/i)?.[1]?.toUpperCase() || null;
   return { priceCents: cents, currency, availability: null };
  }
 }

 return null;
}

const FETCH_TIMEOUT_MS = 8000;
// 2MB, not 500KB: real product pages routinely exceed half a megabyte, and truncating mid-page
// cut off the JSON-LD block entirely — falling back to the weaker og meta (or nothing at all).
const MAX_BODY_BYTES = 2_000_000;
const DEFAULT_MAX_PAGES = 8;
// A scraped price far outside the already-priced cluster is an extraction error (a bundle page,
// a shipping fee, a mis-parsed number), not a comp. Guard BOTH directions: a high outlier
// inflates the median and a low one drags it down just as hard.
const OUTLIER_MULT = 5;

// Hosts that can never hold a product price. Fetching them burned the budget while genuine
// product pages further down the match list went unchecked.
const NON_COMMERCE_HOST = /(^|\.)(instagram|tiktok|pinterest|facebook|twitter|x|youtube|reddit|tumblr|threads|snapchat|linkedin|medium|blogspot|wordpress|vogue|wwd|harpersbazaar|elle|whowhatwear|popsugar|gettyimages|shutterstock)\.[a-z.]+$/i;
// URL shapes that mean "a page of many products" rather than one — a category, search or
// designer index has no single price to read.
const LISTING_PATH = /\/(search|discover|designers?|brands?|collections?|category|categories|shop|buy|c|tag|tags)(\/|$)|[?&]q=/i;
// URL shapes that mean "one product".
const PRODUCT_PATH = /\/(products?|itm|item|dp|listing|prod|p)\//i;

/** Rank and cap the pages worth fetching: never a social/editorial host, product pages before
 *  listing pages. Exported for testing — this is what makes the fetch budget pay off. */
export function rankVerifyCandidates<T extends { link?: string }>(matches: T[], max: number): T[] {
 const scored: Array<{ m: T; score: number }> = [];
 for (const m of matches) {
  const link = m.link;
  if (!link || !/^https?:\/\//i.test(link)) continue;
  let hostname: string;
  try { hostname = new URL(link).hostname; } catch { continue; }
  if (NON_COMMERCE_HOST.test(hostname)) continue;
  const path = link.slice(link.indexOf(hostname) + hostname.length);
  // Product-looking wins; a listing/search page is a last resort.
  const score = PRODUCT_PATH.test(path) ? 2 : LISTING_PATH.test(path) ? 0 : 1;
  scored.push({ m, score });
 }
 return scored
  .map((s, i) => ({ ...s, i })) // stable: preserve Lens order within a score band
  .sort((a, b) => b.score - a.score || a.i - b.i)
  .slice(0, max)
  .map((s) => s.m);
}

/** Default page fetcher: single attempt, hard timeout, body cap, browser-like UA. null on any
 *  failure — a blocked or slow store must never break the pricing run. */
async function fetchPage(url: string): Promise<string | null> {
 try {
  const res = await fetch(url, {
   signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
   headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", accept: "text/html" },
   redirect: "follow",
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text.slice(0, MAX_BODY_BYTES);
 } catch {
  return null;
 }
}

// nativePriceCents/nativeCurrency record what the page ACTUALLY said before conversion — comp
// provenance, and the only way to eyeball "9,995 DKK → $1,459" when auditing a valuation.
type MatchLike = { title: string; priceCents: number | null; source: string; link?: string; sold?: boolean; nativePriceCents?: number; nativeCurrency?: string };

function median(nums: number[]): number | null {
 if (!nums.length) return null;
 const s = [...nums].sort((a, b) => a - b);
 const m = Math.floor(s.length / 2);
 return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Enrich unpriced visual matches by fetching their product pages. Returns the same matches
 * (order preserved); the ones whose page yields a structured price in a KNOWN currency gain
 * `priceCents` (USD) and an honest `sold` flag (SoldOut/OutOfStock page = a realized sale — the
 * gold-standard comp). Unknown currency → the match stays unpriced (never guess USD).
 * `fetcher` is injectable for tests; `getCached`/`saveCached` for the URL price cache.
 */
export async function verifyMatchPrices<T extends MatchLike>(
 matches: T[],
 opts?: {
  fetcher?: (url: string) => Promise<string | null>;
  maxPages?: number;
  getCached?: (url: string) => Promise<ExtractedPrice | null>;
  saveCached?: (url: string, p: ExtractedPrice) => Promise<void>;
 },
): Promise<T[]> {
 const fetcher = opts?.fetcher ?? fetchPage;
 const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES;
 const unpriced = matches.filter((m) => !m.priceCents || m.priceCents <= 0);
 const candidates = rankVerifyCandidates(unpriced, maxPages);
 if (!candidates.length) return matches;

 const clusterMedian = median(matches.map((m) => m.priceCents ?? 0).filter((p) => p > 0));

 const extracted = new Map<T, ExtractedPrice>();
 await Promise.all(candidates.map(async (m) => {
  const url = m.link as string;
  let found = (await opts?.getCached?.(url).catch(() => null)) ?? null;
  if (!found) {
   const html = await fetcher(url).catch(() => null);
   if (!html) return;
   found = extractPriceFromHtml(html);
   // Cache only a genuine page read (even a no-price one) — never a fetch failure.
   if (found) await opts?.saveCached?.(url, found).catch(() => {});
  }
  if (found?.priceCents) extracted.set(m, found);
 }));
 if (!extracted.size) { logEmpty(candidates.length); return matches; }

 let converted = 0, droppedCurrency = 0, droppedOutlier = 0;
 const out = matches.map((m) => {
  const found = extracted.get(m);
  if (!found || !found.priceCents) return m;
  const iso = symbolToIso(found.currency);
  const usd = iso ? toUsdCents(found.priceCents, iso) : null;
  if (!usd) { droppedCurrency++; return m; } // unknown currency — an unpriced match beats a mispriced one
  if (clusterMedian && (usd > clusterMedian * OUTLIER_MULT || usd * OUTLIER_MULT < clusterMedian)) { droppedOutlier++; return m; }
  converted++;
  return { ...m, priceCents: usd, sold: found.availability === "sold", nativePriceCents: found.priceCents, nativeCurrency: iso };
 });
 console.log(`[link-verify] pages=${candidates.length} priced=${converted} droppedCurrency=${droppedCurrency} droppedOutlier=${droppedOutlier}`);
 return out;
}

// Log even when nothing was extracted — a silent return hid WHY a run recovered zero prices
// (all fetches blocked? no structured data? wrong candidates?) during the first gate run.
function logEmpty(pages: number): void {
 console.log(`[link-verify] pages=${pages} priced=0 (no page yielded a structured price)`);
}
