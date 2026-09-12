// HER HEADER AND FOOTER, AROUND SOMETHING ELSE.
//
// Two pages VYA builds for a store are not pages of her site: the cart page, when her own was never
// captured (fallback-cart-page.ts), and a page she adds in the Pages panel (pages.ts). Both want the
// same thing — keep the chrome of a page we DO hold, drop that page's content, put ours in its place —
// and the cart page had the only copy of it. One definition, so a fix to one is a fix to both.
//
// Pure: a loaded document in, the same document changed in place.
import type * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

/** Where the theme's main content sits, most specific first. Covers Dawn and its forks, plus the
 *  generic containers older themes use. */
export const MAIN_SELECTORS = ["#MainContent", "main", '[role="main"]', ".main-content", "#main", "#content"].join(", ");

/** The chrome worth keeping when there is no main container to swap out. */
export const CHROME_SELECTORS = ["header", "#shopify-section-header", "footer", "#shopify-section-footer"].join(", ");

/**
 * Replace the borrowed page's content with `contentHtml`, keeping everything around it.
 *
 * Prefers swapping the theme's own main container: header and footer then stay exactly as captured
 * and only the content changes. A theme with no main container falls back to keeping the chrome
 * elements and dropping the rest, so the borrowed page's hero never ends up above the new content.
 *
 * Falls back gracefully all the way down to empty or invalid input, because the stores that need
 * this are the ones whose captures have already proven unreliable.
 */
export function borrowChrome($: cheerio.CheerioAPI, contentHtml: string): void {
 const $main = $(MAIN_SELECTORS).first();
 if ($main.length) {
  $main.empty().append(contentHtml);
  return;
 }
 // cheerio.load() synthesises html/head/body even for junk input, but guard anyway.
 if (!$("body").length) $.root().append("<body></body>");
 const $body = $("body");
 const keep = $body.children(CHROME_SELECTORS).toArray();
 for (const el of $body.children().toArray() as DomElement[]) if (!keep.includes(el)) $(el).remove();
 const $header = $body.children("header, #shopify-section-header").first();
 if ($header.length) $header.after(contentHtml); else $body.prepend(contentHtml);
}
