import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { injectHostedDetails } from "./hosted-product-details.ts";

// Where the details land on a captured theme page: after the buy control (where rewireCommerce and
// applyCartState put theirs), else after the price, else inside the product's own container, else
// at the end of the body — and never twice.

const BLOCK = `<section data-vya-details="1"><div data-vya-section="flaws"><p>Flaws</p><ul><li>small mark inside collar</li></ul></div></section>`;

// A Dawn-shaped page after rewireCommerce: the theme's form with VYA's own Add / Buy now inside it.
const SHOPIFY = `<html><body><main><div class="product__info-wrapper">
 <h1>Coat</h1>
 <div class="price"><span class="price-item price-item--regular" data-vya-price="1">£2,295.00</span></div>
 <form action="/cart/add" onsubmit="return false"><div class="product-form__buttons">
  <a href="#" data-vya-add="abc" class="product-form__submit button">Add to cart</a><a href="/checkout?item=abc" class="product-form__submit button" data-vya-secondary="1">Buy now</a>
 </div></form>
 <div class="product__description rte"><p>Lovely.</p></div>
</div></main></body></html>`;

// A theme with a price but no buy form at all (a sold page captured without one).
const PRICE_ONLY = `<html><body><div class="product-single__meta"><h1>Coat</h1><div class="product__price"><span class="product__price--regular">$195.00</span></div><div class="rte">Words.</div></div></body></html>`;

// Neither.
const BARE = `<html><body><article><h1>Coat</h1><p>Words.</p></article></body></html>`;

test("Shopify-like theme: the block lands right after the buy form, before the description", () => {
 const $ = cheerio.load(injectHostedDetails(SHOPIFY, BLOCK));
 assert.equal($("[data-vya-details]").length, 1);
 assert.equal($("form").next().attr("data-vya-details"), "1", "directly after the form that holds the buy control");
 assert.equal($("[data-vya-details]").next().hasClass("product__description"), true);
 assert.equal($("[data-vya-section='flaws'] li").text(), "small mark inside collar");
});

test("a page with only a price element: the block lands after the price block", () => {
 const $ = cheerio.load(injectHostedDetails(PRICE_ONLY, BLOCK));
 assert.equal($("[data-vya-details]").length, 1);
 assert.equal($(".product__price").next().attr("data-vya-details"), "1", "after the whole price wrapper, not inside it");
});

test("a page with neither: the block is appended to the product container, else the body", () => {
 const $ = cheerio.load(injectHostedDetails(BARE, BLOCK));
 assert.equal($("[data-vya-details]").length, 1);
 assert.equal($("body > [data-vya-details]").length, 1, "nothing product-shaped to hang it on, so the body's end");
 const inMeta = cheerio.load(injectHostedDetails(`<html><body><div class="product-info"><h1>Coat</h1></div></body></html>`, BLOCK));
 assert.equal(inMeta(".product-info > [data-vya-details]").length, 1, "the product container, when the page has one");
});

test("served twice, the page carries one block — the newer one", () => {
 const once = injectHostedDetails(SHOPIFY, BLOCK);
 const twice = injectHostedDetails(once, BLOCK.replace("small mark inside collar", "one loose button"));
 const $ = cheerio.load(twice);
 assert.equal($("[data-vya-details]").length, 1);
 assert.equal($("[data-vya-section='flaws'] li").text(), "one loose button", "a flaw the seller edited since is what prints");
});

test("no block means the page is returned untouched, and an old block is taken off", () => {
 assert.equal(injectHostedDetails(SHOPIFY, ""), SHOPIFY, "byte for byte — no reserialising a page for nothing");
 const $ = cheerio.load(injectHostedDetails(injectHostedDetails(SHOPIFY, BLOCK), ""));
 assert.equal($("[data-vya-details]").length, 0);
});

test("a sold page (no data-vya-add, a dead control from rewireCommerce) still anchors on the control", () => {
 const sold = SHOPIFY.replace(/<a href="#" data-vya-add="abc"[^>]*>Add to cart<\/a><a[^>]*>Buy now<\/a>/, `<a href="#" class="product-form__submit button" data-vya-proto="button|product-form__submit button" style="opacity:.4">On hold</a>`);
 const $ = cheerio.load(injectHostedDetails(sold, BLOCK));
 assert.equal($("form").next().attr("data-vya-details"), "1");
});
