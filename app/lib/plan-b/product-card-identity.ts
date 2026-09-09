// Tie a captured product card back to the piece it stands for in the seller's inventory.
//
// WHY. The visual editor serves the CAPTURED page — frozen markup from crawl day — while shoppers
// get the same page with its grids refilled from live inventory. So the seller opens the editor,
// clicks a product's name or its price, and gets a text box. Typing in it does nothing she can ever
// see: the live render regenerates that text from Inventory on the next page load. She reported it
// as "the name is editable and it shouldn't be — it should link back to that item in inventory".
//
// This finds the piece behind each captured card by its `/products/{handle}` link — the same handle
// stored on the item as `sourceId` — and stamps it on the card. The editor reads it back off the DOM
// to say whose card it is and to offer the piece in Inventory instead of a text box that lies.

import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

export type CardIdentity = { id: string; title: string };

/**
 * What a shopper would call "the card": the smallest thing around this link that holds the piece's
 * picture AND its words.
 *
 * Never the link itself when that link wraps only the photo — themes routinely split a card into a
 * picture link and a caption link, and stamping each would mark one card as two different pieces.
 * A link with no picture anywhere above it (a "shop the dress" mention in a paragraph) is its own
 * card, so a sentence never gets treated as product markup.
 */
function cardRoot($: cheerio.CheerioAPI, a: DomElement): DomElement | null {
 let el: DomElement | null = a;
 for (let hops = 0; el && hops < 6; hops++) {
  const $el: cheerio.Cheerio<DomElement> = $(el);
  if ($el.is("body, main, html")) break;
  if ($el.find("img").length > 0 && ($el.text() || "").trim().length > 0) return el;
  el = ($el.parent().get(0) as DomElement | undefined) ?? null;
 }
 return a;
}

/**
 * Stamp every captured product card with the inventory piece it stands for.
 *
 * @param resolve a product handle → the seller's piece, or null when she doesn't hold it (an item
 *        sold and delisted, or a page captured from a collection she never imported). Unresolved
 *        cards are left alone: a card with no stamp behaves exactly as it did before.
 */
export function stampProductCards(html: string, resolve: (handle: string) => CardIdentity | null): string {
 const $ = cheerio.load(html);
 let stamped = 0;
 for (const a of $('a[href*="/products/"]').toArray() as DomElement[]) {
  const href = $(a).attr("href") || "";
  const handle = href.match(/\/products\/([^/?#]+)/)?.[1];
  if (!handle) continue;
  const hit = resolve(decodeURIComponent(handle));
  if (!hit) continue;
  const root = cardRoot($, a);
  if (!root) continue;
  const $root = $(root);
  // A card reached twice (its photo and its caption are separate links) is stamped once.
  if ($root.attr("data-vya-item")) continue;
  $root.attr("data-vya-item", hit.id).attr("data-vya-item-title", hit.title || "");
  stamped++;
 }
 return stamped ? $.html() : html;
}
