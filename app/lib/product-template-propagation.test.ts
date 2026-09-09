import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { prepareEditMode, extractScopedEdits, applyScopedEditsToPage, hasChromeEdits, isCapturedProductPath } from "./site-capture.ts";

// Two product pages off one theme: the wording is shared, the piece is not.
const product = (name: string, price: string) => `<html><body>
<header><a href="/cart">Cart</a></header>
<main><section>
 <h1>${name}</h1><span class="price">${price}</span>
 <p class="ship">Free shipping over $100</p>
 <button class="atc">Add to cart</button>
 <a class="guide" href="/pages/size-guide">Size guide</a>
 <img src="hero.jpg">
</section></main>
<footer><p>© Tess</p></footer></body></html>`;

const A = product("Silk Slip Dress", "$220");
const B = product("Jumbo Black Bag", "$96");

/** The eid the editor gives a node, so a test edits the same thing the browser would. */
const eidOf = (html: string, sel: string) =>
 Number(cheerio.load(prepareEditMode(html, "s", "/products/a"))(sel).attr("data-vya-eid"));
const linkIdOf = (html: string, sel: string) =>
 Number(cheerio.load(prepareEditMode(html, "s", "/products/a"))(sel).attr("data-vya-link"));

test("a path is recognised as a product page", () => {
 assert.equal(isCapturedProductPath("/products/silk-slip-dress"), true);
 assert.equal(isCapturedProductPath("/collections/dresses"), false);
});

test("shared wording travels to the other product pages", () => {
 const edits = { edits: [{ eid: eidOf(A, ".atc"), text: "Add to bag" }] };
 const tmpl = extractScopedEdits(A, edits, "body");
 assert.ok(hasChromeEdits(tmpl));
 const out = applyScopedEditsToPage(B, tmpl, "body");
 assert.equal(out.changed, true);
 assert.equal(cheerio.load(out.html)(".atc").text(), "Add to bag");
});

test("a piece's own name does NOT travel — that is what makes this safe", () => {
 const edits = { edits: [{ eid: eidOf(A, "h1"), text: "Silk Slip Dress (1970s)" }] };
 const tmpl = extractScopedEdits(A, edits, "body");
 const out = applyScopedEditsToPage(B, tmpl, "body");
 assert.equal(out.changed, false);
 assert.equal(cheerio.load(out.html)("h1").text(), "Jumbo Black Bag");
});

test("a price does not travel either", () => {
 const edits = { edits: [{ eid: eidOf(A, ".price"), text: "$240" }] };
 const out = applyScopedEditsToPage(B, extractScopedEdits(A, edits, "body"), "body");
 assert.equal(cheerio.load(out.html)(".price").text(), "$96");
});

test("a shared link travels", () => {
 const edits = { links: [{ id: linkIdOf(A, ".guide"), href: "/pages/measurements" }] };
 const out = applyScopedEditsToPage(B, extractScopedEdits(A, edits, "body"), "body");
 assert.equal(cheerio.load(out.html)(".guide").attr("href"), "/pages/measurements");
});

test("a header edit is NOT carried by the product pass — the chrome pass owns it", () => {
 // Otherwise both passes rewrite the same element and the two could disagree.
 const edits = { edits: [{ eid: eidOf(A, "header a"), text: "Bag" }] };
 const tmpl = extractScopedEdits(A, edits, "body");
 assert.equal(hasChromeEdits(tmpl), false);
});

test("a footer edit is left to the chrome pass too", () => {
 const edits = { edits: [{ eid: eidOf(A, "footer p"), text: "© Tess Elizabeth" }] };
 assert.equal(hasChromeEdits(extractScopedEdits(A, edits, "body")), false);
});

test("the chrome pass still only touches chrome", () => {
 const edits = { edits: [{ eid: eidOf(A, ".ship"), text: "Free shipping over $150" }] };
 assert.equal(hasChromeEdits(extractScopedEdits(A, edits, "chrome")), false);
});

test("an edit that changes nothing is not propagated", () => {
 const edits = { edits: [{ eid: eidOf(A, ".atc"), text: "Add to cart" }] };
 assert.equal(hasChromeEdits(extractScopedEdits(A, edits, "body")), false);
});

test("a page that doesn't carry the old wording is left alone", () => {
 const other = `<html><body><main><section><button class="atc">Buy it</button></section></main></body></html>`;
 const edits = { edits: [{ eid: eidOf(A, ".atc"), text: "Add to bag" }] };
 const out = applyScopedEditsToPage(other, extractScopedEdits(A, edits, "body"), "body");
 assert.equal(out.changed, false);
});
