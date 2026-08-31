import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { bindAccountControls, hasAccountControl } from "./account-control.ts";

// 20 of 23 hosted stores carry a person icon in their header — a link to /account, a
// customer_login form, or an icon classed for it. Binding to the control a shopper already reaches
// for beats bolting our own button onto their header, exactly as with the cart icon.

test("a Shopify account link is found and bound", () => {
 const html = `<header><a href="/account" class="header__icon header__icon--account">Log in</a></header>`;
 const $ = cheerio.load(bindAccountControls(html));
 assert.equal($("a").attr("data-vya-account-open"), "1");
 assert.notEqual($("a").attr("href"), "/account", "it must not navigate to the platform's own login");
});

test("the newer customer-accounts link is found too", () => {
 // Shopify's newer accounts send shoppers to a customer_authentication URL on a different host.
 const html = `<header><a href="https://shopify.com/123/account?locale=en">Account</a></header>`;
 assert.equal(hasAccountControl(html), true);
});

test("a login form counts as an account control", () => {
 assert.equal(hasAccountControl(`<div id="customer_login"><form>…</form></div>`), true);
});

test("an icon labelled for accounts is found even without a useful href", () => {
 assert.equal(hasAccountControl(`<header><button aria-label="Log in"></button></header>`), true);
 assert.equal(hasAccountControl(`<header><a class="icon-account" href="#"></a></header>`), true);
});

test("a store with no account control anywhere is left alone", () => {
 // lei-vintage, montrose-edit and vintage-boutique-style — the same three that are not on Shopify.
 const html = `<header><a href="/about">About</a></header>`;
 assert.equal(hasAccountControl(html), false);
 assert.equal(bindAccountControls(html), html, "untouched, byte for byte");
});

test("every account control is bound, not just the first", () => {
 const html = `<header><a href="/account" class="desk">Account</a><a href="/account" class="mob">Account</a></header>`;
 assert.equal(cheerio.load(bindAccountControls(html))("[data-vya-account-open]").length, 2);
});

test("a cart control is never mistaken for an account control", () => {
 // Both live in the header and both are icons; binding the wrong one would send a shopper to sign in
 // when they meant to open their bag.
 assert.equal(hasAccountControl(`<header><a href="/cart" aria-label="Cart"></a></header>`), false);
 assert.equal(hasAccountControl(`<header><a href="/account/logout">Log out</a></header>`), false, "logging out is not signing in");
});

test("binding twice is the same as binding once", () => {
 const html = `<header><a href="/account" style="color:red">Account</a></header>`;
 assert.equal(bindAccountControls(bindAccountControls(html)), bindAccountControls(html));
});

test("a signed-in shopper's control says so", () => {
 const html = `<header><a href="/account" aria-label="Log in">Log in</a></header>`;
 const $ = cheerio.load(bindAccountControls(html, { signedInAs: "buyer@example.com" }));
 assert.equal($("a").attr("data-vya-account-signed-in"), "1");
 assert.match($("a").attr("aria-label") || "", /account/i);
});

test("Shopify's account web component counts as her account control", () => {
 // lamash's person icon is not in the page at all: it is inside <shopify-account>'s shadow DOM,
 // where no selector reaches it. The HOST is bindable though, and a click inside a shadow root is
 // retargeted to the host on the way out — so binding the host catches the click and our window
 // capture stops it before the component's own handler ever runs.
 const html = `<html><body><header><shopify-account></shopify-account></header></body></html>`;
 const $ = cheerio.load(bindAccountControls(html, {}));
 assert.equal($("shopify-account[data-vya-account-open]").length, 1);
});

test("a theme's account BUTTON is caught by its class as well as its label", () => {
 // Two stores build <button class="account-button"> at runtime. The label is usually there too,
 // but a theme that ships one without the other should not fall through the gap.
 const html = `<html><body><header><button class="account-button header-actions__action"></button></header></body></html>`;
 assert.equal(cheerio.load(bindAccountControls(html, {}))("button[data-vya-account-open]").length, 1);
});
