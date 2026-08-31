import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { suppressThemeCart, THEME_CART_SELECTORS } from "./suppress-theme-cart.ts";

const has = (sel: string) => THEME_CART_SELECTORS.some((s) => s.startsWith(sel));

// Shopify — the family this started with.
test("hides Shopify's cart drawer and notification", () => {
 for (const s of ["#CartDrawer", "cart-drawer", "cart-drawer-component", ".cart-notification"]) {
  assert.ok(has(s), `${s} should be suppressed`);
 }
});

// Squarespace — found live on lei-vintage and montrose-edit, where BOTH carts opened at once
// because the suppression list only knew Shopify's names.
test("hides Squarespace's cart too", () => {
 for (const s of [".sqs-custom-cart", ".Cart-inner", ".sqs-cart-dropdown", ".commerce-mini-cart-root"]) {
  assert.ok(has(s), `${s} should be suppressed`);
 }
});

// The shopper still needs something to press. Squarespace's icon links to /cart, which VYA's cart
// script intercepts — hiding it would leave no way to open the bag at all.
test("never hides the cart ICON, only the panel it opens", () => {
 for (const s of THEME_CART_SELECTORS) {
  assert.ok(!/header-actions-action--cart|icon--cart|cart-icon-bubble|\.cart-quantity/.test(s),
   `${s} would hide the control a shopper clicks`);
 }
});

test("never hides VYA's own cart", () => {
 const out = suppressThemeCart(`<html><head></head><body><div id="vya-cart-drawer"></div></body></html>`);
 const css = cheerio.load(out)("style[data-vya-suppress-theme-cart]").html() || "";
 for (const sel of THEME_CART_SELECTORS) assert.match(sel, /:not\(#vya-cart-drawer\)/);
 assert.match(css, /#vya-cart-drawer[^{]*\{[^}]*visible/);
});

test("injects into head so the rules outrank the theme's stylesheet", () => {
 const out = suppressThemeCart(`<html><head><title>x</title></head><body></body></html>`);
 assert.match(out, /<style data-vya-suppress-theme-cart[\s\S]*<\/head>/);
});

test("falls back to body, then to appending, when there is no head", () => {
 assert.match(suppressThemeCart(`<html><body><p>x</p></body></html>`), /data-vya-suppress-theme-cart/);
 assert.match(suppressThemeCart(`<p>x</p>`), /data-vya-suppress-theme-cart/);
});

// injectCart's idempotence guard once matched the mere STRING "vya-cart-drawer" in this stylesheet
// and concluded the cart was already on the page, so nothing was injected at all.
test("is applied only once", () => {
 const once = suppressThemeCart(`<html><head></head><body></body></html>`);
 assert.equal(suppressThemeCart(once), once);
 assert.equal((once.match(/data-vya-suppress-theme-cart/g) || []).length, 1);
});

test("survives empty input", () => {
 assert.equal(suppressThemeCart(""), "");
});

test("the rescue rule does not force our pill back on top of the theme's own bag", () => {
 // Found in a real browser on 20 of 23 stores. The rule that keeps a theme's stylesheet from
 // hiding OUR drawer was written to cover the floating pill too — and `!important` beat the rule
 // that hides the pill on stores whose own cart icon we've already bound. Two bags, everywhere.
 const out = suppressThemeCart(`<html><head></head><body data-vya-has-cart-control="1"></body></html>`);
 assert.match(out, /body\[data-vya-has-cart-control\][^{]*#vya-cart-btn\s*\{[^}]*display:\s*none\s*!important/);
});

test("but a store with no cart icon of its own keeps the pill, rescued", () => {
 // The pill is the ONLY way into the bag on those stores, so the theme must not be able to hide it.
 const out = suppressThemeCart(`<html><head></head><body></body></html>`);
 assert.match(out, /body:not\(\[data-vya-has-cart-control\]\)\s*#vya-cart-btn\s*\{[^}]*display:\s*flex\s*!important/);
});
