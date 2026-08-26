import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { sqsProductIdentity, applySqsProductIdentity } from "./sqs-product.ts";

// Reduced from the real capture of a Squarespace 7.1 product page: the page region carries the
// product id, and the ProductDetail controller reads the product out of `data-context`.
const SOURCE_ID = "6a320d2796a003307110cbee";
const PDP = `<html><body>
<article class="page-regions" data-collection-id="68af5f357ef86d6917a45e6d" data-item-id="${SOURCE_ID}">
 <div class="product-detail" data-controller="ProductDetail" data-product-id="${SOURCE_ID}"
  data-context='{"websiteId":"68af5ed7f6ae17794a258dad","product":{"id":"${SOURCE_ID}","title":"Fendi Beaded Baguette","price":{"currency":"USD","value":"4000.00"},"variants":[{"id":"361543f5","sku":"SQ0739223"}]}}'>
  <h1 class="product-title">Fendi Beaded Baguette</h1>
  <div class="product-add-to-cart"><div class="sqs-add-to-cart-button-wrapper">
   <button class="sqs-add-to-cart-button"><div class="sqs-add-to-cart-button-inner">
    <span class="add-to-cart-text">Make It Yours</span><span class="cart-added-text">Added!</span>
   </div></button>
  </div></div>
 </div>
</article></body></html>`;

const VYA_ID = "11111111-1111-4111-8111-111111111111";

test("a Squarespace product page is recognised by its own controller, not by its url", () => {
 const id = sqsProductIdentity(PDP);
 assert.equal(id?.productId, SOURCE_ID);
 assert.equal(id?.title, "Fendi Beaded Baguette");
});

test("an ordinary captured page is not a product page", () => {
 assert.equal(sqsProductIdentity(`<html><body><h1>About</h1></body></html>`), null);
 // A Shopify product page has its own route, which wires the buy button through the quick-add form.
 assert.equal(sqsProductIdentity(`<html><body><form action="/cart/add"><input name="id" value="42"></form></body></html>`), null);
});

test("the buy button posts the VYA item's id, so the bridge can resolve it", () => {
 // Squarespace's Add-to-cart sends `{itemId}` straight from this blob — captured, that id is the
 // SOURCE store's product, which means nothing to VYA and is why the button did nothing at all.
 const $ = cheerio.load(applySqsProductIdentity(PDP, VYA_ID));
 const $detail = $(".product-detail");
 assert.equal($detail.attr("data-product-id"), VYA_ID);
 assert.equal($("article.page-regions").attr("data-item-id"), VYA_ID);
 const ctx = JSON.parse($detail.attr("data-context") || "{}");
 assert.equal(ctx.product.id, VYA_ID, "the id the controller actually reads");
 assert.equal(ctx.product.title, "Fendi Beaded Baguette", "…and nothing else about the product moved");
 assert.equal(ctx.websiteId, "68af5ed7f6ae17794a258dad");
 assert.equal($(".sqs-add-to-cart-button").attr("data-vya-add"), VYA_ID, "Plan A's own cart drawer drives the same button");
});

test("the page's own bootstrap stops naming the source's product too", () => {
 // Squarespace repeats the id in `Static.SQUARESPACE_CONTEXT.item`, which its quick view and its
 // analytics read — left alone, half the page would still be describing the wrong piece.
 const withCtx = PDP.replace("</body>", `<script>Static.SQUARESPACE_CONTEXT = {"item":{"id":"${SOURCE_ID}","title":"Fendi Beaded Baguette"}};</script></body>`);
 const out = applySqsProductIdentity(withCtx, VYA_ID);
 assert.match(out, new RegExp(`"item":\\{"id":"${VYA_ID}"`));
 // …but the body hook a seller's page-specific custom CSS is written against is NOT ours to rename.
 const styled = PDP.replace("<body>", `<body id="item-${SOURCE_ID}">`);
 assert.match(applySqsProductIdentity(styled, VYA_ID), new RegExp(`id="item-${SOURCE_ID}"`));
});

test("only the product's own id is rewritten", () => {
 // The collection id sits in the same attribute set and belongs to the seller's page, not to us.
 const $ = cheerio.load(applySqsProductIdentity(PDP, VYA_ID));
 assert.equal($("article.page-regions").attr("data-collection-id"), "68af5f357ef86d6917a45e6d");
 assert.ok(!$(".product-detail").attr("data-context")!.includes(SOURCE_ID), "nothing in the buy path still claims to be the source's product");
});

test("a page we can't identify is served exactly as captured", () => {
 const plain = `<html><body><h1>Returns</h1></body></html>`;
 assert.equal(applySqsProductIdentity(plain, VYA_ID), plain);
 assert.equal(applySqsProductIdentity(PDP, ""), PDP, "no VYA item matched → leave the page alone");
});
