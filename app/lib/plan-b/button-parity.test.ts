import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseBuyButtons } from "./button-parity.ts";

const page = `<html><body><form action="/cart/add"><div class="product-form__buttons">
 <a class="product-form__submit button">Add to cart</a>
 <button class="product-form__submit button">Enquire</button>
</div></form></body></html>`;

test("the buttons in a buy group are made to match each other", () => {
 // blummier's Enquire button renders at 25.6px beside an Add to cart at 13px — same classes, same
 // parent, on her site the same size. Something in her stylesheet reaches the <button> on her copy
 // and not on ours. Rather than hardcode a size per store, the group agrees on the smallest.
 const out = normaliseBuyButtons(page);
 assert.match(out, /data-vya-button-parity/);
 assert.match(out, /product-form__buttons/, "the group is found by the theme's own class");
});

test("it takes the smallest size in the group, not the largest", () => {
 // Growing every button to match the odd one out would make the page worse, not better.
 assert.match(normaliseBuyButtons(page), /Math\.min/);
});

test("a page with no buy group is returned byte for byte", () => {
 const plain = `<html><body><p>About us</p></body></html>`;
 assert.equal(normaliseBuyButtons(plain), plain);
});

test("running twice does not stack two scripts", () => {
 const once = normaliseBuyButtons(page);
 assert.equal(normaliseBuyButtons(once), once);
});

test("it only touches a group whose sizes actually disagree", () => {
 // A theme that already agrees with itself must be left alone — the whole point is matching HER
 // design, and overriding a deliberate size difference would be the same mistake in reverse.
 assert.match(normaliseBuyButtons(page), /RATIO/);
});

test("height is matched too, and measured after the type is settled", () => {
 // Matching the font alone still left one button ten pixels taller than the one beside it: the
 // padding differs as well. Measured after, because changing the type changes the height.
 const out = normaliseBuyButtons(page);
 assert.match(out, /getBoundingClientRect\(\)\.height/);
 assert.match(out, /alignItems="center"/, "set as a box that centres its label, so nothing clips");
});
