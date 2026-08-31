/**
 * Which products does a page show, and what are they called?
 *
 * The parity check used to answer this with one rule: "a link to /products/ whose text is longer
 * than three characters". That rule assumes a theme puts the product's name inside its link, and
 * plenty of modern themes do not. hachi-archive's covers each tile with a transparent, EMPTY anchor
 * and names it by `aria-labelledby`:
 *
 *   <a class="tile-link absolute inset-0" href="/products/prada-…" aria-labelledby="…-label"></a>
 *
 * On that theme the old rule found nothing — so parity reported 0 products on the seller's site and
 * 0 on ours, called it a match it could not make, and graded the store "we couldn't compare". The
 * store passed by not being looked at. Six pages across three stores did this in one fleet run.
 *
 * Two changes follow from that. A product's IDENTITY is the handle in its URL, never its displayed
 * text — that survives any markup and makes "same product" unambiguous. Its NAME is whatever the
 * page offers, tried in order of how much we should trust it.
 */

export type ProductLinkCandidate = {
 /** The link's href, absolute or relative. */
 href: string;
 /** Visible text inside the anchor itself. */
 ownText: string;
 /** Text of the element(s) named by the anchor's aria-labelledby. */
 labelledByText: string;
 /** Visible text of the nearest card/tile containing the anchor. */
 tileText: string;
 /** Alt text of an image inside the anchor. */
 imgAlt: string;
 /** Whether a shopper can see it. A transparent overlay IS visible; `display:none` is not. */
 visible: boolean;
};

export type PageProduct = { handle: string; title: string };

const MAX_TITLE = 120;
/**
 * Money in any of the shapes a storefront prints it. The trailing-code form is listed FIRST so
 * "$1,745.00 USD" is consumed whole; matching the leading form first left a stray "USD" in the name.
 */
const CODE = "USD|GBP|EUR|CAD|AUD|JPY";
const MONEY = new RegExp(`(?:[$£€¥]\\s?)?[\\d,]+(?:\\.\\d{2})?\\s?(?:${CODE})|(?:[$£€¥]|${CODE})\\s?[\\d,]+(?:\\.\\d{2})?`, "g");
/**
 * A tag, not a name. Reading a tile's textContent picks up the SOURCE of anything inside a
 * <noscript> — themes put a fallback <img> there for browsers without JavaScript — so bag-crush's
 * product names came back as '<img src="//mybagcrush.com/cdn/shop/file…'. Requires a tag-like
 * shape, so an ordinary "Size < 8" keeps its angle bracket.
 */
const LOOKS_LIKE_MARKUP = /<[a-z!/][^>]*>|\ssrc=["']/i;

/** Chrome a theme prints inside a tile alongside the name. */
const TILE_NOISE = /\b(add to (cart|bag)|quick (add|view|shop)|sold out|on sale|sale|new in|choose options|view (details|product))\b/gi;

/** The product's identity: the handle in `/products/<handle>`, without variant, query or hash. */
function handleOf(href: string): string | null {
 const m = /\/products\/([^/?#]+)/.exec(href || "");
 if (!m) return null;
 const h = decodeURIComponent(m[1]).trim().toLowerCase();
 return h || null;
}

function clean(s: string): string {
 return (s || "").replace(/\s+/g, " ").trim();
}

/** The tile's text minus the things that are plainly not the product's name. */
function fromTile(tileText: string): string {
 const stripped = clean(tileText).replace(/<[a-z!/][^>]*>/gi, " ");
 return clean(stripped.replace(MONEY, " ").replace(TILE_NOISE, " ")).slice(0, MAX_TITLE);
}

/**
 * A candidate is only a name if it is words — not markup, and not the theme's own chrome. A badge
 * reads as a name from any source, not just the tile: bag-crush quoted two pieces to its seller as
 * "SOLD OUT" because the filter only ran on the tile fallback.
 */
function usable(s: string): string {
 if (!s || LOOKS_LIKE_MARKUP.test(s)) return "";
 const left = clean(s.replace(TILE_NOISE, " "));
 return left.length > 1 ? left : "";
}

export function productsFromLinks(links: ProductLinkCandidate[]): PageProduct[] {
 const byHandle = new Map<string, PageProduct>();
 for (const l of links) {
  if (!l.visible) continue;
  const handle = handleOf(l.href);
  if (!handle) continue;

  // In order of trust: the link's own words, then what it says it is labelled by, then the photo's
  // description, then the tile it sits in.
  const own = clean(l.ownText);
  const title =
   usable(own.length > 3 ? own : "") ||
   usable(clean(l.labelledByText)) ||
   usable(clean(l.imgAlt)) ||
   usable(fromTile(l.tileText));

  const existing = byHandle.get(handle);
  if (!existing) { byHandle.set(handle, { handle, title: title.slice(0, MAX_TITLE) }); continue; }
  // A theme often emits the same product twice (a mobile link and a desktop one). Keep the first
  // position — order is what the order comparison measures — but take a name if we did not have one.
  if (!existing.title && title) existing.title = title.slice(0, MAX_TITLE);
 }
 return [...byHandle.values()];
}

/**
 * The DOM half, as source text to run inside the page.
 *
 * It lives here rather than inline in the checker so the rules above and the plumbing below stay
 * next to each other; scripts/parity-check.mts injects it into `page.evaluate`. Kept deliberately
 * dumb: it gathers candidates and decides nothing.
 */
export const COLLECT_PRODUCT_LINKS = `(function () {
 var vis = function (el) {
  var r = el.getBoundingClientRect();
  var s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
 };
 // innerText, not textContent: textContent returns the SOURCE inside <noscript>/<template>, which
 // is how raw markup ended up being read as a product name.
 var txt = function (el) { return el ? ((el.innerText != null ? el.innerText : el.textContent) || "").replace(/\\s+/g, " ").trim() : ""; };
 var out = [];
 var anchors = document.querySelectorAll("a[href*='/products/']");
 for (var i = 0; i < anchors.length; i++) {
  var a = anchors[i];
  var labelled = "";
  var ids = (a.getAttribute("aria-labelledby") || "").split(/\\s+/).filter(Boolean);
  for (var j = 0; j < ids.length; j++) {
   var el = document.getElementById(ids[j]);
   if (el) labelled += (labelled ? " " : "") + txt(el);
  }
  if (!labelled) labelled = (a.getAttribute("aria-label") || "").trim();
  var img = a.querySelector("img");
  // The tile: the nearest thing a theme would call a card. Bounded so we never scoop up the page.
  var tile = a.closest("li, article, [class*='card'], [class*='tile'], [class*='product-item'], [class*='grid__item']");
  out.push({
   href: a.getAttribute("href") || "",
   ownText: txt(a),
   labelledByText: labelled,
   tileText: tile ? txt(tile).slice(0, 400) : "",
   imgAlt: img ? (img.getAttribute("alt") || "").trim() : "",
   visible: vis(a),
  });
 }
 return out;
})()`;


/**
 * The headings on a page that are actually SECTIONS.
 *
 * Themes routinely mark a product's name as an `<h2>` — bag-crush's uses `product-item__title` — so
 * a featured strip showing different pieces was reported as "2 section headings missing" as well as
 * "2 products not shown here" and "2 products in a different order". One difference, counted three
 * times, and only one of the three was the truth.
 *
 * Matched on the whole heading, not a substring: "Shop Louis Vuitton" is a section even when a piece
 * is called "Louis Vuitton".
 */
export function sectionHeadings(heads: string[], products: { title: string }[]): string[] {
 const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
 const names = new Set(products.map((p) => norm(p.title)).filter(Boolean));
 return heads.filter((h) => !names.has(norm(h)));
}
