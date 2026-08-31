/**
 * A heart on the seller's favourites link, where she used a person.
 *
 * we-thieves' header carries a little person icon that goes to /favorites — the same glyph a
 * shopper reads as "my account", sitting a few pixels from the account button we add. Two identical
 * icons meaning different things is a guess a shopper should not have to make, and the one that is
 * wrong is the favourites link: a heart is what every other shop uses for saved pieces.
 *
 * Deliberately narrow. Only a favourites/wishlist control, only when its icon currently reads as a
 * PERSON, and only the glyph — her link, her classes, her sizing and her words all stay as they are.
 */
import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

/** Where "saved pieces" live, however a theme spells it. */
const FAVOURITE_HREF = /(^|\/)(favou?rites?|wishlists?)(\/|\?|$)|\/apps\/[^/]*wish/i;
/** Never an account link — telling the two apart is the entire point. */
const ACCOUNT_HREF = /\/account|customer_login|customer_authentication/i;
/** …unless it already reads as saved pieces. */
const HEART_ICON = /heart|favou?rite|wish|like|bookmark|star/i;

const HEART =
 '<path d="M12 20.6 4.3 12.9a4.7 4.7 0 0 1 0-6.6 4.6 4.6 0 0 1 6.6 0l1.1 1.1 1.1-1.1a4.6 4.6 0 0 1 6.6 0 4.7 4.7 0 0 1 0 6.6Z"/>';

function isFavouritesControl($el: cheerio.Cheerio<DomElement>): boolean {
 const href = $el.attr("href") || "";
 const label = `${$el.attr("aria-label") || ""} ${$el.attr("title") || ""} ${$el.attr("class") || ""}`;
 if (ACCOUNT_HREF.test(href)) return false;
 return FAVOURITE_HREF.test(href) || HEART_ICON.test(label);
}

/**
 * @param html a whole page. Returned untouched, byte for byte, when there is nothing to correct —
 *             most stores name their favourites link properly already.
 */
export function retagFavourites(html: string): string {
 if (!html) return html;
 // Cheap reject before parsing: the overwhelming majority of pages have no favourites link at all.
 if (!/favou?rite|wishlist/i.test(html)) return html;

 const $ = cheerio.load(html);
 let changed = false;

 $("a[href], button").each((_: number, el: DomElement) => {
  const $el = $(el);
  if (!isFavouritesControl($el)) return;

  const $svg = $el.find("svg").first();
  if (!$svg.length) return;
  if ($svg.attr("data-vya-heart")) return; // already ours

  const marks = `${$svg.attr("class") || ""} ${$svg.find("[class]").attr("class") || ""} ${$el.attr("class") || ""}`;
  // A theme that has NAMED its icon a heart, star or bookmark has said what it means, and is none
  // of our business. Everything else on a favourites link gets a heart.
  //
  // The first rule here was narrower — replace only an icon named for an account — and it missed
  // the second store outright, because that theme names every icon `theme-icon` and its favourites
  // glyph is a person by drawing rather than by name. We cannot read a path and tell; what we can
  // say is that a heart on a favourites link is never wrong.
  if (HEART_ICON.test(marks)) return;

  // Her class, her width, her height — themes size icons by class, and dropping it leaves the icon
  // the wrong size for the row it sits in.
  const keep = ["class", "width", "height", "focusable"] as const;
  const attrs = keep
   .map((k) => ($svg.attr(k) ? ` ${k}="${String($svg.attr(k)).replace(/"/g, "&quot;")}"` : ""))
   .join("");
  // Fill and stroke go in the STYLE attribute, not in presentation attributes. Keeping her class
  // is what makes the icon the right size — and that class carries her own `fill: currentColor`,
  // which beats a `fill="none"` attribute and rendered the heart as a solid black blob beside a
  // row of outlined icons. An inline style is the only thing her stylesheet cannot outrank.
  const style = `${($svg.attr("style") || "").replace(/;?\s*$/, "")};fill:none;stroke:currentColor`.replace(/^;/, "");
  $svg.replaceWith(
   `<svg data-vya-heart="1"${attrs} style="${style.replace(/"/g, "&quot;")}" viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true" role="presentation">${HEART}</svg>`,
  );

  // A name only where there was none: an icon-only link is otherwise announced as "link".
  const named = ($el.attr("aria-label") || "").trim() || $el.text().trim();
  if (!named) $el.attr("aria-label", "Favorites");

  changed = true;
 });

 return changed ? $.html() : html;
}
