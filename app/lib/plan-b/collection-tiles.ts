// The "shop by collection" tiles on a captured site, rendered from the seller's LIVE collections.
//
// WHY. Product grids have been live since the mirror began (site-capture.ts, injectLiveGrids): add,
// reprice or sell a piece in the portal and her site reflects it with no re-crawl. The row of
// COLLECTION tiles above them stayed frozen at whatever the crawl photographed. So a seller could
// create a collection in VYA, fill it, give it a cover photo — and her own storefront still showed
// the three categories her old Shopify site happened to have on capture day, with no way to add one,
// remove one, or change the picture. She clicked a tile in the editor and got a text box.
//
// WHAT THIS DOES. Finds those tile rows structurally — the exact shape productGrids() already
// identifies in order to REFUSE it ("a collection list is structurally identical to a product grid
// but its links point at /collections/, not /products/") — and refills each one from her real
// collections, keeping every scrap of the theme's markup: its classes, its aspect ratio, its
// caption styling. Same rule as the product grids, for the same reason: never invent markup, reuse
// the theme's, or the row stops looking like her shop.

import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

export type CollectionTile = { title: string; slug: string; imageUrl?: string | null };

/** Chrome that is a list of links by nature. Replacing a menu with collection tiles is the failure
 *  this guards against — the same names productGrids() screens out, for the same reason. */
const CHROME_RE = /pagination|breadcrumb|menu|nav|social|footer|header|announcement/;

/** Does this child look like a collection TILE: a picture you click, with a caption. */
function looksLikeTile($: cheerio.CheerioAPI, el: DomElement): boolean {
 const $el = $(el);
 if ($el.find("img").length === 0) return false; // a captionless list of links is a menu, not tiles
 const href = $el.find("a[href]").map((_i, a) => $(a).attr("href") || "").get();
 if (!href.some((h) => /\/collections\/[^/?#]+/.test(h))) return false;
 return !href.some((h) => /\/products\//.test(h));
}

/**
 * Every collection-tile row on the page, in document order, innermost first.
 *
 * Deliberately the mirror image of productGrids(): links to collections, none to products, at least
 * two of them. Anything that satisfies both would be ambiguous, and this returns nothing for it.
 */
export function collectionTileGrids($: cheerio.CheerioAPI): DomElement[] {
 const candidates: { el: DomElement; tiles: number }[] = [];
 const scanned = ($("ul, ol, div, section").toArray() as DomElement[]).concat(
  ($("*").toArray() as DomElement[]).filter((el) => typeof el.tagName === "string" && el.tagName.includes("-")),
 );
 $(scanned).each((_, el) => {
  const $el = $(el);
  const cls = `${$el.attr("class") || ""} ${$el.attr("id") || ""}`.toLowerCase();
  if (CHROME_RE.test(cls)) return;
  if ($el.closest("nav, header, footer, [role='navigation']").length > 0) return;
  const hrefs = $el.find("a[href]").map((_i, a) => $(a).attr("href") || "").get();
  if (hrefs.some((h) => /\/products\//.test(h))) return; // a product grid; not ours
  const toCollections = new Set(hrefs.map((h) => h.match(/\/collections\/([^/?#]+)/)?.[1]).filter(Boolean));
  if (toCollections.size < 2) return;
  const kids = $el.children().toArray() as DomElement[];
  if (kids.length < 2) return;
  const tiles = kids.filter((k) => looksLikeTile($, k)).length;
  // Most of the container's children must be tiles, so a page wrapper holding one row doesn't
  // qualify on the strength of its one row child.
  if (tiles >= 2 && tiles >= kids.length * 0.6) candidates.push({ el, tiles });
 });
 return candidates
  .filter(({ el }) => !candidates.some((o) => o.el !== el && $(el).find(o.el).length > 0))
  .map((c) => c.el);
}

/**
 * Where a tile's name is written.
 *
 * A heading wins outright when the theme uses one. Otherwise it's the first leaf that carries words
 * — never a wrapper, so writing the name can't wipe out the picture that shares the tile with it,
 * and never the second leaf, which is where themes put "12 items" or "Shop now".
 */
function captionEl($: cheerio.CheerioAPI, $tile: cheerio.Cheerio<DomElement>): cheerio.Cheerio<DomElement> {
 const words = (el: DomElement) => ($(el).text() || "").trim().length > 0;
 const $heading = $tile.find("h1, h2, h3, h4, h5, h6").filter((_i, el) => words(el)).first();
 if ($heading.length) return $heading as cheerio.Cheerio<DomElement>;
 const leaf = ($tile.find("*").toArray() as DomElement[]).find((el) => {
  if (el.tagName === "img" || el.tagName === "svg" || el.tagName === "style" || el.tagName === "script") return false;
  return $(el).children().length === 0 && words(el);
 });
 return (leaf ? $(leaf) : $()) as cheerio.Cheerio<DomElement>;
}

/** Point the theme's own <img> at the seller's cover photo, giving its lazy-loading machinery
 *  nothing left to recompute from. Same treatment the live product cards get. */
function setTileImage($: cheerio.CheerioAPI, $img: cheerio.Cheerio<DomElement>, src: string, alt: string): void {
 $img.attr("src", src).attr("alt", alt).removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes").removeAttr("loading");
 for (const a of Object.keys($img.get(0)?.attribs || {})) {
  if (/^data-(rimg|srcset|sizes|widths|media|image|src)/i.test(a)) $img.removeAttr(a);
 }
 // <picture> hands the browser its own candidates, which would win over the src we just set.
 $img.closest("picture").find("source").remove();
}

/** The collection handle a captured tile links to, if any. */
function tileHandle($: cheerio.CheerioAPI, el: DomElement): string | null {
 for (const a of $(el).find("a[href]").toArray() as DomElement[]) {
  const m = ($(a).attr("href") || "").match(/\/collections\/([^/?#]+)/);
  if (m?.[1]) return decodeURIComponent(m[1]).toLowerCase();
 }
 return null;
}

/**
 * Bring a captured collection row up to date with the seller's own collections.
 *
 * AUGMENT, NEVER REPLACE. The first version of this emptied the row and rebuilt it from her VYA
 * collections. On a real store that was destructive: her collections carried no cover photos yet, so
 * every rebuilt tile fell back to the first captured tile's picture — one piece of stock clip-art
 * repeated down a page that had held her own photography — and her VYA collection names ("Collection
 * 3", "Commission - 3%") replaced the curated captions. A row of her real, photographed collections
 * is the thing being edited here; it is never ours to throw away because a newer list exists.
 *
 * So: a captured tile stays exactly where it is, keeping its picture and its wording, and only takes
 * on a cover photo she has actually chosen. A collection with no tile on the page appears as a new
 * one — but only once it HAS a cover photo, because a tile cloned from a neighbour would be showing
 * a shopper somebody else's picture under this collection's name.
 *
 * @param base   path the storefront is mounted at ("" on the seller's own domain, "/site/{slug}" on a
 *               VYA origin) — an absolute /collections/… href would leave her site on ours.
 * @param uncapped may the row grow past the number of tiles the theme drew. True for the collections
 *               index, whose job is to list everything; false anywhere else, where the tile count is
 *               a layout decision and overflowing it is the "251 slides in a 3-slide carousel" bug.
 */
export function injectCollectionTiles(
 html: string,
 tiles: CollectionTile[],
 opts: { base?: string; uncapped?: boolean } = {},
): string {
 if (!tiles.length) return html;
 const $ = cheerio.load(html);
 const grids = collectionTileGrids($);
 if (!grids.length) return html;
 const base = opts.base || "";
 const bySlug = new Map(tiles.map((t) => [t.slug.toLowerCase(), t]));
 let changed = false;

 for (const gridEl of grids) {
  const $grid = $(gridEl);
  const tileChildren = ($grid.children().toArray() as DomElement[]).filter((k) => looksLikeTile($, k));
  if (!tileChildren.length) continue;
  const present = new Set<string>();

  // 1. The tiles already on the page keep their place, their picture and their wording. The only
  //    thing that changes is a cover photo she has chosen for that collection herself.
  for (const el of tileChildren) {
   const handle = tileHandle($, el);
   if (!handle) continue;
   present.add(handle);
   const t = bySlug.get(handle);
   if (!t?.imageUrl) continue;
   const $img = $(el).find("img").first() as cheerio.Cheerio<DomElement>;
   if (!$img.length) continue;
   setTileImage($, $img, t.imageUrl, t.title);
   changed = true;
  }

  // 2. Collections with no tile on this page. Only ones she has given a picture: a clone of a
  //    neighbour would put another collection's photograph under this one's name.
  const missing = tiles.filter((t) => t.imageUrl && !present.has(t.slug.toLowerCase()));
  if (!missing.length) continue;
  const room = opts.uncapped ? missing.length : 0; // a fixed row is already the size the theme chose
  const adding = missing.slice(0, room);
  if (!adding.length) continue;

  const $cloneSource = $(tileChildren[tileChildren.length - 1]).clone() as cheerio.Cheerio<DomElement>;
  // Capture inlines each stylesheet where its <link> was, sometimes INSIDE a tile. Cloning one that
  // holds a stylesheet would duplicate a whole theme's CSS per collection.
  $cloneSource.find("style, link").remove();
  for (const t of adding) {
   const $tile = $cloneSource.clone() as cheerio.Cheerio<DomElement>;
   $tile.find("a[href]").each((_i, a) => {
    const $a = $(a);
    $a.attr("href", `${base}/collections/${t.slug}`);
    if ($a.attr("aria-label")) $a.attr("aria-label", t.title);
    if ($a.attr("title")) $a.attr("title", t.title);
   });
   const $caption = captionEl($, $tile);
   if ($caption.length) $caption.text(t.title);
   const $img = $tile.find("img").first() as cheerio.Cheerio<DomElement>;
   if ($img.length) setTileImage($, $img, t.imageUrl as string, t.title);
   $grid.append($tile);
   changed = true;
  }
  $grid.attr("data-vya-collections", "1"); // marker: this row has live tiles in it
 }
 return changed ? $.html() : html;
}
