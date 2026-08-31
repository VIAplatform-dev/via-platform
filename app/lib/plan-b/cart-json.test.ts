import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCart, toCartLine, variantIdFromAddBody, buildSuggest, type CartLineItem } from "./cart-json.ts";

// The contract with the seller's own theme JavaScript. These field names and units are not ours to
// choose — a theme reads them directly, so getting one wrong shows up as a broken cart drawer.

const item = (over: Partial<CartLineItem> = {}): CartLineItem => ({
 id: "itm_1", title: "1990s Silk Slip Dress", priceCents: 18000, currency: "GBP",
 image: "https://cdn/1.jpg", handle: "silk-slip", sourceVariantId: "4412", ...over,
});

test("money stays an INTEGER IN CENTS, as Shopify themes expect", () => {
 // Themes divide by 100 themselves. Returning a formatted "180.00" renders as £1.80.
 const l = toCartLine(item());
 assert.equal(l.price, 18000);
 assert.equal(l.line_price, 18000);
 assert.equal(l.final_line_price, 18000);
 assert.equal(typeof l.price, "number");
});

test("the imported variant id is the bridge back to the theme", () => {
 const l = toCartLine(item());
 assert.equal(l.variant_id, "4412", "their button posts this id; it must round-trip");
 assert.equal(l.product_id, "itm_1");
});

test("one-of-one stock declares a single default variant", () => {
 // Otherwise a theme renders a quantity stepper and can ask for two of a piece that exists once.
 const l = toCartLine(item());
 assert.equal(l.product_has_only_default_variant, true);
 assert.equal(l.quantity, 1);
 assert.deepEqual(l.options_with_values, []);
});

test("cart totals and count come from the lines", () => {
 const c = buildCart([item(), item({ id: "itm_2", priceCents: 9500 })], "tok");
 assert.equal(c.item_count, 2);
 assert.equal(c.total_price, 27500);
 assert.equal(c.items_subtotal_price, 27500);
 assert.equal(c.currency, "GBP", "currency comes from the items, never a guess");
});

test("an empty cart is valid and requires no shipping", () => {
 const c = buildCart([], "tok");
 assert.equal(c.item_count, 0);
 assert.equal(c.total_price, 0);
 assert.equal(c.requires_shipping, false);
 assert.deepEqual(c.items, []);
});

test("the line key is stable, so change/remove needs no lookup table", () => {
 assert.equal(toCartLine(item()).key, "itm_1");
});

// ── Add-to-cart request parsing ─────────────────────────────────────────────────────────────────

test("reads the variant id from every shape themes actually send", () => {
 // All three are common across the corpus; missing one looks like a dead Add-to-cart button.
 assert.equal(variantIdFromAddBody({ id: "4412", quantity: "1" }), "4412", "classic form POST");
 assert.equal(variantIdFromAddBody({ id: 4412 }), "4412", "JSON body, numeric id");
 assert.equal(variantIdFromAddBody({ items: [{ id: 4412, quantity: 1 }] }), "4412", "bulk shape");
 assert.equal(variantIdFromAddBody({ variant_id: "77" }), "77");
});

test("a request with no variant id is rejected, not guessed", () => {
 assert.equal(variantIdFromAddBody({}), null);
 assert.equal(variantIdFromAddBody(null), null);
 assert.equal(variantIdFromAddBody({ items: [] }), null);
 assert.equal(variantIdFromAddBody({ id: "  " }), null);
});

test("predictive search returns the shape the theme's search box reads", () => {
 const s = buildSuggest("dress", [item()]);
 assert.equal(s.query, "dress");
 assert.equal(s.resources.results.products.length, 1);
 assert.equal(s.resources.results.products[0].url, "/products/silk-slip");
 assert.equal(s.resources.results.products[0].price, 18000);
});
