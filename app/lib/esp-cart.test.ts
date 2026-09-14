import { test } from "node:test";
import assert from "node:assert/strict";
import { bagToCart, cartId } from "./esp-cart.ts";

const lines = [
 { id: "i1", priceCents: 40000, currency: "GBP", available: true },
 { id: "i2", priceCents: 12500, currency: "GBP", available: true },
];

test("a signed-in shopper's bag becomes a cart her store's email tool can act on", () => {
 const c = bagToCart("blummier", "Ada@Example.com ", lines, { name: "Ada" });
 assert.equal(c?.customer.email, "ada@example.com");
 assert.equal(c?.customer.name, "Ada");
 assert.equal(c?.totalCents, 52500);
 assert.equal(c?.currency, "GBP");
 assert.equal(c?.lines.length, 2);
 assert.equal(c?.lines[0].quantity, 1);
});

test("a bag with nobody attached is not a cart", () => {
 // The bag is a cookie. Until she signs in to the store there is no one to email, and inventing an
 // identity to fill the field is how a flow sends to nobody.
 assert.equal(bagToCart("blummier", null, lines), null);
 assert.equal(bagToCart("blummier", "", lines), null);
 assert.equal(bagToCart("blummier", "not-an-email", lines), null);
});

test("pieces that have gone are dropped, and an empty bag sends nothing", () => {
 // On one-of-one stock the bag routinely holds something that sold while she was deciding. "Come
 // back for this" about a piece that is gone is the worst email a vintage shop can send.
 const c = bagToCart("blummier", "a@b.com", [...lines, { id: "i3", priceCents: 9900, available: false }]);
 assert.deepEqual(c?.lines.map((l) => l.id), ["i1", "i2"]);
 assert.equal(bagToCart("blummier", "a@b.com", [{ id: "x", priceCents: 1, available: false }]), null);
 assert.equal(bagToCart("blummier", "a@b.com", []), null);
 assert.equal(bagToCart("blummier", "a@b.com", null as never), null);
});

test("one cart per shopper per store, however often the cookie rotates", () => {
 // Four "you left something behind" emails for one jacket is worse than none.
 assert.equal(cartId("blummier", "Ada@Example.com"), cartId("blummier", "ada@example.com"));
 assert.notEqual(cartId("blummier", "a@b.com"), cartId("other-shop", "a@b.com"));
 assert.equal(bagToCart("blummier", "a@b.com", lines)?.id, bagToCart("blummier", "A@B.com", lines.slice(0, 1))?.id);
});

test("a cart is not consent to market", () => {
 // Subscription belongs to the contact record. Having a bag is not agreeing to hear from anyone.
 assert.equal(bagToCart("blummier", "a@b.com", lines)?.customer.subscribed, false);
 assert.equal(bagToCart("blummier", "a@b.com", lines, { subscribed: true })?.customer.subscribed, true);
});

test("an id is safe to put in a URL path", () => {
 assert.match(cartId("blummier", "a+tag@b.com"), /^[a-z0-9_.@-]+$/);
 assert.ok(cartId("x".repeat(80), "y".repeat(80) + "@b.com").length <= 100);
});
