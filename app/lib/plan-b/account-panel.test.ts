import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { injectAccountPanel } from "./account-panel.ts";

test("a store with a person icon gets the panel", () => {
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const $ = cheerio.load(injectAccountPanel(html, { signedInAs: null, shopName: "Blummier" }));
 assert.equal($("#vya-account-panel").length, 1);
 assert.equal($("[data-vya-account-open]").length, 1, "and the icon is bound to it");
});

test("a store with no account control of its own still gets a sign-in", () => {
 // Six stores never had a person icon — three of them are not on Shopify at all. They used to be
 // left alone, which meant their shoppers simply could not have an account. They get ours instead:
 // the panel goes in, and the browser adds an icon beside the bag because nothing of hers exists.
 const html = `<html><body><header><a href="/about">About</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "Montrose" });
 assert.equal(cheerio.load(out)("#vya-account-panel").length, 1);
 assert.match(out, /vya-account-fallback/);
 assert.match(out, /Montrose/);
});

test("the corner button does not land on top of the bag pill", () => {
 // On a store with no cart control either, both of our own controls float in the same corner. The
 // pill is measured and the account button sits above it rather than across it.
 const html = `<html><body><header><a href="/about">About</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /vya-cart-btn/, "the pill is looked for");
 assert.match(out, /innerHeight-/, "and its position is measured, not assumed");
});

test("a signed-out shopper is asked for an email", () => {
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const $ = cheerio.load(injectAccountPanel(html, { signedInAs: null, shopName: "Blummier" }));
 assert.equal($("#vya-account-email").length, 1);
 assert.equal($("[data-vya-signout]").length, 0);
});

test("a signed-in shopper sees who they are and can sign out", () => {
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const $ = cheerio.load(injectAccountPanel(html, { signedInAs: "buyer@example.com", shopName: "Blummier" }));
 assert.match($("#vya-account-panel").text(), /buyer@example\.com/);
 assert.equal($("[data-vya-signout]").length, 1);
 assert.equal($("#vya-account-email").length, 0, "not asked to sign in again");
});

test("the panel says which shop it signs you in to, and that it is only that shop", () => {
 // The whole model in one sentence a shopper reads. Signing in here does not join a marketplace.
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "Blummier" });
 assert.match(out, /Blummier/);
 assert.match(out, /only|just this shop|this shop/i);
});

test("the shop name is escaped, never written into the page raw", () => {
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: `</script><img src=x onerror=alert(1)>` });
 assert.doesNotMatch(out, /<img src=x onerror/);
});

test("an email address is escaped too", () => {
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: `<img src=x onerror=alert(1)>@x.com`, shopName: "X" });
 assert.doesNotMatch(out, /<img src=x onerror/);
});

test("injecting twice does not stack two panels", () => {
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const once = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 const twice = injectAccountPanel(once, { signedInAs: null, shopName: "X" });
 assert.equal(cheerio.load(twice)("#vya-account-panel").length, 1);
});

test("a signed-in shopper's panel has somewhere to show her orders", () => {
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: "buyer@example.com", shopName: "Blummier" });
 assert.equal(cheerio.load(out)("#vya-account-orders").length, 1);
 assert.match(out, /\/api\/storefront\/account\/orders/);
});

test("a signed-out panel does not ask for orders", () => {
 // There is nobody to ask about, and the request would land on every page load of every store.
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "Blummier" });
 assert.equal(cheerio.load(out)("#vya-account-orders").length, 0);
});

test("the page's own <body> attributes survive", () => {
 // Found in a browser, not in a test: parsing the page as a FRAGMENT threw away the body tag and
 // with it `data-vya-has-cart-control`, the marker that hides our floating bag pill. Every store
 // went back to showing two bags. Anything that re-parses a whole page must hand it back whole.
 const html = `<html><head></head><body data-vya-has-cart-control="1" class="template-index"><a href="/account">Log in</a></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /<body[^>]*data-vya-has-cart-control/);
 assert.match(out, /<body[^>]*class="template-index"/);
});

test("the <head> is not thrown away either", () => {
 const html = `<html><head><title>Blummier</title><link rel="stylesheet" href="/t.css"></head><body><a href="/account">Log in</a></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /<title>Blummier<\/title>/);
 assert.match(out, /<link rel="stylesheet" href="\/t\.css">/);
});

test("a store whose only account link a shopper can't reach gets one of ours", () => {
 // Three stores keep their only account link inside the mobile menu drawer or the empty-cart
 // panel — bound correctly, and invisible to anyone on a desktop. Binding a control nobody can
 // click is the same as having no sign-in at all. Whether it is reachable can only be answered in
 // the browser, so the page asks itself on load. See the fallback in the injected script.
 const html = `<html><body><header><a class="medium-hide" href="/account">Log in</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "Awoke" });
 assert.match(out, /vya-account-fallback/);
 assert.match(out, /getBoundingClientRect/, "reachability is measured, not guessed from class names");
 assert.match(out, /elementFromPoint/, "and what is at those coordinates must be the link itself");
});

test("the fallback icon is labelled, not a bare glyph", () => {
 const html = `<html><body><header><a href="/account">Log in</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /setAttribute\("aria-label","Account"\)/);
 assert.match(out, /aria-hidden="true"/, "the glyph itself is decorative — the label carries the meaning");
});



test("the corner button stacks above anything else of ours pinned in that corner", () => {
 // The first version put it directly on top of the "Powered by VYA" badge. Both are ours, so
 // there was no excuse for them overlapping. Whether something is pinned is read, not assumed:
 // that badge now lives in the footer and must not push this button up the page.
 const html = `<html><body><header><a href="/about">About</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /getComputedStyle\(el\)\.position==="fixed"/, "only pinned things count");
 assert.match(out, /vya-cart-btn/, "the bag pill is measured");
});


test("our icon always goes in the same corner, never into her header", () => {
 // Three rounds of trying to slot it beside her bag ended with it next to a person-shaped icon the
 // seller already had — one pointing at /favorites — so a shopper saw two identical glyphs. We
 // cannot know what her other icons mean; guessing wrong in her header is worse than being plain.
 const html = `<html><body><header><a href="/about">About</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /position:fixed;right:20px/);
 assert.doesNotMatch(out, /insertBefore\(a/, "nothing of ours is threaded into her markup");
});

test("the corner button moves out from under whatever else is parked in that corner", () => {
 // thenicheshop runs a chat widget bottom-right, which loaded after us and covered our button
 // completely. Ours is the newcomer in someone else's corner, so ours is the one that moves.
 const html = `<html><body><header><a href="/about">About</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /function clear\(a\)/, "the placed button is re-measured against what covers it");
 assert.match(out, /a\.style\.left="20px"/, "and can end up on the other side if the corner is full");
});

test("a widget that loads late still gets out of our way", () => {
 // Chat widgets and cookie bars arrive seconds after load. Measuring once at load is measuring
 // the wrong page.
 const html = `<html><body><header><a href="/about">About</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /setTimeout\(refresh/);
});

test("the page binds her account control in the browser too, not only on the server", () => {
 // Three stores build their header in JavaScript AFTER the page loads — Shopify's newer themes
 // create <button class="account-button" aria-label="Account"> at runtime — so the server never
 // sees it, hers stays unbound, and the shopper gets her person icon AND our corner button.
 const html = `<html><body><header><a href="/about">About</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /function bindLate/);
 assert.match(out, /aria-label\*=\\"account\\" i/i, "using the same selector list the server uses");
 assert.match(out, /removeAttribute\("href"\)/, "her link's destination goes, exactly as on the server");
});

test("logout is never bound in the browser either", () => {
 const html = `<html><body><header><a href="/about">About</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /logout\|log out\|sign out\|signout/);
});

test("the page keeps watching, because a fixed schedule is still a guess", () => {
 // A theme that builds its header on hydration, a menu that opens, a banner that closes — each
 // changes whether a shopper can reach her account link, and each is a DOM change.
 const html = `<html><body><header><a href="/about">About</a></header></body></html>`;
 const out = injectAccountPanel(html, { signedInAs: null, shopName: "X" });
 assert.match(out, /MutationObserver/);
 assert.match(out, /if\(pending\)return/, "debounced — a busy page costs one pass, not hundreds");
});
