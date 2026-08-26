// The store's own search, answered from live VYA inventory.
//
// Every captured storefront has a search box in its header, and on a hosted store every one of them
// led to "Page not found." — the crawl never stored a `/search` page (there is nothing to crawl: the
// source renders it per-query), so the route had nothing to serve. Predictive search already worked
// (see /api/plan-b/search/suggest), which made it worse: the drawer showed matches, and pressing
// Enter — or clicking "View all results" — threw the shopper into a 404.
//
// The fix reuses the machinery the collection pages already run on. A search result page IS a
// collection page whose contents happen to be a query result, so we borrow the store's own
// collection template, fill its grid with the matches (injectCollectionItems), and restate the
// page's chrome — heading, <title>, and the search box's own value — as a search.
//
// Pure — no database, no network. The route hands the items in.
import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

/** The item fields search reads. Everything is optional but the title — a portal-created listing may
 *  have nothing else filled in yet, and it still has to be findable. */
export type SearchableItem = {
 title: string;
 brand?: string | null;
 category?: string | null;
 description?: string | null;
 size?: string | null;
 era?: string | null;
 material?: string | null;
};

/** Split a query the way a shopper means it: "prada heels" is both words, in any order and any field. */
function terms(q: string): string[] {
 // Bounded on both axes — a query is shopper input, and both the number of terms and the length of
 // any one of them end up in a regex run against every item in the catalogue.
 return q.toLowerCase().split(/[\s,]+/).map((t) => t.trim().slice(0, 64)).filter(Boolean).slice(0, 8);
}

/**
 * A term matches where a WORD starts with it — never mid-word.
 *
 * Raw substring matching looked reasonable and was not: searching "zz" on Vintage Archives LA
 * returned a sold-out Prada heel, because its description contains "dazzling". A shopper reads that
 * as search being broken, and it also put the results page at odds with the predictive drawer, which
 * matched titles only and correctly found nothing.
 *
 * Prefix-of-a-word is what people actually expect — "boot" finds "Boots", "shirt" finds "T-Shirt"
 * (the hyphen is a word boundary), "gabbana" finds "Dolce & Gabbana" — and "zz" finds neither
 * "dazzling" nor anything else it shouldn't.
 */
function startsWord(term: string): (haystack: string) => boolean {
 const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
 return (haystack: string) => re.test(haystack);
}

/**
 * Rank one item against the query terms, or 0 for "no match".
 *
 * EVERY term must hit something, or a two-word search returns the whole catalogue — which on
 * one-of-one vintage is indistinguishable from search being broken. Where a term hits decides the
 * order: a title match beats a brand match beats a description match, so searching "prada" puts the
 * pieces actually called Prada above the ones that merely mention it in a care note.
 */
export function scoreItem(item: SearchableItem, ts: string[]): number {
 if (!ts.length) return 0;
 const title = (item.title || "").toLowerCase();
 const brand = (item.brand || "").toLowerCase();
 const category = (item.category || "").toLowerCase();
 const rest = [item.description, item.size, item.era, item.material].filter(Boolean).join(" ").toLowerCase();
 let total = 0;
 for (const t of ts) {
  const at = startsWord(t);
  let best = 0;
  if (title.startsWith(t)) best = 100;
  else if (at(title)) best = 60;
  else if (at(brand)) best = 30;
  else if (at(category)) best = 20;
  else if (at(rest)) best = 5;
  if (best === 0) return 0; // an unmatched term disqualifies the item
  total += best;
 }
 return total;
}

/** The store's matches for a query, best first. Ties keep the caller's order, which is the
 *  storefront's own ordering (available before sold, newest first). */
export function searchItems<T extends SearchableItem>(items: T[], query: string): T[] {
 const ts = terms(query || "");
 if (!ts.length) return [];
 return items
  .map((item, i) => ({ item, i, score: scoreItem(item, ts) }))
  .filter((r) => r.score > 0)
  .sort((a, b) => b.score - a.score || a.i - b.i)
  .map((r) => r.item);
}

/** Text destined for markup we build ourselves. cheerio escapes anything it sets via .text(); these
 *  two go into a template string, so they escape here. */
/** Site chrome — a heading in here belongs to the storefront, not to this page. */
const CHROME_ANCESTORS = "header,nav,footer,[role='banner'],[role='contentinfo'],[class*='header' i],[id*='header' i],[class*='footer' i],[id*='footer' i],[class*='masthead' i]";

function escText(s: string): string {
 return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

function escAttr(s: string): string {
 return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** The store's own name, so the tab title still reads like the seller's site rather than like VYA's. */
function storeName($: cheerio.CheerioAPI): string {
 const og = ($('meta[property="og:site_name"]').attr("content") || "").trim();
 if (og) return og;
 const title = ($("title").first().text() || "").trim();
 // Shopify titles are "{page} – {store}"; the store is the last segment.
 const parts = title.split(/\s+[–|—·|]\s+/);
 return parts.length > 1 ? parts[parts.length - 1].trim() : "";
}

/**
 * Turn a borrowed collection template into this store's search results page.
 *
 * Only the chrome — the grid itself is filled by injectCollectionItems, exactly as a collection page
 * is, so the cards, pagination and "N products" count all come from the store's own theme.
 */
export function applySearchChrome(html: string, opts: { query: string; count: number; action?: string }): string {
 const q = (opts.query || "").trim();
 const $ = cheerio.load(html);
 const heading = opts.count > 0
  ? `Search results for “${q}”`
  : q ? `No results for “${q}”` : "Search";

 // The page's own heading — the collection title we borrowed. Anything in the site header, nav or
 // footer is chrome (usually the logo), and renaming it would retitle the whole storefront.
 // A store's own name is not this page's heading. Two signals, because either alone misses a real
 // store: Bag Crush's masthead is `<div class="site-header">` rather than `<header>`, and plenty of
 // themes put the logo in a bare <h1> with no chrome wrapper at all — it's an <img>, not a title.
 const headings = $("h1").toArray() as DomElement[];
 const isChrome = (h: DomElement) => $(h).parents(CHROME_ANCESTORS).length > 0;
 const isLogo = (h: DomElement) => $(h).find("img, svg").length > 0;
 const existing = headings.find((h) => !isChrome(h) && !isLogo(h));
 if (existing) $(existing).text(heading);
 // Some themes have NO page heading to borrow — Bag Crush's only <h1> is its logo, which must never
 // be renamed. Without this the shopper got a page of results (or none) with nothing saying what was
 // searched for. Inserted rather than substituted, and marked so a re-run replaces it in place.
 let $heading = existing ? $(existing) : $("[data-vya-search-heading]").first();
 if (!existing) {
  const $host = $("main").first().length ? $("main").first() : $("body").first();
  if ($heading.length) $heading.text(heading);
  else {
   $host.prepend(`<h1 data-vya-search-heading="1" style="margin:28px 0 6px;font-size:1.35em;font-weight:inherit;font-family:inherit">${escText(heading)}</h1>`);
   $heading = $host.children("[data-vya-search-heading]").first();
  }
 }
 const $main = $heading.length ? $heading.get(0) as DomElement : undefined;

 // The theme's search box, so the shopper can see and edit what they searched for.
 $('input[name="q"], input[name="query"], input[type="search"]').each((_: number, el: DomElement) => {
  $(el).attr("value", q);
 });
 // Send it back here rather than to the collection we borrowed the template from. On a VYA origin
 // "here" is /site/{slug}/search — the theme's own bare `/search` would post to VYA's root and 404,
 // which is the same dead end this whole module exists to close.
 const action = opts.action || "/search";
 $('form[action*="/search"], form[role="search"]').each((_: number, el: DomElement) => {
  $(el).attr("action", action);
 });

 const store = storeName($);
 $("title").first().text(store ? `${heading} – ${store}` : heading);
 // The borrowed template's canonical/og tags describe the collection, not this query. A search
 // result page is not a page search engines should index as that collection.
 $('link[rel="canonical"]').remove();
 $('meta[name="robots"]').remove();
 $("head").first().prepend(`<meta name="robots" content="noindex, follow">`);

 if (q && opts.count === 0 && $main) {
  $($main).after(`<p data-vya-search-empty="1" style="margin:12px 0 40px;opacity:.65">Nothing in the archive matches “${escAttr(q)}” right now.</p>`);
 }
 return $.html();
}

/**
 * Which stored page to build the results on.
 *
 * A real captured `/search` is best (a couple of themes render one for an empty query); otherwise the
 * shop-all page, which is the closest thing every Shopify store has to a "list of everything" layout.
 * The homepage is the last resort — it has grids, so injectCollectionItems still has somewhere to put
 * the results, but its layout is a hero, not a catalogue.
 */
export function pickSearchTemplatePath(paths: string[]): string | null {
 const has = (p: string) => paths.some((x) => x.replace(/\/+$/, "").toLowerCase() === p);
 if (has("/search")) return "/search";
 if (has("/collections/all")) return "/collections/all";
 const collection = paths.find((p) => /^\/collections\/[^/]+\/?$/.test(p));
 return collection || (paths.length ? "/" : null);
}
