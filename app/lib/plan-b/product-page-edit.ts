// THE PRODUCT PAGE, AS THE VISUAL EDITOR GETS IT.
//
// The storefront editor offers "Product page (all N)": one captured product page, opened to change the
// design of every product page (a save there is carried to the rest by old value — see
// /api/store/capture/edit). Product pages are served by their own route, which never had an edit mode,
// so that option opened a shopper's page with no editor on it at all.
//
// Three rules shape the view, each learned on the catch-all route first:
//
//  · NUMBER THE STORED PAGE, BEFORE ANYTHING CHANGES IT. The save counts the stored page; the view
//    below swaps the theme's buy button and rewrites the price. Numbered after those, "#N" would mean
//    different elements in the editor and in the save. See stampEditIds.
//
//  · SHOW WHAT A SHOPPER SEES. Today's price, VYA's buy control and the facts block, not crawl day's.
//    Always the AVAILABLE buy control: a section she restructures is saved from this DOM, and a "Sold"
//    control saved into the stored page could never be undone at serve time, while an available one is
//    corrected per request by applyCartState. None of the shopper's own state (her bag) is shown.
//
//  · THE PIECE'S OWN NAME, PRICE AND DESCRIPTION ARE INVENTORY'S. Typed over here they would change one
//    page and disagree with the piece everywhere else — or, for the price, be rewritten on the next
//    load. So they carry no text number (the editor offers no box), and are stamped with the piece they
//    belong to, so a click opens the piece in the panel instead. The words every product page shares —
//    "Add to cart", a shipping line, a size-guide heading — stay editable, and those are what travel.

import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";
import { stampEditIds, rewireCommerce } from "../site-capture.ts";
import { applyLivePrice, type PricedItem } from "../live-price.ts";
import { injectHostedDetails } from "../hosted-product-details.ts";

export type EditPiece = {
 id: string;
 title: string;
 description?: string | null;
 priceCents: number | null;
 currency: string | null;
 compareAtCents?: number | null;
 /** The facts block the shopper's page prints (renderHostedDetailsHtml), or "" for none. */
 detailsHtml?: string;
};

/** The shared header, footer and nav — never the piece's, whatever they contain. */
const CHROME = "header, footer, nav";
/** Where a theme prints the product's name. Whole class tokens only: `product__title-and-price` is a
 *  wrapper holding the vendor and the price as well, and must not take them with it. */
const TITLE = 'h1, [class~="product__title"], [class~="product-title"], [class~="product_title"], [class~="product-single__title"], [class~="product-meta__title"]';
/** Where a theme prints the product's description. */
const DESCRIPTION = '[class~="product__description"], [class~="product-description"], [class~="product_description"], [class~="product-single__description"], [itemprop="description"], [data-product-description]';
/** A line this long found inside her description is her description, whichever class wraps it. Short
 *  lines ("Era:") are too likely to be template wording to be claimed by text alone. */
const DESCRIPTION_LINE_MIN = 24;

const norm = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Clicking the piece's own words opens the piece in the panel.
 *
 * Those words have no text number, so the editor's own click handler selects the section around them
 * and stops. This follows it with the message the editor already sends for a live product card's name
 * (`textsel` carrying `item`) — with no text number, so the panel shows the piece rather than a box.
 * Posted on the next tick, after the editor's handler has reported the section, so it is the last word.
 * Photos are left to the editor, which already reports the piece a photo belongs to.
 */
export const PIECE_CLICK_JS = '(function(){if(window.parent===window)return;window.addEventListener("click",function(e){var t=e.target;if(!t||!t.closest||t.closest("[data-vya-eid],[data-vya-img]"))return;var p=t.closest("[data-vya-item]");if(!p)return;var m={vya:"textsel",eid:-1,item:p.getAttribute("data-vya-item"),itemTitle:p.getAttribute("data-vya-item-title")||""};setTimeout(function(){window.parent.postMessage(m,"*")},0)},true)})();';

/** Text of every numbered element, by number. */
function textByEid(html: string): Map<string, string> {
 const $ = cheerio.load(html);
 const out = new Map<string, string>();
 $("[data-vya-eid]").each((_i, el) => { out.set($(el).attr("data-vya-eid") || "", $(el).text()); });
 return out;
}

/**
 * The product page the editor opens, numbered as the save numbers it, before prepareEditMode.
 *
 * @param stored the page exactly as stored — the one the save will apply her edits to.
 * @param piece  the inventory piece this page shows, or null when none matches (the page then opens
 *               as stored, every word editable, since nothing else owns them).
 */
export function productEditView(stored: string, piece: EditPiece | null): string {
 const numbered = stampEditIds(stored);
 if (!piece) return numbered;

 const rewired = rewireCommerce(numbered, `/checkout?item=${piece.id}`, { keepThemeButtons: false });
 const priced: PricedItem = { priceCents: piece.priceCents, currency: piece.currency, compareAtCents: piece.compareAtCents ?? null };
 const live = applyLivePrice(rewired, priced);
 // WHICH WORDS THE PRICE REWRITE OWNS, asked of applyLivePrice itself rather than guessed from class
 // names: rewrite the same page with an amount it cannot already show, and every numbered element
 // whose text moves is a price slot. Works when today's price equals crawl day's, and on a theme whose
 // price markup only that function's own rules recognise.
 const probe = textByEid(applyLivePrice(rewired, { ...priced, priceCents: (piece.priceCents ?? 0) + 7_777_777, compareAtCents: null }));

 const $ = cheerio.load(injectHostedDetails(live, piece.detailsHtml || ""));
 const outsideChrome = (el: DomElement) => $(el).closest(CHROME).length === 0;
 const name = norm(piece.title);
 const description = piece.description ? norm(cheerio.load(piece.description).text()) : "";

 const owned: DomElement[] = [];
 for (const el of $("[data-vya-eid]").toArray() as DomElement[]) {
  const was = probe.get($(el).attr("data-vya-eid") || "");
  if (was !== undefined && was !== $(el).text()) { owned.push(el); continue; }
  if (!outsideChrome(el)) continue;
  const text = norm($(el).text());
  // Her piece's name wherever else the page prints it (a breadcrumb), and her description's lines
  // wherever a theme put them.
  if ((name && text === name) || (description && text.length >= DESCRIPTION_LINE_MIN && description.includes(text))) owned.push(el);
 }
 for (const el of $(`${TITLE}, ${DESCRIPTION}`).toArray() as DomElement[]) if (outsideChrome(el)) owned.push(el);
 for (const el of $("[data-vya-details]").toArray() as DomElement[]) owned.push(el);

 for (const el of owned) {
  $(el).attr("data-vya-item", piece.id).attr("data-vya-item-title", piece.title || "");
  $(el).find("[data-vya-eid]").addBack("[data-vya-eid]").removeAttr("data-vya-eid");
 }

 const bridge = `<script data-vya-piece-click="1">${PIECE_CLICK_JS}</script>`;
 if ($("body").length) $("body").first().append(bridge);
 else return $.html() + bridge;
 return $.html();
}
