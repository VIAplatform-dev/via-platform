// The seller's OWN "You may also like" strip, refilled with live VYA pieces.
//
// WHY. The recommendations route (app/api/plan-b/recommendations) has always had to answer this
// endpoint with something non-empty — see its header for the fetch loop an empty answer causes.
// What it answered WITH was markup of our own: a bare grid of inline-styled cards. It rendered, and
// it was recognisably not the shop. The seller's real strip sits on its own colour band, centres a
// heading in the theme's display face, and puts each piece on a white tile with an offset shadow
// above a filled pill button; ours was left-aligned 14px text over the page background with a hairline
// outline button. Same six products, obviously two different websites.
//
// WHAT WE DO INSTEAD — the same move the product grids and the cart already make: don't invent
// markup, REUSE THE THEME'S. Shopify renders this strip from Liquid on their servers, from theme
// files we don't have, so the only way to hold it is to ask the source store for one and keep it.
// Fetch `{origin}/recommendations/products?section_id=…&product_id=…` once (the theme hands us both
// parameters on every request, so they never have to be guessed), store the response as this
// store's template, and from then on clone it and swap our pieces into its cards. Every class the
// theme styles against survives, so the strip inherits the shop's type, colours and buttons for free
// — and keeps inheriting them if the seller restyles, next time the template is refreshed.
//
// Not a per-theme shim: `/recommendations/products` is Shopify's endpoint, not one theme's, and what
// comes back is by construction whatever THAT store's theme renders. A store whose fragment we can't
// read a grid out of falls back to the generic cards, which still render.
//
// WHAT HAS TO BE STRIPPED, and why it isn't optional. The captured fragment is live theme markup,
// still wired to the source's own JavaScript:
//
//   • Alpine.js islands. The strip's cards are `<data-island x-data="QuickBuy({…product JSON…})">`
//     wrappers whose price is `x-html="formatMoney(currentPrice)"` and whose button text is
//     `x-text="addToCartText"`. Left in place, Alpine boots them with the SOURCE product's JSON and
//     paints that product's price back over the live piece we just substituted. (The strip lands
//     inside the theme's own `<data-island x-data="" x-html="$fetchedFragment(…)">`, so Alpine
//     really does initialise whatever we return — it isn't inert markup.)
//   • Elements Alpine keeps HIDDEN. `x-show`/`x-cloak` mean "invisible until the component says
//     otherwise" — the confirmation panel reading "Added to Cart! View cart or continue shopping."
//     is one. Removing the attribute without hiding the element publishes a message that should
//     never be on screen; that panel was visible under every single card the first time this ran.
//
// Storage is a reserved capture row, exactly like the derived cart template (see
// cart-template-store.ts) and for the same reason: it describes THIS capture's markup, so it must
// live and die with the capture rather than drift on in a table of its own.
import * as cheerio from "cheerio";
import type { Element as DomEl } from "domhandler";
import { fillCapturedGrid, type CollectionCardItem, type HrefFor } from "../site-capture.ts";
import { getCapturePage, saveCapturePage } from "../site-capture-db.ts";
import { safeFetch } from "../safe-url.ts";

/** Reserved: not a page, and never served (see isReservedCapturePath). */
export const RECOMMENDATION_TEMPLATE_PATH = "/__vya/recommendations-template";

/** Shopify's own endpoint for this strip — the same URL the theme on the page asks us for. */
export function sourceRecommendationsUrl(origin: string, sectionId: string, productId: string | null, limit: number): string {
 const q = new URLSearchParams({ section_id: sectionId, limit: String(limit) });
 if (productId) q.set("product_id", productId);
 return `${origin}/recommendations/products?${q}`;
}

/**
 * Everything in a captured fragment that belonged to the SOURCE's own products or its JavaScript,
 * taken out — leaving the theme's section, heading, grid and card markup.
 *
 * `x-show`/`x-cloak` elements are hidden rather than deleted: they're the theme's own conditional
 * panels, and a theme that gates something we'd rather keep (a price, a badge) behind one loses only
 * its visibility here, not the element the surrounding CSS may be laid out around.
 */
export function sanitizeRecommendationTemplate(html: string): string {
 const $ = cheerio.load(html, null, false);
 // The source's product JSON rides in these; so does its analytics.
 $("script, noscript").remove();
 // `class="contents"` on the island means it lays out as if it weren't there — unwrapping keeps the
 // card in exactly the same box.
 $("data-island").each((_: number, el: DomEl) => { $(el).replaceWith($(el).contents()); });
 $("[x-show], [x-cloak]").each((_: number, el: DomEl) => {
  const style = $(el).attr("style") || "";
  if (!/display\s*:\s*none/i.test(style)) $(el).attr("style", `${style};display:none`.replace(/^;/, ""));
 });
 // Alpine (`x-`, `:`, `@`) and Vue-style (`v-`) directives, whose expressions all name data we don't
 // have. The static text they were going to overwrite is the theme's own server-rendered fallback,
 // which is exactly what we want left behind.
 for (const el of $("*").toArray() as DomEl[]) {
  for (const attr of Object.keys(el.attribs || {})) {
   if (/^(x-|:|@|v-)/.test(attr)) $(el).removeAttr(attr);
  }
 }
 return $.html();
}

/** The `shopify-section-{id}` this fragment was captured under, or null. */
export function templateSectionId(html: string): string | null {
 const m = html.match(/id="shopify-section-([A-Za-z0-9_-]+)"/);
 return m ? m[1] : null;
}

/**
 * Is this fragment worth keeping as a template?
 *
 * A source store with no recommendations for the product we asked about answers with the section
 * wrapper and an empty grid — real markup, but nothing to clone a card from. Saving that would pin
 * the store to a permanently cardless strip, so it is rejected here and the caller keeps the
 * generic cards until a fetch comes back with something better.
 */
export function isUsableRecommendationTemplate(html: string, probe: CollectionCardItem): boolean {
 return fillCapturedGrid(sanitizeRecommendationTemplate(html), [probe], () => "/", { keepQuickAdd: true }) !== null;
}

/**
 * The strip to serve: the theme's own section, holding OUR pieces.
 *
 * `sectionId` is what the theme asked for on THIS page. It's written over the id the template was
 * captured under because a store's per-section custom CSS is scoped to it — thenicheshop's own
 * `#shopify-section-…__related-products .lg\:grid-cols-3 { repeat(6, …) }` is what makes this strip
 * six across instead of three — and that CSS is in the page we're being fetched into, not here.
 *
 * Returns null when the template holds no grid we can fill; the caller falls back to generic cards.
 */
export function renderRecommendationSection(
 templateHtml: string,
 items: CollectionCardItem[],
 hrefFor: HrefFor,
 sectionId: string,
): string | null {
 let clean = sanitizeRecommendationTemplate(templateHtml);
 const captured = templateSectionId(clean);
 if (captured && sectionId && captured !== sectionId) clean = clean.split(captured).join(sectionId);
 const filled = fillCapturedGrid(clean, items, hrefFor, { keepQuickAdd: true });
 if (!filled) return null;
 // The theme's own quick-buy form, now pointed at our bridge and intercepted rather than submitted
 // natively — see markRecommendationForms() for why a native submit is not an option here.
 return markRecommendationForms(filled);
}

/**
 * Mark the theme's own add-to-cart forms for the fragment's submit interceptor.
 *
 * The form posts to `/cart/add`, which our bridge answers with JSON. Its own JavaScript submit
 * handler left with the Alpine island, so an unmarked form submits NATIVELY: the piece really is
 * added, and the shopper is then dropped on a blank page of `{"id":…}`. The interceptor that turns
 * it back into a `fetch()` — exactly as the theme's own code did — is injected into the PAGE, not
 * into this strip; see recommendationAddScript() for why it cannot ride along in here.
 */
export function markRecommendationForms(html: string): string {
 const $ = cheerio.load(html, null, false);
 $("form[action*='/cart/add']").attr("data-vya-rec-add", "").removeAttr("onsubmit");
 return $.html();
}

export async function saveRecommendationTemplate(slug: string, html: string): Promise<void> {
 await saveCapturePage(slug, RECOMMENDATION_TEMPLATE_PATH, html, "");
}

export async function loadRecommendationTemplate(slug: string): Promise<string | null> {
 const html = await getCapturePage(slug, RECOMMENDATION_TEMPLATE_PATH).catch(() => null);
 return html && html.trim() ? html : null;
}

/**
 * Ask the SOURCE store for the strip it renders for one of its own products.
 *
 * Best-effort by contract: any failure returns null and the caller serves the generic cards. This
 * runs on a shopper's request (the first one this store ever gets for a recommendations strip),
 * which is the same on-demand shape the product route already uses to capture a page it hasn't
 * seen — the strip is fetched asynchronously by the theme, so a one-off second on the first hit is
 * paid off-screen and never again.
 */
export async function fetchRecommendationTemplate(
 origin: string, sectionId: string, productId: string | null, limit: number,
): Promise<string | null> {
 try {
  const res = await safeFetch(sourceRecommendationsUrl(origin, sectionId, productId, limit), {
   headers: { "User-Agent": TEMPLATE_UA }, signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  return html.trim() ? html : null;
 } catch {
  return null;
 }
}

/** The same browser string the rest of the capture pipeline sends — a store that serves themes by
 *  user agent must see the same one here as it did during the import. */
const TEMPLATE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
