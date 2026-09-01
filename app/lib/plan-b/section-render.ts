// Shopify's SECTION RENDERING API, answered from live VYA inventory.
//
// WHY THIS EXISTS. Shopify's new theme generation — Horizon and the themes built on it (Dwell,
// Vessel, Seed…) — stopped doing client-side rendering. Instead the theme asks the SERVER to
// re-render one section and morphs the result into the page:
//
//   GET /collections/all?section_id=template--123__main      ← facets, sorting, pagination
//   GET /search/suggest?q=chanel&section_id=predictive-search ← predictive search
//   GET /?section_id=predictive-search-empty                  ← the search drawer's empty state
//
// The response must be an HTML FRAGMENT containing `id="shopify-section-{id}"`. We answered the
// full page (942KB of it), so `morphSection()` couldn't find the section and threw, and predictive
// search — which parses the response for `.predictive-search-empty-section` — threw on every
// search-drawer open.
//
// This is not a per-theme shim. Four of our captured stores already run four DIFFERENT themes that
// all speak this one protocol, and Horizon is Shopify's default for new stores, so every theme
// arriving from here on speaks it too. Classic themes (Dawn, Prestige, Editions…) never send
// `section_id` and are completely unaffected.
//
// What we DON'T do is render Liquid. We slice the section out of the page our existing pipeline
// already built — the one that injects live inventory — so a section response carries exactly the
// same live data the full page would.
import * as cheerio from "cheerio";

/** Shopify's own prefix for a section's DOM id. */
const SECTION_ID_PREFIX = "shopify-section-";

/**
 * The section this request is asking for, or null for an ordinary page request.
 *
 * Shopify accepts the id with or without the DOM prefix (the theme's `normalizeSectionId` strips it
 * before sending, but hand-built URLs and older themes include it), so both are accepted here.
 */
export function requestedSectionId(params: URLSearchParams): string | null {
 const raw = (params.get("section_id") || "").trim();
 if (!raw) return null;
 const id = raw.startsWith(SECTION_ID_PREFIX) ? raw.slice(SECTION_ID_PREFIX.length) : raw;
 // Section ids are theme-authored slugs (`template--25814020391202__main`). Anything else is a
 // malformed or hostile request; refuse rather than reflect it into markup.
 return /^[A-Za-z0-9_-]{1,120}$/.test(id) ? id : null;
}

/** Pull `#shopify-section-{id}` out of a fully rendered page, with its wrapper intact. */
export function extractSection(html: string, sectionId: string): string | null {
 const $ = cheerio.load(html);
 const el = $(`#${cssEscapeId(SECTION_ID_PREFIX + sectionId)}`).first();
 if (!el.length) return null;
 return $.html(el);
}

/**
 * A section the capture doesn't contain.
 *
 * Returned as a real, correctly-identified section rather than a 404 because that is what the
 * theme's `morphSection()` needs to find: given the wrapper it morphs in an empty section and the
 * feature degrades quietly. Given a 404 (or our 942KB page) it throws, and on Horizon an
 * unhandled throw inside the search drawer leaves the drawer permanently broken.
 */
export function emptySection(sectionId: string): string {
 return `<div id="${SECTION_ID_PREFIX}${escapeAttr(sectionId)}" class="shopify-section"></div>`;
}

/**
 * The search drawer's EMPTY state (`section_id=predictive-search-empty`).
 *
 * Shape matters more than it looks. The theme does:
 *   parsed = DOMParser(html).querySelector('.predictive-search-empty-section')   ← must exist
 *   morph(predictiveSearchResults, parsed)                                        ← childrenOnly
 * `childrenOnly` means the CHILDREN of `.predictive-search-empty-section` replace the children of
 * the results container — so the results div has to live INSIDE it, mirroring what the capture has
 * inside `.predictive-search-form__content`. `#predictive-search-products` is required too: when the
 * shopper has recently-viewed items the theme prepends them into that element and bails out if it's
 * missing.
 */
export function predictiveSearchEmptySection(sectionId: string): string {
 return `<div id="${SECTION_ID_PREFIX}${escapeAttr(sectionId)}" class="shopify-section">` +
  // Shopify's newer "Shapes" theme (and others built the same way) reads this section differently:
  // its PredictiveSearch component does
  //   new DOMParser().parseFromString(text, "text/html").querySelector("#predictive-search-count").textContent
  // unconditionally, with no null check — a response missing this exact id throws inside the fetch
  // handler's own .then(), which its .catch() turns into `this.rawQuery = ""`. Confirmed against the
  // theme's real code, not guessed: every keystroke was being wiped the instant the debounced search
  // fired, which read as "the search bar won't even let me type."
  `<span id="predictive-search-count" class="visually-hidden">0 results</span>` +
  `<div class="predictive-search-empty-section">` +
  `<div id="predictive-search-results" class="predictive-search-dropdown" role="listbox" aria-expanded="true">` +
  `<div id="predictive-search-products" class="predictive-search-results__wrapper-products"></div>` +
  `</div></div></div>`;
}

export type SuggestCard = {
 title: string;
 href: string;
 image: string | null;
 price: string;
};

/**
 * Predictive-search RESULTS (`/search/suggest?q=…&section_id=predictive-search`).
 *
 * The class names and the NESTING are the theme's, not ours. That distinction cost us a bug: the
 * card class alone was right, but the grid CSS lives on `predictive-search-results__list` (a <ul>),
 * the cards are <li> carrying the `--product` modifier, and everything inside a card is a
 * `resource-card` with its own media/content/title parts. Emitting a bare <a> with only the card
 * class meant not one rule matched, so every result rendered at its natural size — two enormous
 * photographs per row with the title and price run together, against four tidy cards on her own
 * site. Every check passed it, because the right products, titles and prices were all present.
 *
 * Verified against a live Horizon-family response rather than guessed, and the whole family shares
 * this markup. A theme that doesn't simply won't match the extra classes, which is what it already
 * does today — so this can only widen what styles correctly, never narrow it.
 *
 * Two deliberate omissions from the real thing:
 *  · `<product-card-link>`, the theme's custom element for view transitions. It keys off a Shopify
 *    product id we don't have, and the `resource-card` inside it is what carries the styling.
 *  · the srcset/secondary hover image, which needs the CDN's own resizing parameters.
 *
 * `data-single-result-url` on a lone result is what lets Enter jump straight to it — the theme reads
 * that attribute before falling back to the full search page.
 */
export function predictiveSearchResultsSection(sectionId: string, cards: SuggestCard[]): string {
 if (!cards.length) return predictiveSearchEmptySection(sectionId);
 const single = cards.length === 1 ? ` data-single-result-url="${escapeAttr(cards[0].href)}"` : "";
 const items = cards.map((c) => {
  const title = escapeHtml(c.title);
  return `<li class="predictive-search-results__card predictive-search-results__card--product" role="option" ref="resultsItems[]">` +
   `<div class="resource-card" data-resource-type="product">` +
   // The link covers the card and carries the accessible name; the title below is presentational,
   // which is how the theme itself splits it.
   `<a class="resource-card__link" href="${escapeAttr(c.href)}"><span class="visually-hidden">${title}</span></a>` +
   `<div class="resource-card__media" style="--resource-card-aspect-ratio: 4 / 5;">` +
   (c.image ? `<img class="resource-card__image" src="${escapeAttr(c.image)}" alt="${escapeAttr(c.title)}" loading="lazy">` : "") +
   `</div>` +
   `<div class="resource-card__content">` +
   `<p class="resource-card__title paragraph">${title}</p>` +
   (c.price ? `<div class="price__regular"><span class="price">${escapeHtml(c.price)}</span></div>` : "") +
   `</div></div></li>`;
 }).join("");
 const count = `${cards.length} search result${cards.length === 1 ? "" : "s"} found`;
 return `<div id="${SECTION_ID_PREFIX}${escapeAttr(sectionId)}" class="shopify-section">` +
  // See predictiveSearchEmptySection() — required by the "Shapes"-family theme convention, not the
  // Horizon one the rest of this section's markup targets. Both read from the same response fine.
  `<span id="predictive-search-count" class="visually-hidden">${cards.length} result${cards.length === 1 ? "" : "s"}</span>` +
  `<div id="predictive-search-results" class="predictive-search-dropdown" role="listbox" aria-label="Search results"${single}>` +
  `<div class="predictive-search-results__inner" data-search-results>` +
  `<div class="visually-hidden" role="status">${count}</div>` +
  `<div id="predictive-search-products" class="predictive-search-results__products">` +
  `<h4 class="predictive-search-results__title">Products</h4>` +
  `<ul class="predictive-search-results__list predictive-search-results__wrapper-products list-unstyled">${items}</ul>` +
  `</div></div></div></div>`;
}

/** Is this the search drawer's empty-state section? Shopify names it by convention across themes. */
export function isPredictiveSearchEmptyId(sectionId: string): boolean {
 return /predictive[-_]?search[-_]?empty/i.test(sectionId);
}

// Section ids contain `-` and `_` only (validated above) but CSS ids still need escaping for the
// leading digit case, and cheerio's selector parser is strict about it.
function cssEscapeId(id: string): string {
 return id.replace(/^(\d)/, "\\3$1 ").replace(/([^\w-])/g, "\\$1");
}

function escapeHtml(s: string): string {
 return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
 return escapeHtml(s).replace(/"/g, "&quot;");
}
