// One renderer for every theme's cart lines.
//
// This is the payoff of derive-cart-template.ts: because the template says WHERE each value goes
// (as a position in the row, not a class name), filling it needs no knowledge of the theme at all.
// Dawn and Horizon go through the identical code path below, and so will a theme neither of us has
// seen — there is no branch to add.
//
// It replaces the per-theme selector lists that used to live in injectCartPage and
// buildCartDrawerSection, which is what made a Horizon store render its table HEADER as a product.
//
// Pure: a template and cart lines in, HTML out.
import * as cheerio from "cheerio";
import type { Element as DomEl } from "domhandler";
import type { CartTemplate, Slot } from "./derive-cart-template.ts";
import type { CartPageLine } from "../site-capture.ts";

/**
 * Anything a theme uses to remove a line: a custom element, a class, a link into /cart/change, or —
 * most commonly on newer themes — an icon button whose only label is an aria-label or title.
 */
const REMOVE_CONTROL = [
 "cart-remove-button",
 "[class*='cart-remove']",
 "[class*='remove']",
 "a[href*='/cart/change']",
 "[aria-label*='Remove' i]",
 "[title*='Remove' i]",
 "button[name='remove']",
].join(", ");

/** A leaf whose ENTIRE text is a money amount — a price, not a sentence that mentions one. */
const MONEY_ONLY = /^[^\d]{0,3}[\d,]+(\.\d{2})?\s*[A-Z]{0,3}$/;

function money(cents: number, currency: string | null): string {
 try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format((cents || 0) / 100); }
 catch { return `$${((cents || 0) / 100).toFixed(2)}`; }
}

/** Walk a child-index path back down to the element it describes. */
function at($: cheerio.CheerioAPI, root: DomEl, path: number[]): cheerio.Cheerio<DomEl> | null {
 let $cur = $(root);
 for (const i of path) {
  const $next = $cur.children().eq(i);
  if (!$next.length) return null;
  $cur = $next as cheerio.Cheerio<DomEl>;
 }
 return $cur as cheerio.Cheerio<DomEl>;
}

/** Write one value into one slot. Text is set with .text(), which escapes — a seller-controlled
 *  title can never become live markup. */
function fill($: cheerio.CheerioAPI, root: DomEl, slot: Slot | undefined, value: string | null): void {
 if (!slot) return;
 const $el = at($, root, slot.path);
 if (!$el) return;
 if (slot.kind === "text") { $el.text(value ?? ""); return; }
 if (!slot.attr) return;
 if (value == null) { $el.remove(); return; } // no image for this line — drop it, don't show the template's
 $el.attr(slot.attr, value);
 if (slot.attr === "src") $el.removeAttr("srcset").removeAttr("data-srcset").removeAttr("sizes");
}

/**
 * The theme's own cart lines, one per item in the visitor's bag.
 *
 * Everything not covered by a slot is left exactly as the theme wrote it, so its CSS, spacing and
 * column layout survive — that is the whole reason for cloning rather than building markup.
 */
export function renderCartRows(template: CartTemplate, lines: CartPageLine[]): string {
 if (!template?.rowHtml || !lines.length) return "";

 return lines.map((line) => {
  const $ = cheerio.load(template.rowHtml, null, false);
  const root = $.root().children().get(0) as DomEl | undefined;
  if (!root) return "";

  // A row carries nothing of its own: no stray scripts, no id that would now be duplicated.
  $(root).find("style, link, script").remove();
  $(root).removeAttr("id");
  $(root).find("[id]").removeAttr("id");

  const priceText = money(line.priceCents, line.currency);
  fill($, root, template.slots.title, line.title);
  fill($, root, template.slots.price, priceText);
  fill($, root, template.slots.image, line.image);
  fill($, root, template.slots.href, line.href);

  // Every OTHER money string in the row is this line's price too. Themes commonly print a unit
  // price AND a line total; the derived slot is only one of them, so without this the row rendered
  // "£600.00 … £155.00" — the real price beside the template's, which is worse than either alone.
  // Safe because VYA stock is one-of-one: quantity is always 1, so unit and total are equal.
  for (const el of $(root).find("*").toArray()) {
   const $el = $(el);
   if ($el.children().length) continue; // leaves only, or a wrapper's whole text gets replaced
   const t = ($el.text() || "").trim();
   if (!t || t === priceText) continue;
   if (!MONEY_ONLY.test(t)) continue;
   $el.text(priceText);
  }

  // Fields that described the template's product and have no counterpart here — a vendor, a SKU,
  // a variant label. Dropped, because the alternative is every line claiming to be a Prada.
  for (const path of template.stalePaths || []) {
   const $el = at($, root, path);
   if ($el) $el.remove();
  }

  // Every OTHER link in the row points at the template's product, not this one.
  $(root).find("a[href]").attr("href", line.href);
  // …and so does every alt text. Left alone, a screen reader announces the template's product on
  // every line, and the template's title leaks into the page as searchable text.
  $(root).find("img").attr("alt", line.title);

  // Variant/option lines describe the template's product and cannot be restated for this one.
  $(root).find("[class*='product-option'], [class*='product_option'], [class*='variant-option']").remove();

  // One-of-one stock: a stepper offers a second copy of a unique piece.
  $(root).find("[class*='quantity'] input, quantity-input input").attr("value", "1").attr("readonly", "readonly").attr("min", "1").attr("max", "1");
  $(root).find("[class*='quantity__button'], [name='minus'], [name='plus']").remove();

  // The remove control, addressed by VYA item id rather than by line position — a position is only
  // meaningful against a particular render of the bag, and goes stale the moment anything changes.
  //
  // Recognising the theme's OWN control matters as much as wiring it: themes label it with an icon
  // and no text (Horizon uses a trash glyph), and when that went unrecognised we appended a second,
  // text-labelled "Remove" of our own — so every line carried two.
  // .first(): the selector is deliberately broad, and a row can contain several elements that look
  // like a remove control (a wrapper, the button, an inner icon). Wiring all of them put six remove
  // handles on one line.
  const $remove = $(root).find(REMOVE_CONTROL).first();
  if ($remove.length) $remove.attr("data-vya-cart-remove", line.id).removeAttr("href").removeAttr("name");
  else $(root).find("a[href]").last().after(`<button type="button" data-vya-cart-remove="${line.id}" class="cart-remove-button">Remove</button>`);

  return $.html();
 }).join("");
}
