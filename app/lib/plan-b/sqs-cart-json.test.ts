import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSqsCart, toSqsEntry, itemIdFromAddBody, NO_CART_MESSAGE } from "./sqs-cart-json.ts";
import type { CartLineItem } from "./cart-json.ts";

const LINES: CartLineItem[] = [
 { id: "11111111-1111-4111-8111-111111111111", title: "Fendi Beaded Baguette", priceCents: 437_00, currency: "USD", image: "https://x/1.jpg", handle: "beaded-fendi-baguette", sourceVariantId: "SQ0739223", available: true },
 { id: "22222222-2222-4222-8222-222222222222", title: "Chloé Marcie", priceCents: 550_00, currency: "USD", image: null, handle: null, sourceVariantId: null, available: true },
];

test("the cart carries the two fields Squarespace's header pill syncs from", () => {
 // `TemplateCart.syncAll({items: totalQuantity, subtotal: subtotalAmount})` — and subtotalAmount is
 // derived from subtotalCents. Get either wrong and the pill shows the wrong bag.
 const cart = buildSqsCart(LINES, "tok", 1_700_000_000_000);
 assert.equal(cart.totalQuantity, 2);
 assert.equal(cart.subtotalCents, 98_700);
 // Cents, as an INTEGER — their formatter divides by 100 itself, so "987.00" would render as $9.87.
 assert.equal(typeof cart.subtotalCents, "number");
 assert.equal(cart.grandTotalCents, 98_700, "VYA charges tax and shipping at checkout, not here");
 assert.equal(cart.id, "tok");
 assert.equal(cart.isPurchased, false);
});

test("the added-to-cart mini-cart gets a price it can print", () => {
 // Its own code: `Gp(successData.subTotal, successData.item?.price?.currency)`, and Gp divides by
 // 100. A cart entry that spelled it `subtotalCents` — the spelling the cart TOTALS use — showed
 // the shopper the right piece at $0.00.
 const [entry] = buildSqsCart([LINES[0]], "tok").entries;
 assert.equal(entry.subTotal, 43_700, "minor units, under the name the mini-cart reads");
 assert.equal(entry.item.price.currency, "USD", "…and the currency it formats that with");
 assert.equal(entry.productName, "Fendi Beaded Baguette", "the name it prints, before falling back to `title`");
});

test("nothing promises the shopper a reservation VYA doesn't hold", () => {
 // Squarespace mounts a live countdown for any future `expiresAt`. VYA reserves a piece at
 // checkout, not at add-to-cart, so there is no window to count down.
 const cart = buildSqsCart(LINES, "tok", 1_700_000_000_000);
 assert.ok(cart.expiresAt <= cart.created, "an expiry in the past keeps the banner unmounted");
});

test("an entry is addressable the way the product page tests for it", () => {
 // `hasEntry(itemId, variant)` compares `entries[].itemId` and `entries[].chosenVariant.sku`.
 const [entry] = buildSqsCart([LINES[0]], "tok").entries;
 assert.equal(entry.itemId, LINES[0].id, "the id the page will post back is the VYA item id");
 assert.equal(entry.chosenVariant.sku, "SQ0739223");
 assert.equal(entry.quantity, 1, "one-of-one inventory is never more than one of anything");
 assert.equal(entry.chosenVariant.qtyInStock, 1);
 assert.equal(entry.chosenVariant.price.value, "437.00", "Squarespace money is a two-decimal string");
 assert.equal(entry.chosenVariant.price.currency, "USD");
 assert.equal(entry.subtotalCents, 43_700);
});

test("a piece that has sold says so on its variant", () => {
 const entry = toSqsEntry({ ...LINES[0], available: false });
 assert.equal(entry.chosenVariant.soldOut, true);
});

test("an empty cart is empty, not a cart with nothing in it", () => {
 const cart = buildSqsCart([], "tok");
 assert.deepEqual(cart.entries, []);
 assert.equal(cart.totalQuantity, 0);
 assert.equal(cart.subtotalCents, 0);
 // The route answers a visitor with no cart the way Squarespace does — 404 with this exact message,
 // which its own bundle reads as "empty" rather than as a failure.
 assert.equal(NO_CART_MESSAGE, "You have no shopping cart yet.");
});

test("the posted item id is read whichever name it arrives under", () => {
 assert.equal(itemIdFromAddBody({ itemId: " 6a320d27 ", sku: "SQ1", quantity: 1 }), "6a320d27");
 assert.equal(itemIdFromAddBody({ item_id: "abc" }), "abc");
 assert.equal(itemIdFromAddBody({ id: 42 }), "42");
 assert.equal(itemIdFromAddBody({}), "", "nothing to add is not the same as adding nothing");
});

test("orderId, selectedShippingOption and shippingLocation are OMITTED, never sent as null", () => {
 // The real ShoppingCart model declares these with a validator (isString / isObject / isObject) and
 // no fallback value. YUI's Model.setAttrs() validates the whole incoming object before applying any
 // of it, so `null` here — which fails every one of those validators — silently threw out the ENTIRE
 // update, including a correct, non-empty `entries` array. Confirmed against the real bundle and by
 // reproducing it end to end: a real cart with a real item still rendered as "nothing in your cart"
 // until these were omitted instead of nulled. Omitting the key means its setter is never called, so
 // there is nothing left that can fail validation.
 const cart = buildSqsCart(LINES, "tok");
 assert.equal("orderId" in cart, false);
 assert.equal("selectedShippingOption" in cart, false);
 assert.equal("shippingLocation" in cart, false);
 // And the object must actually SERIALIZE that way — a `key: undefined` would still fail the model's
 // validator once JSON round-trips it, since `JSON.parse(JSON.stringify(undefined))` here is what a
 // fetch() response body actually carries, not the in-memory object.
 const json = JSON.parse(JSON.stringify(cart));
 assert.equal("orderId" in json, false);
 assert.equal("selectedShippingOption" in json, false);
 assert.equal("shippingLocation" in json, false);
});
