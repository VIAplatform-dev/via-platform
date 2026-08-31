import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyCartBadge, dawnBubbleHtml } from "./cart-badge.ts";

// Real markup shapes, copied from captured pages in the corpus rather than invented.
const DAWN = `<html><body><header><a href="/cart" class="header__icon header__icon--cart link focus-inset" id="cart-icon-bubble"><span class="svg-wrapper"><svg class="icon icon-cart-empty" viewBox="0 0 40 40"></svg></span><span class="visually-hidden">Cart</span></a></header></body></html>`;

// maison-optimism-vintage's /cart page: the crawler's own session put a "1" in here permanently.
const DAWN_STALE = DAWN
 .replace("icon-cart-empty", "icon-cart")
 .replace("</a>", `<div class="cart-count-bubble"><span aria-hidden="true">1</span><span class="visually-hidden">1 item</span></div></a>`);

const HORIZON = `<html><body><header><cart-drawer-component class="cart-drawer"><button class="button" aria-label="Open cart Total items in cart: 0"><cart-icon class="header-actions__cart-icon"><span class="svg-wrapper"><svg viewBox="0 0 20 20"></svg></span><div ref="cartBubble" class="cart-bubble visually-hidden"><span class="cart-bubble__background"></span><span class="cart-bubble__text" role="status"><span class="visually-hidden">Total items in cart: 0</span><span class="cart-bubble__text-count hidden" aria-hidden="true"> 0</span></span></div></cart-icon></button></cart-drawer-component></header></body></html>`;

const IMPULSE = `<html><body><header><a href="/cart" class="Header__Icon Icon-Wrapper" data-drawer-id="sidebar-cart" aria-label="Open cart"><svg class="Icon Icon--cart"></svg></a></header></body></html>`;

const ALPINE = `<html><body><header><button class="relative" @click.prevent="$store.modals.open('cart')" aria-label="Cart"><span class="sr-only">Cart</span><span x-text="$store.cart_count.count">0</span></button></header></body></html>`;

test("dawn: no bubble at zero, a real one above zero", () => {
 assert.equal(applyCartBadge(DAWN, 0).includes("cart-count-bubble"), false);
 const two = applyCartBadge(DAWN, 2);
 assert.match(two, /cart-count-bubble/);
 assert.match(two, /aria-hidden="true">2</);
 assert.match(two, /2 items/);
 assert.match(two, /icon-cart(?!-empty)/, "the full-bag icon replaces the empty one");
});

test("dawn: a captured page's frozen count is thrown away, not trusted", () => {
 const empty = applyCartBadge(DAWN_STALE, 0);
 assert.equal(empty.includes("cart-count-bubble"), false, "the phantom 1 is gone");
 assert.match(empty, /icon-cart-empty/, "and the icon goes back to empty");
 const three = applyCartBadge(DAWN_STALE, 3);
 assert.equal((three.match(/cart-count-bubble/g) || []).length, 1, "never two bubbles");
 assert.match(three, /aria-hidden="true">3</);
});

test("applying twice is the same as applying once", () => {
 const once = applyCartBadge(DAWN, 2);
 assert.equal(applyCartBadge(once, 2), once);
});

test("horizon: the theme's own hidden bubble is revealed and filled", () => {
 const zero = applyCartBadge(HORIZON, 0);
 assert.match(zero, /class="cart-bubble visually-hidden"/);
 assert.match(zero, /cart-bubble__text-count hidden/);

 const one = applyCartBadge(HORIZON, 1);
 assert.doesNotMatch(one, /class="cart-bubble visually-hidden"/);
 assert.doesNotMatch(one, /cart-bubble__text-count hidden/);
 assert.match(one, /cart-bubble__text-count[^>]*> 1</);
 assert.match(one, /aria-label="Open cart Total items in cart: 1"/);
 assert.doesNotMatch(one, /Total items in cart: 0/, "the screen-reader copy agrees with the badge");
 assert.doesNotMatch(one, /data-vya-cart-badge/, "no second badge on top of the theme's own");
});

test("a theme with no count element of its own gets VYA's badge", () => {
 assert.doesNotMatch(applyCartBadge(IMPULSE, 0), /data-vya-cart-badge/);
 const two = applyCartBadge(IMPULSE, 2);
 assert.match(two, /data-vya-cart-badge/);
 assert.match(two, /position:relative/, "the control is anchored so the badge lands on it");
 assert.equal((two.match(/data-vya-cart-badge/g) || []).length, 1);
 // Re-serving must not stack a second one.
 assert.equal(applyCartBadge(two, 2), two);
});

test("a position the theme set itself is never overwritten", () => {
 // The control also gains `cursor:pointer`, because binding it to our drawer removes its href and
 // an <a> without one loses the pointer. The theme's own position must survive that untouched.
 const fixed = IMPULSE.replace('class="Header__Icon Icon-Wrapper"', 'class="Header__Icon" style="position:absolute;top:0"');
 const out = applyCartBadge(fixed, 1);
 assert.match(out, /style="position:absolute;top:0(;[^"]*)?"/);
 assert.doesNotMatch(out, /position:relative[^"]*position:absolute/, "and is not overridden");
});

test("alpine themes are seeded with the true count", () => {
 assert.match(applyCartBadge(ALPINE, 4), /x-text="\$store\.cart_count\.count">4</);
 assert.doesNotMatch(applyCartBadge(ALPINE, 4), /data-vya-cart-badge/, "their span is the badge");
});

test("only the header's cart control is badged, never the drawer's own close button", () => {
 const withDrawer = IMPULSE.replace("</header>", `</header><div class="Drawer"><button class="Drawer__Close" aria-label="Close cart"></button></div>`);
 const out = applyCartBadge(withDrawer, 1);
 assert.equal((out.match(/data-vya-cart-badge/g) || []).length, 1);
 assert.doesNotMatch(out, /Drawer__Close[^>]*>\s*<span data-vya-cart-badge/);
});

test("a page with no cart control is returned untouched", () => {
 const plain = `<html><body><p>nothing here</p></body></html>`;
 assert.equal(applyCartBadge(plain, 3), plain);
});

test("dawnBubbleHtml is the markup the section API sends back", () => {
 assert.equal(dawnBubbleHtml(1), `<div class="cart-count-bubble"><span aria-hidden="true">1</span><span class="visually-hidden">1 item</span></div>`);
 assert.match(dawnBubbleHtml(2), /2 items/);
});

// Both of these were found by running applyCartBadge against all 16 captured storefronts, not by
// reading the code — each one drew a real, visible second badge in the wrong place.

test("a cart drawer INSIDE the header does not get a badge on its close button", () => {
 // We Thieves: the sidebar cart lives inside <header>, so a header-ancestor test alone let its
 // "Close cart" X through.
 const html = `<html><body><header><a href="/cart" class="Header__Icon" aria-label="Open cart"><svg></svg></a><div class="Drawer" id="sidebar-cart"><button class="Drawer__Close" data-action="close-drawer" aria-label="Close cart"></button></div></header></body></html>`;
 const out = applyCartBadge(html, 2);
 assert.equal((out.match(/data-vya-cart-badge/g) || []).length, 1);
 assert.doesNotMatch(out, /Drawer__Close[^>]*>\s*<span data-vya-cart-badge/);
});

test("dawn's 'Item added' popup does not get a second badge on its View cart link", () => {
 const html = `<html><body><header><a href="/cart" class="header__icon header__icon--cart" id="cart-icon-bubble"><svg class="icon icon-cart-empty"></svg></a><cart-notification><div id="cart-notification" class="cart-notification"><div class="cart-notification__links"><a href="/cart" id="cart-notification-button" class="button">View cart</a></div></div></cart-notification></header></body></html>`;
 const out = applyCartBadge(html, 2);
 assert.equal((out.match(/data-vya-cart-badge/g) || []).length, 0, "the header icon uses Dawn's own bubble");
 assert.equal((out.match(/cart-count-bubble/g) || []).length, 1);
 assert.doesNotMatch(out, /cart-notification-button[^>]*>[^<]*<[^>]*cart-count-bubble/);
});

test("an alpine cart button is found by the count it binds, not by a label it doesn't have", () => {
 // hachi archive's button has no href, no aria-label — only an @click handler.
 const html = `<html><body><header><button class="relative" @click.prevent="$store.modals.open('cart')"><span class="sr-only">Cart</span><span x-text="$store.cart_count.count">0</span></button></header></body></html>`;
 const out = applyCartBadge(html, 3);
 assert.match(out, /x-text="\$store\.cart_count\.count">3</);
 assert.doesNotMatch(out, /data-vya-cart-badge/);
});

// ── one cart control, not two ────────────────────────────────────────────────────────────────────
// Every hosted store shows the theme's own cart icon AND a floating "Bag · N" pill we inject to open
// our drawer. Two controls doing one job, and a shopper cannot tell which is real. The theme's icon
// already carries our live count; it should open our drawer too, and the pill should go.
import { bindCartControls, hasCartControl } from "./cart-badge.ts";

test("the theme's own cart icon is marked to open our drawer", () => {
 const html = `<header><a id="cart-icon-bubble" href="/cart"><span class="cart-count-bubble">0</span></a></header>`;
 const out = bindCartControls(html);
 const $ = cheerio.load(out);
 assert.equal($("#cart-icon-bubble").attr("data-vya-cart-open"), "1");
});

test("its own link is neutralised so it cannot navigate away to the theme's cart page", () => {
 const html = `<header><a id="cart-icon-bubble" href="/cart">Cart</a></header>`;
 const $ = cheerio.load(bindCartControls(html));
 assert.notEqual($("#cart-icon-bubble").attr("href"), "/cart");
});

test("a theme with no recognisable cart control is left able to reach the bag", () => {
 // Removing the pill from a store where nothing else opens the drawer would strand the shopper.
 const html = `<header><a href="/about">About</a></header>`;
 const out = bindCartControls(html);
 assert.equal(cheerio.load(out)("[data-vya-cart-open]").length, 0);
 assert.equal(hasCartControl(html), false);
});

test("a store WITH a cart control does not need the fallback pill", () => {
 assert.equal(hasCartControl(`<header><cart-icon></cart-icon></header>`), true);
 assert.equal(hasCartControl(`<header><button aria-label="Open cart"></button></header>`), true);
});

test("every cart control on the page is bound, not just the first", () => {
 // Themes commonly render one for desktop and one for mobile.
 const html = `<header><a href="/cart" class="desk">Cart</a><a href="/cart" class="mob">Cart</a></header>`;
 const $ = cheerio.load(bindCartControls(html));
 assert.equal($("[data-vya-cart-open]").length, 2);
});

test("a store with its own cart control tells the page to hide the fallback pill", () => {
 const out = applyCartBadge(`<html><body><header><a href="/cart">Cart</a></header></body></html>`, 2);
 assert.match(out, /<body[^>]*data-vya-has-cart-control/);
 assert.match(out, /data-vya-cart-open/);
});

test("a store with no cart control keeps the pill visible", () => {
 const out = applyCartBadge(`<html><body><header><a href="/about">About</a></header></body></html>`, 2);
 assert.doesNotMatch(out, /data-vya-has-cart-control/);
});
