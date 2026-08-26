import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKnownCartSections, buildFallbackSection } from "./cart-sections.ts";

const LINE = { title: "Chanel Flap Bag", image: "https://x/img.jpg", priceCents: 550000, currency: "USD" };

test("builds all three sections Dawn's cart-notification.js asks for", () => {
 const out = buildKnownCartSections(["cart-notification-product", "cart-notification-button", "cart-icon-bubble"], LINE, "abc-123", 2);
 assert.equal(Object.keys(out).length, 3);
});

test("cart-notification-product carries the id the theme's selector needs, plus the item's own data", () => {
 const out = buildKnownCartSections(["cart-notification-product"], LINE, "abc-123", 1);
 // getSectionsToRender()'s selector is `[id="cart-notification-product-${key}"]` — must be present verbatim.
 assert.match(out["cart-notification-product"], /id="cart-notification-product-abc-123"/);
 assert.match(out["cart-notification-product"], /Chanel Flap Bag/);
 assert.match(out["cart-notification-product"], /\$5,500\.00/);
 assert.match(out["cart-notification-product"], /src="https:\/\/x\/img\.jpg"/);
});

test("cart-notification-button and cart-icon-bubble reflect the running cart count", () => {
 const out = buildKnownCartSections(["cart-notification-button", "cart-icon-bubble"], LINE, "k", 3);
 assert.match(out["cart-notification-button"], /View cart \(3\)/);
 assert.match(out["cart-icon-bubble"], />3</);
 assert.match(out["cart-icon-bubble"], /3 items/); // plural
});

test("singular item count reads naturally", () => {
 const out = buildKnownCartSections(["cart-icon-bubble"], LINE, "k", 1);
 assert.match(out["cart-icon-bubble"], /1 item</); // not "1 items"
});

test("cart-icon-bubble keeps the cart icon's own <svg> — this REPLACES the header link's entire innerHTML, so building the bubble alone throws the icon itself away, leaving a floating count next to nothing", () => {
 const icon = `<span class="svg-wrapper"><svg class="icon icon-cart-empty"></svg></span><span class="visually-hidden">Cart</span>`;
 const out = buildKnownCartSections(["cart-icon-bubble"], LINE, "k", 2, icon);
 assert.match(out["cart-icon-bubble"], /icon-cart-empty/);
 assert.match(out["cart-icon-bubble"], /cart-count-bubble/);
});

test("cart-icon-bubble with no icon markup supplied still renders the count, not nothing", () => {
 const out = buildKnownCartSections(["cart-icon-bubble"], LINE, "k", 2);
 assert.match(out["cart-icon-bubble"], /cart-count-bubble/);
});

test("re-adding doesn't stack a second count bubble behind the icon", () => {
 const iconWithStaleBubble = `<span class="svg-wrapper"><svg class="icon"></svg></span><div class="cart-count-bubble"><span aria-hidden="true">1</span></div>`;
 const out = buildKnownCartSections(["cart-icon-bubble"], LINE, "k", 2, iconWithStaleBubble);
 assert.equal((out["cart-icon-bubble"].match(/cart-count-bubble/g) || []).length, 1);
 assert.match(out["cart-icon-bubble"], />2</);
});

test("a product with no image renders without a broken <img>", () => {
 const out = buildKnownCartSections(["cart-notification-product"], { ...LINE, image: null }, "k", 1);
 assert.ok(!out["cart-notification-product"].includes("<img"));
});

test("title and price are HTML-escaped — a store could name an item anything", () => {
 const out = buildKnownCartSections(["cart-notification-product"], { ...LINE, title: `<script>alert(1)</script>` }, "k", 1);
 assert.ok(!out["cart-notification-product"].includes("<script>"));
 assert.match(out["cart-notification-product"], /&lt;script&gt;/);
});

test("an id this module doesn't specifically know is simply omitted, not guessed at", () => {
 const out = buildKnownCartSections(["cart-drawer"], LINE, "k", 1);
 assert.equal(out["cart-drawer"], undefined);
});

test("the fallback wraps existing markup in the .shopify-section default selector expects — a no-op update, not a crash", () => {
 const out = buildFallbackSection(`<span>already here</span>`);
 assert.match(out, /class="shopify-section"/);
 assert.match(out, /<span>already here<\/span>/);
});
