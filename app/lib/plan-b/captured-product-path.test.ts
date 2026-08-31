import { test } from "node:test";
import assert from "node:assert/strict";
import { isProductPagePath, pageNamesProduct, pickCapturedProductPath, slugifyTitle } from "./captured-product-path.ts";

// The real paths a Squarespace capture holds, alongside the Shopify shape the pipeline assumed.
const SQS_PATHS = [
 "/", "/about", "/returns", "/shop", "/shop/shoes", "/shop/bags",
 "/shop/p/christian-louboutin-so-kate",
 "/shop/p/dolce-gabbana-leopard-calf-hair-pointed-toe-pumps",
 "/shop/p/fendi-beaded-baguette",
];

test("slugifyTitle matches how these platforms actually slug a title", () => {
 // Squarespace's own urlSlug for this product, copied off the store's feed.
 assert.equal(slugifyTitle("Dolce & Gabbana Leopard Calf Hair Pointed-Toe Pumps"), "dolce-gabbana-leopard-calf-hair-pointed-toe-pumps");
 assert.equal(slugifyTitle("Christian Louboutin So Kate – Pink Suede"), "christian-louboutin-so-kate-pink-suede");
 assert.equal(slugifyTitle("Gillian & O'Malley Crushed Velvet Top"), "gillian-omalley-crushed-velvet-top");
 assert.equal(slugifyTitle("  Hermès Birkin  "), "hermes-birkin");
});

test("finds the captured page under the platform's OWN url shape, not just Shopify's", () => {
 assert.equal(
  pickCapturedProductPath(SQS_PATHS, ["christian-louboutin-so-kate"]),
  "/shop/p/christian-louboutin-so-kate",
 );
});

test("tries the keys in order, so a real source handle beats a slugified title", () => {
 const paths = ["/shop/p/real-handle", "/shop/p/some-title"];
 assert.equal(pickCapturedProductPath(paths, ["real-handle", "some-title"]), "/shop/p/real-handle");
 assert.equal(pickCapturedProductPath(paths, [null, "some-title"]), "/shop/p/some-title");
});

test("prefers the Shopify shape when a store holds both", () => {
 const paths = ["/shop/p/x", "/products/x"];
 assert.equal(pickCapturedProductPath(paths, ["x"]), "/products/x");
});

test("never resolves to a page that isn't a product page", () => {
 // A collection whose last segment is the key, and a top-level page — both would send a shopper
 // somewhere that isn't the piece they clicked.
 assert.equal(pickCapturedProductPath(["/shop/shoes", "/about"], ["shoes"]), null);
 assert.equal(pickCapturedProductPath(SQS_PATHS, ["nothing-like-this"]), null);
 assert.equal(pickCapturedProductPath(SQS_PATHS, []), null);
 assert.equal(pickCapturedProductPath(SQS_PATHS, [""]), null);
});

test("isProductPagePath knows the shapes these platforms use", () => {
 for (const p of ["/products/x", "/shop/p/x", "/product/x", "/collections/all/products/x", "/listing/x"]) {
  assert.equal(isProductPagePath(p), true, p);
 }
 for (const p of ["/", "/about", "/shop", "/collections/bags"]) {
  assert.equal(isProductPagePath(p), false, p);
 }
});

test("pageNamesProduct confirms the page really shows this piece", () => {
 const page = `<html><body><h1 class="product-title">Christian Louboutin So Kate</h1></body></html>`;
 assert.equal(pageNamesProduct(page, "Christian Louboutin So Kate"), true);
 assert.equal(pageNamesProduct(page, "christian louboutin so kate"), true, "case and spacing don't matter");
 assert.equal(pageNamesProduct(page, "Manolo Blahnik BB Pumps"), false, "a different garment is refused");
 assert.equal(pageNamesProduct("<h1>&amp; O'Malley Top</h1>", "& O’Malley Top"), true, "entities and curly quotes");
 assert.equal(pageNamesProduct("<body><p>no heading</p></body>", "Anything"), false);
 assert.equal(pageNamesProduct(page, ""), false);
});

test("pageNamesProduct reads a heading with markup inside it", () => {
 const page = `<h1 class="t"><span class="brand">Fendi</span> Beaded Baguette</h1>`;
 assert.equal(pageNamesProduct(page, "Fendi Beaded Baguette"), true);
});
