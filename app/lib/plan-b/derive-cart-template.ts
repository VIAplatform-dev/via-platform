// Working out a theme's cart layout by watching it render two products we chose.
//
// THE PROBLEM. Shopify renders a theme's sections from Liquid, on their servers, from files we do
// not have. When a shopper adds to cart, the theme asks us for the re-rendered HTML — so we have to
// reproduce markup we cannot render. Every cart bug we have is downstream of that.
//
// WHAT WE USED TO DO. Hardcode one theme's class names (`cart-item`, `#CartDrawer`,
// `totals__subtotal-value`). Those are Dawn's. Horizon calls a row `cart-items__table-row` — and so
// is its table HEADER, so the selector matched the header first and every cart line rendered as
// "Product image / Product information". Adding a Horizon branch buys two themes and fails on the
// third: themes are arbitrary markup, customisable per store, with no finite list to enumerate.
//
// WHAT WE DO INSTEAD. The importer already puts a real product into a cart on the source store and
// captures the result. Put in TWO products we chose, and the layout identifies itself:
//
//   • the element containing item A but NOT item B is A's row
//   • its parent holds the rows
//   • the element whose text is A's title is the title slot; likewise price, image, link
//   • the element whose text is A + B is the subtotal
//   • text present in the empty capture and absent from the full one is the empty state
//
// Nothing here names a class. It works on Dawn, on Horizon, and on themes neither of us has seen,
// because the store shows us its own markup and we read it against an answer key.
//
// Pure: HTML strings in, a template out. Storage and rendering live elsewhere.
// See docs/superpowers/specs/2026-08-26-derived-cart-templates-design.md
import * as cheerio from "cheerio";
import type { Element as DomEl } from "domhandler";

/** Where a value sits inside the row — a path of child indices from the row's root, never a class
 *  name. A path cannot accidentally match a table header the way `[class*='cart-item']` did. */
export type Slot = { path: number[]; kind: "text" | "attr"; attr?: string };

export type CartTemplate = {
 version: 1;
 /** The theme's own line-item markup, one copy, ready to clone. */
 rowHtml: string;
 /** Child-index path from the document body to the element the rows live in. */
 itemsPath: number[];
 slots: { title?: Slot; price?: Slot; image?: Slot; href?: Slot };
 /** Every element whose text was the sum of the two known prices. */
 subtotalPaths: number[][];
 /** Leaves inside the row that describe the TEMPLATE's product and nothing else — a vendor, a SKU,
  *  a variant label. We have no value to substitute, so they are dropped rather than shown wrong. */
 stalePaths: number[][];
 /** Text that appears only when the cart is empty — the empty state to hide when it is not. */
 emptyMarkers: string[];
 /** 0..1. Below the caller's threshold, use VYA's own cart markup instead of guessing. */
 confidence: number;
};

/** One of the two products we deliberately put in the cart — our answer key. */
export type KnownItem = {
 title: string;
 priceText: string;
 imageUrl?: string;
 href?: string;
};

const norm = (s: string): string => (s || "").replace(/\s+/g, " ").trim();

/** The child-index path from `root` down to `el`. */
function pathTo($: cheerio.CheerioAPI, root: DomEl, el: DomEl): number[] | null {
 const path: number[] = [];
 let cur: DomEl | null = el;
 while (cur && cur !== root) {
  const parent = cur.parent as DomEl | null;
  if (!parent) return null;
  const idx = $(parent).children().toArray().indexOf(cur);
  if (idx < 0) return null;
  path.unshift(idx);
  cur = parent;
 }
 return cur === root ? path : null;
}

/**
 * The element that holds item A and nothing of item B — A's row.
 *
 * Elements containing A-and-not-B form a chain from the title element up to the row; the row's
 * PARENT holds both, so the row is the SHALLOWEST link in that chain. Taking the deepest would give
 * the title element; taking anything above gives the whole table.
 */
function findRow($: cheerio.CheerioAPI, a: KnownItem, b: KnownItem): DomEl | null {
 const candidates: { el: DomEl; depth: number }[] = [];
 for (const el of $("*").toArray() as DomEl[]) {
  // A header labels columns; it is never a product line, and a wrapper containing one is not either.
  if (el.tagName === "th" || $(el).find("th").length > 0 || $(el).closest("thead").length > 0) continue;
  const text = norm($(el).text());
  if (!text.includes(a.title) || text.includes(b.title)) continue;
  let depth = 0;
  for (let p = el.parent as DomEl | null; p; p = p.parent as DomEl | null) depth++;
  candidates.push({ el, depth });
 }
 if (!candidates.length) return null;
 candidates.sort((x, y) => x.depth - y.depth);
 return candidates[0].el;
}

/** Find where a known value sits inside the row. */
function findSlot($: cheerio.CheerioAPI, row: DomEl, match: (el: DomEl) => boolean, kind: "text" | "attr", attr?: string): Slot | undefined {
 // Deepest match: the tightest element holding the value, not a wrapper around it.
 let best: { el: DomEl; depth: number } | null = null;
 for (const el of $(row).find("*").toArray() as DomEl[]) {
  if (!match(el)) continue;
  let depth = 0;
  for (let p = el.parent as DomEl | null; p; p = p.parent as DomEl | null) depth++;
  if (!best || depth > best.depth) best = { el, depth };
 }
 if (!best) return undefined;
 const path = pathTo($, row, best.el);
 return path ? { path, kind, ...(attr ? { attr } : {}) } : undefined;
}

/**
 * The number in a money string, ignoring how it was written.
 *
 * The known price comes from the store's product feed ("699.00") while the page renders it in the
 * theme's own format ("$699.00", "£699.00 GBP", "699,00 €"). Comparing the strings would only ever
 * match by luck, so everything compares by VALUE.
 */
function moneyValue(s: string): number | null {
 const m = (s || "").replace(/[^\d.,]/g, "");
 if (!m) return null;
 // A comma is a thousands separator when a dot follows it, and a decimal point otherwise.
 const cleaned = m.includes(".") ? m.replace(/,/g, "") : m.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
 const n = Number(cleaned);
 return Number.isFinite(n) ? n : null;
}

/** A leaf whose ENTIRE text is an amount. Such a field is restateable — we know the price — so it
 *  must never be treated as an un-substitutable per-product field. */
const MONEY_LEAF = /^[^\d]{0,3}[\d,]+(\.\d{2})?\s*[A-Za-z]{0,3}$/;

/**
 * An image URL reduced to something comparable across Shopify's CDN transformations.
 *
 * The known URL comes from products.json ("…/109.jpg?v=17841") while the cart page renders a RESIZED
 * variant ("…/109_150x150.jpg?v=17841"). Comparing the strings never matches, so the image slot was
 * never found — and every cart line then showed the TEMPLATE's picture, which is what a shopper
 * actually saw: two different bags with the same photo.
 */
function imageKey(url: string): string {
 const file = (url || "").split("?")[0].split("/").pop() || "";
 // Strip Shopify's size/crop suffix: 109_150x150.jpg, 109_1024x1024_crop_center.jpg → 109.jpg
 return file.replace(/_(\d+)?x(\d+)?(_crop_[a-z]+)?(?=\.[a-z]+$)/i, "").toLowerCase();
}

/** Does this text carry exactly this amount of money? */
function isAmount(text: string, amount: number): boolean {
 const v = moneyValue(text);
 return v != null && Math.abs(v - amount) < 0.005;
}

/**
 * Derive a cart template from a capture taken with two known products in the bag.
 *
 * Returns null rather than a low-quality guess: a wrong template renders a table header as a product
 * line, which is worse than falling back to VYA's own clean cart markup.
 */
export function deriveCartTemplate(opts: {
 twoItemHtml: string;
 emptyHtml?: string;
 items: [KnownItem, KnownItem];
}): CartTemplate | null {
 const { twoItemHtml, emptyHtml, items } = opts;
 const [a, b] = items;
 if (!twoItemHtml || !a?.title || !b?.title) return null;

 let $: cheerio.CheerioAPI;
 try { $ = cheerio.load(twoItemHtml); } catch { return null; }

 const rowA = findRow($, a, b);
 if (!rowA) return null;
 // Both known items must be present, or we cannot tell what repeats — one row is a coincidence.
 const rowB = findRow($, b, a);
 if (!rowB) return null;

 const $row = $(rowA);
 const rowHtml = $.html($row);
 if (!rowHtml || !rowHtml.trim()) return null;

 // Where rows live: A's parent. (B is a sibling, which is what makes it a list of rows.)
 const body = $("body").get(0) as DomEl | undefined;
 const parent = rowA.parent as DomEl | null;
 const itemsPath = body && parent ? pathTo($, body, parent) ?? [] : [];

 // Slots, located by matching values we already know the answer to.
 const slots: CartTemplate["slots"] = {};
 slots.title = findSlot($, rowA, (el) => norm($(el).text()) === a.title, "text")
  ?? findSlot($, rowA, (el) => norm($(el).text()).includes(a.title), "text");
 // By value, not by string: the feed says "699.00" and the theme renders "$699.00".
 const priceA = moneyValue(a.priceText);
 if (priceA != null) {
  slots.price = findSlot($, rowA, (el) => $(el).children().length === 0 && isAmount(norm($(el).text()), priceA), "text")
   ?? findSlot($, rowA, (el) => isAmount(norm($(el).text()), priceA), "text");
 }
 if (a.imageUrl) {
  const key = imageKey(a.imageUrl);
  slots.image = findSlot($, rowA, (el) => el.tagName === "img" && ($(el).attr("src") || "").includes(a.imageUrl!), "attr", "src")
   // …and by filename, because the cart renders a resized variant of the same file.
   ?? (key ? findSlot($, rowA, (el) => el.tagName === "img" && imageKey($(el).attr("src") || "") === key, "attr", "src") : undefined)
   // Last resort: a row has one product picture, so the only <img> in it is that picture.
   ?? findSlot($, rowA, (el) => el.tagName === "img", "attr", "src");
 }
 if (a.href) slots.href = findSlot($, rowA, (el) => el.tagName === "a" && ($(el).attr("href") || "").includes(a.href!), "attr", "href");

 // The subtotal is the number that is neither item's price — it can only be their sum.
 const subtotalPaths: number[][] = [];
 const priceB = moneyValue(b.priceText);
 const sum = priceA != null && priceB != null ? priceA + priceB : null;
 if (sum != null && body) {
  for (const el of $("*").toArray() as DomEl[]) {
   if ($(el).children().length) continue; // leaf elements only, or every wrapper matches
   if (!isAmount(norm($(el).text()), sum)) continue;
   const p = pathTo($, body, el);
   if (p) subtotalPaths.push(p);
  }
 }

 // Fields that describe the template's product and cannot be restated for a different one.
 //
 // Found by comparing the two rows position by position: a leaf whose text DIFFERS between them is
 // per-product. The title and price differ too, but those have slots and get filled — everything
 // else (a vendor line, a SKU, a variant label) has no value we could put there. Showing the
 // template's is worse than showing none: a real Dawn store rendered "PradaMonogram Pochette" on
 // every line because the vendor came along with the row.
 const slotKeys = new Set(
  [slots.title, slots.price, slots.image, slots.href].filter(Boolean).map((sl) => (sl as Slot).path.join(".")),
 );
 const stalePaths: number[][] = [];
 for (const el of $(rowA).find("*").toArray() as DomEl[]) {
  if ($(el).children().length) continue; // leaves only — a wrapper's difference is its children's
  const text = norm($(el).text());
  if (!text) continue;
  // A price differs between the two rows but is not "stale" — render fills every money field.
  if (MONEY_LEAF.test(text) && moneyValue(text) != null) continue;
  const p = pathTo($, rowA, el);
  if (!p || slotKeys.has(p.join("."))) continue;
  // The same position in B's row. Same text → shared chrome ("Remove", "Qty"); different → the
  // value belonged to A.
  const $bAt = (() => {
   let $cur = $(rowB);
   for (const i of p) { const $n = $cur.children().eq(i); if (!$n.length) return null; $cur = $n; }
   return $cur;
  })();
  if (!$bAt) continue;
  if (norm($bAt.text()) !== text) stalePaths.push(p);
 }

 // The empty state: text the empty capture has and the full one does not.
 const emptyMarkers: string[] = [];
 if (emptyHtml) {
  try {
   const $e = cheerio.load(emptyHtml);
   const fullText = norm($("body").text());
   for (const el of $e("*").toArray() as DomEl[]) {
    if ($e(el).children().length) continue;
    const t = norm($e(el).text());
    if (t.length < 4 || t.length > 120) continue;
    if (!fullText.includes(t)) emptyMarkers.push(t);
   }
  } catch { /* an unreadable empty capture costs us the empty-state hint, nothing more */ }
 }

 // Confidence: a row plus a title plus a price is the minimum useful template; everything else
 // improves fidelity. The caller decides the threshold.
 const found = [slots.title, slots.price, slots.image, slots.href, subtotalPaths.length ? {} : null].filter(Boolean).length;
 const confidence = Math.min(1, 0.4 + found * 0.15);

 return { version: 1, rowHtml, itemsPath, slots, subtotalPaths, stalePaths, emptyMarkers: [...new Set(emptyMarkers)].slice(0, 10), confidence };
}
