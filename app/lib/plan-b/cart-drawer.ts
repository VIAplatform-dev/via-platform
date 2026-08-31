// Rendering the theme's CART DRAWER after an Add-to-cart.
//
// cart-sections.ts builds the three sections Dawn's `cart-notification` variant asks for. Stores on
// the `cart-drawer` variant ask for a different one — `cart-drawer` — which we could not build, so
// it fell through to buildFallbackSection() and echoed the page's EXISTING drawer markup back. That
// markup was captured while the crawler's cart was empty, so the drawer faithfully re-rendered an
// empty cart every time. The item really was added; the shopper was shown an empty bag and
// reasonably concluded the button was broken.
//
// The theme replaces the drawer's contents with what we return here:
//
//   document.querySelector('#CartDrawer').innerHTML =
//     new DOMParser().parseFromString(sections['cart-drawer'], 'text/html')
//       .querySelector('#CartDrawer').innerHTML
//
// so the response must CONTAIN #CartDrawer, and everything inside it has to be the theme's own
// markup — which is why rows are cloned from the captured cart page rather than hand-built. Anything
// we invent arrives unstyled, because only the theme's classes have CSS behind them.
//
// Pure: HTML and cart lines in, HTML out. The route fetches what it needs and hands it over.
import * as cheerio from "cheerio";
import type { Element as DomEl } from "domhandler";
import type { CartPageLine } from "../site-capture.ts";
import type { CartTemplate } from "./derive-cart-template.ts";
import { renderCartRows } from "./render-cart.ts";

/** Where the drawer lives, most specific first — Dawn's id, then the custom element, then a class. */
const DRAWER = "#CartDrawer, cart-drawer, .cart-drawer";
/** Where rows go inside it. */
const ITEMS = "#CartDrawer-CartItems, .drawer__contents.js-contents, .drawer__contents, .js-contents";

function esc(s: string): string {
 return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function money(cents: number, currency: string | null): string {
 try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format((cents || 0) / 100); }
 catch { return `$${((cents || 0) / 100).toFixed(2)}`; }
}

/**
 * Rewrite one cloned row to describe THIS line.
 *
 * Same principle as injectCartPage's row cloning: the theme's markup already knows its own layout,
 * price format and spacing, so we change the content and leave the structure alone.
 */
function fillRow($: cheerio.CheerioAPI, $row: cheerio.Cheerio<DomEl>, line: CartPageLine, index: number): void {
 $row.find("style, link, script").remove();
 $row.removeAttr("id");

 // Image: keep one, and only one — a theme's hover-swap second <img> shows through otherwise.
 const $img = $row.find("img").first();
 if (line.image && $img.length) $img.attr("src", line.image).attr("alt", line.title).removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes");
 else if (!line.image) $img.remove();
 const keep = $img.get(0);
 for (const el of $row.find("img").toArray()) if (el !== keep) $(el).remove();

 // Title, in the theme's own name element where it has one.
 let $name = $row.find("[class*='cart-item__name'], [class*='item__name'], [class*='product-title']").first();
 // Those are Dawn's names. A theme that calls it something else (Horizon uses `cart-items__name`)
 // still puts the product's name in the row's longest text-bearing link, so fall back to that
 // rather than leaving the template's own product on the page.
 if (!$name.length) {
  const links = $row.find("a[href]").toArray().map((a) => $(a)).filter(($a) => ($a.text() || "").trim().length > 1);
  const longest = links.sort((a, b) => (b.text() || "").trim().length - (a.text() || "").trim().length)[0];
  if (longest) $name = longest;
 }
 const old = ($name.text() || "").replace(/\s+/g, " ").trim();
 if ($name.length) $name.text(line.title);
 $row.find("a[href]").attr("href", line.href);

 // Every money-shaped string in the row is this line's price: VYA stock is one-of-one, so the unit
 // price and the line total are always the same number.
 for (const node of $row.find("*").addBack().contents().toArray()) {
  const n = node as unknown as { type: string; data?: string };
  if (n.type !== "text" || !n.data) continue;
  if (!/^\s*[^\d]{0,3}[\d,]+(\.\d{2})?\s*[A-Z]{0,3}\s*$/.test(n.data)) continue;
  if (/^\s*\d+\s*$/.test(n.data)) continue; // a bare quantity, not money
  n.data = n.data.replace(/[^\d]{0,3}[\d,]+(\.\d{2})?/, money(line.priceCents, line.currency));
 }
 // Any leftover copy of the template product's name that wasn't in the name element.
 if (old && old !== line.title) {
  for (const node of $row.find("*").addBack().contents().toArray()) {
   const n = node as unknown as { type: string; data?: string };
   if (n.type === "text" && n.data && n.data.includes(old)) n.data = n.data.split(old).join(line.title);
  }
 }

 // Variant lines describe the template's product, not this one.
 $row.find("[class*='product-option']").remove();
 // A stepper on a one-of-one piece offers a second copy of something there is only one of.
 $row.find("[class*='quantity'] input, quantity-input input").attr("value", "1").attr("readonly", "readonly").attr("min", "1").attr("max", "1");
 $row.find("[class*='quantity__button'], [name='minus'], [name='plus']").remove();

 // The remove control: every clone otherwise inherits the template row's index and removes line 1.
 $row.find("cart-remove-button, [data-index]").attr("data-index", String(index));
 $row.find("cart-remove-button").attr("id", `Drawer-remove-${index}`);
 $row.find("a[href*='/cart/change']").attr("href", `/cart/change?line=${index}&quantity=0`);
}

/**
 * Anything a theme might call a cart line. Deliberately broad — and deliberately NOT trusted on its
 * own, because breadth is exactly how the header row got cloned.
 */
const ROW_CANDIDATES = "[class*='cart-item'], [class*='cart_item'], [class*='cart__item'], [class*='line-item'], [class*='line_item']";
const MONEY = /[£$€¥]\s?[\d,]+(\.\d{2})?|\d[\d,]*[.,]\d{2}/;

/**
 * The theme's own line-item markup, picked out of its captured cart page.
 *
 * Class names alone are not enough. Horizon calls its rows `cart-items__table-row` — and so is its
 * table HEADER row, so `[class*='cart-item']` matched the header first and every cart line rendered
 * as "Product image / Product information". Structure is what separates them: a header holds <th>
 * column labels, a line holds a picture and a price.
 *
 * Exported for its own tests; replaced wholesale once cart templates are derived at import time
 * (see docs/superpowers/specs/2026-08-26-derived-cart-templates-design.md).
 */
export function pickRowTemplateHtml(html: string): string | null {
 if (!html) return null;
 const $ = cheerio.load(html);
 let best: { html: string; complete: number; nested: number } | null = null;

 for (const el of $(ROW_CANDIDATES).toArray()) {
  const $el = $(el);
  // A header is not a line: it labels the columns rather than describing a product. This also
  // rejects any wrapper that CONTAINS the header, e.g. the whole <table>.
  if (el.tagName === "th" || $el.find("th").length > 0 || $el.closest("thead").length > 0) continue;

  const hasImg = $el.find("img").length > 0;
  const hasMoney = MONEY.test($el.text() || "");
  // Nothing product-shaped in it at all — a wrapper, a status region, an empty-state block.
  if (!hasImg && !hasMoney) continue;

  // COMPLETENESS FIRST: a whole line has a picture, a price and a link to the product. A single
  // cell of one has only some of those, so it must never beat the row that contains it.
  const complete = (hasImg ? 1 : 0) + (hasMoney ? 1 : 0) + ($el.find("a[href]").length ? 1 : 0);
  // Among equally complete candidates, take the SMALLEST — otherwise a wrapper sharing the class
  // prefix (`cart-items` contains `cart-item`) wins and swallows the entire table.
  const nested = $el.find(ROW_CANDIDATES).length;

  if (!best || complete > best.complete || (complete === best.complete && nested < best.nested)) {
   best = { html: $.html($el), complete, nested };
  }
 }
 return best ? best.html : null;
}

/** A plain row, for a store whose cart page we never captured (so there is nothing to clone). */
function plainRow(line: CartPageLine, index: number): string {
 const img = line.image ? `<td class="cart-item__media"><a href="${esc(line.href)}"><img src="${esc(line.image)}" alt="${esc(line.title)}" width="70"></a></td>` : `<td class="cart-item__media"></td>`;
 return `<tr class="cart-item">${img}
  <td class="cart-item__details"><a href="${esc(line.href)}" class="cart-item__name">${esc(line.title)}</a></td>
  <td class="cart-item__quantity"><cart-remove-button id="Drawer-remove-${index}" data-index="${index}"><a href="/cart/change?line=${index}&quantity=0">Remove</a></cart-remove-button></td>
  <td class="cart-item__totals"><span class="price">${money(line.priceCents, line.currency)}</span></td>
 </tr>`;
}

/**
 * Build the `cart-drawer` section for this visitor's real cart.
 *
 * `pageHtml` is the page the shopper added from (the theme sends it as `sections_url`), which is
 * where the drawer's own markup lives. `rowTemplateHtml` is the captured /cart page — captured with
 * a product in it by captureCartTemplate, so it carries a real row to clone. Returns null when the
 * page has no drawer at all, so the caller can fall back.
 */
type FillOpts = {
 rowTemplateHtml?: string;
 /** The layout derived at import time. Preferred over guessing at class names — see
  *  derive-cart-template.ts. */
 template?: CartTemplate | null;
 lines: CartPageLine[];
 checkoutHref: string;
};

/** Everything a drawer needs to describe THIS visitor's bag. Mutates in place. */
function fillDrawer($: cheerio.CheerioAPI, $drawer: cheerio.Cheerio<DomEl>, opts: FillOpts): void {
 const { rowTemplateHtml, template, lines } = opts;

 // The crawler stamps onsubmit="return false" on every /cart form so a captured page can never post
 // to the old platform. Plan B keeps scripts, so that guard survives — and it also blocks the
 // theme's OWN Checkout button, which is a native submit of this form. Ours is the live drawer, and
 // POST /cart is answered by VYA, so the guard has to come off or Checkout does nothing.
 $drawer.find("form").removeAttr("onsubmit");
 const $form = $drawer.find("form[action*='/cart'], #CartDrawer-Form").first();
 if ($form.length) $form.attr("action", "/cart").attr("method", "post");
 const $btn = $drawer.find("[name='checkout'], #CartDrawer-Checkout").first();

 // Whatever the capture happened to have in it. A drawer captured mid-crawl can hold the crawler's
 // OWN cart, and leaving it there showed a shopper a stranger's product — beside the words "Your
 // cart is empty" when their own bag was empty. It is never right to keep it.
 const $items = $drawer.find(ITEMS).first();
 const stale = $drawer.find(ROW_CANDIDATES).toArray().filter((el) => !$(el).closest("thead").length && !$(el).find("th").length);
 for (const el of stale) $(el).remove();
 $drawer.find("table.cart-items").each((_i: number, el: DomEl) => { if (!$(el).find("tr").length) $(el).remove(); });

 if (!lines.length) {
  // Nothing to show. Leave the theme's empty state exactly as it is, and make sure the shopper
  // cannot start a checkout with an empty bag.
  if ($btn.length) $btn.attr("disabled", "disabled");
  return;
 }

 // A drawer rendered for an empty cart carries is-empty (on the drawer, its inner, or the
 // cart-drawer-items element depending on the theme) plus a standalone empty-cart block.
 $drawer.find(".is-empty").removeClass("is-empty");
 $drawer.removeClass("is-empty");
 $drawer.find("[class*='drawer__inner-empty'], [class*='cart__empty'], [class*='cart-drawer__empty']").remove();
 // Newer themes keep the empty state in a <template> and clone it client-side (Horizon uses
 // `empty-cart-template`), and put "Your cart is empty" in the drawer HEADING rather than a block.
 // Neither is caught by a class selector, so a drawer holding real items still announced itself as
 // empty.
 $drawer.find("template[id*='empty' i], template[class*='empty' i]").remove();
 for (const el of $drawer.find("*").toArray() as DomEl[]) {
  if ($(el).children().length) continue;
  if (/^\s*(your\s+)?(cart|bag)\s+is\s+empty\s*[.!]?\s*$/i.test($(el).text() || "")) $(el).remove();
 }
 if ($btn.length) $btn.removeAttr("disabled");

 // Rows. A DERIVED template is preferred: it knows where this theme puts a title, a price and a
 // picture because the store showed us, so it needs no class names and cannot mistake a table
 // header for a product. Without one we fall back to picking a row out of the captured cart page.
 const rowsHtml = template
  ? renderCartRows(template, lines)
  : (() => {
     const tplHtml = rowTemplateHtml ? pickRowTemplateHtml(rowTemplateHtml) : null;
     return lines.map((line, i) => {
      if (!tplHtml) return plainRow(line, i + 1);
      const $row = $(tplHtml).first();
      fillRow($, $row as cheerio.Cheerio<DomEl>, line, i + 1);
      return $.html($row);
     }).join("");
    })();

 const table = `<table class="cart-items"><tbody>${rowsHtml}</tbody></table>`;
 if ($items.length) $items.append(table);
 else if ($form.length) $form.prepend(`<div id="CartDrawer-CartItems" class="drawer__contents js-contents">${table}</div>`);
 else $drawer.append(table);

 // Totals, in whichever element the theme prints them in.
 const subtotal = lines.reduce((n, l) => n + l.priceCents, 0);
 const currency = lines[0]?.currency || "USD";
 for (const el of $drawer.find("[class*='totals__total-value'], [class*='totals__subtotal-value'], [class*='cart__subtotal'], [class*='cart-total']").toArray()) {
  if ($(el).children().length) continue;
  const t = $(el).text() || "";
  $(el).text(t.includes(currency) ? `${money(subtotal, currency)} ${currency}` : money(subtotal, currency));
 }
}

/**
 * Build the `cart-drawer` section for this visitor's real cart.
 *
 * `pageHtml` is the page the shopper added from (the theme sends it as `sections_url`), which is
 * where the drawer's own markup lives. Returns null when the page has no drawer at all, so the
 * caller can fall back.
 */
export function buildCartDrawerSection(opts: FillOpts & { pageHtml: string }): string | null {
 if (!opts.pageHtml) return null;
 const $ = cheerio.load(opts.pageHtml);
 const $drawer = $(DRAWER).first() as cheerio.Cheerio<DomEl>;
 if (!$drawer.length) return null;
 fillDrawer($, $drawer, opts);
 return $.html($drawer);
}

/**
 * The same work, applied to a page being SERVED rather than a section being answered.
 *
 * Clicking the cart icon opens the drawer already in the page — no request is made — so a drawer
 * captured with an empty cart told every shopper their bag was empty while the badge beside it said
 * otherwise. Every page carries the drawer (it lives in the site header), so every page needs this.
 */
export function injectCartDrawer(pageHtml: string, opts: FillOpts): string {
 if (!pageHtml) return pageHtml;
 try {
  const $ = cheerio.load(pageHtml);
  const $drawer = $(DRAWER).first() as cheerio.Cheerio<DomEl>;
  if (!$drawer.length) return pageHtml;
  fillDrawer($, $drawer, opts);
  return $.html();
 } catch {
  return pageHtml; // a drawer we cannot fill is never worth failing the whole page for
 }
}
