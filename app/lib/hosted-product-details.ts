/**
 * Drop the details block (hosted-product-details-core.ts) into a captured product page.
 *
 * Where it goes follows where the commerce rewiring already works: rewireCommerce finds the theme's
 * `form[action*="/cart"]` and swaps its submit for VYA's controls (`data-vya-add`, `data-vya-proto`,
 * the `/checkout?item=` link); applyCartState hangs its notice off `[name="add"]`. The block lands
 * right after that form — where a theme prints its own accordions — so a shopper reads the price,
 * the button, then the facts. A page with no buy form (a sold capture) gets it after the price
 * block; one with neither, inside the product's own container; failing all of that, at the end of
 * the body. It never fails the page: no anchor is a placement problem, not an error.
 *
 * Idempotent: the same page served twice carries one block, and the newer one — a flaw the seller
 * added since the last request is what prints.
 */
import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

// VYA's own buy controls, and the theme's, in the order rewireCommerce/applyCartState reach for them.
const BUY_CONTROL = '[data-vya-add], [data-vya-secondary], [data-vya-proto], a[href*="/checkout?item="], [data-vya-cart-note], form[action*="/cart"] [name="add"], [name="add"], [class*="product-form__submit"]';
// The price, marked by markPriceSlots when it has been, else by the names themes give it.
const PRICE = "[data-vya-price], [class*='price-item'], [class*='price__regular'], [class*='product__price'], .price";
// The product's own text column.
const PRODUCT_INFO = "[class*='product__info'], [class*='product-single__meta'], [class*='product__details'], [class*='product-info'], [class*='product-details'], .product, main";

export function injectHostedDetails(html: string, block: string): string {
 const has = /data-vya-details/.test(html);
 if (!block && !has) return html; // nothing to add, nothing to take off — do not reserialise
 const $ = cheerio.load(html);
 const existing = $("[data-vya-details]");
 if (!block) { existing.remove(); return $.html(); }
 if (existing.length) { existing.first().replaceWith(block); existing.slice(1).remove(); return $.html(); }

 const control = $(BUY_CONTROL).last();
 if (control.length) {
  const form = control.closest("form");
  if (form.length) form.first().after(block);
  else {
   // No form around it (a theme that renders its button bare): after the buttons' own row when the
   // parent is one, else after the control itself.
   const parent = control.parent();
   const cls = parent.attr("class") || "";
   if (parent.length && /button|product-form|buy|purchase|add-to-cart/i.test(cls)) parent.after(block);
   else control.after(block);
  }
  return $.html();
 }

 const price = $(PRICE).first();
 if (price.length) {
  // The whole price wrapper, not the span inside it: climb while the parent is still "price".
  let el = price;
  for (;;) {
   const parent = el.parent();
   if (!parent.length || !/price/i.test(parent.attr("class") || "")) break;
   el = parent;
  }
  (el as cheerio.Cheerio<DomElement>).after(block);
  return $.html();
 }

 const info = $(PRODUCT_INFO).first();
 if (info.length) { info.append(block); return $.html(); }
 $("body").append(block);
 return $.html();
}
