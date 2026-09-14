import { test } from "node:test";
import assert from "node:assert/strict";
import { productRef, refsInHrefs } from "./wishlist-core.ts";

test("a product link gives up its piece, by handle or by id", () => {
 // An imported store: the handle it had on Shopify.
 assert.equal(productRef("/products/black-velvet-jacket"), "black-velvet-jacket");
 // A piece added on VYA: its own id.
 assert.equal(productRef("/products/2f6d6d68-9b11-438f-8fd5-864d87dd6566"), "2f6d6d68-9b11-438f-8fd5-864d87dd6566");
 // Served from her own domain, and from a VYA path — the same page is used on both.
 assert.equal(productRef("https://blummier.com/products/silk-slip"), "silk-slip");
 assert.equal(productRef("/site/blummier/products/silk-slip"), "silk-slip");
});

test("the piece is the path, not the variant", () => {
 assert.equal(productRef("/products/silk-slip?variant=4411"), "silk-slip");
 assert.equal(productRef("/products/silk-slip#gallery"), "silk-slip");
 assert.equal(productRef("/collections/dresses/products/silk-slip?v=2"), "silk-slip");
});

test("links that are not a piece get no heart", () => {
 assert.equal(productRef("/collections/all"), null);
 assert.equal(productRef("/pages/about"), null);
 assert.equal(productRef("/cart"), null);
 assert.equal(productRef(""), null);
 assert.equal(productRef(null), null);
 assert.equal(productRef(undefined), null);
 // Shopify's catch-all product routes, which are listings rather than one piece.
 assert.equal(productRef("/products/all"), null);
 assert.equal(productRef("/products/gift-card"), null);
});

test("a percent-encoded handle is decoded, because that is how it is stored", () => {
 assert.equal(productRef("/products/caf%C3%A9-jacket"), "café-jacket");
 // Malformed encoding must not throw on a shopper's page.
 assert.equal(productRef("/products/100%-silk"), "100%-silk");
});

test("the same piece linked twice is one piece", () => {
 // A card's image and its title are two links to the same dress.
 const refs = refsInHrefs(["/products/a", "/products/a?variant=1", "/products/b", "/cart", null]);
 assert.deepEqual(refs, ["a", "b"]);
 assert.deepEqual(refsInHrefs([]), []);
});

test("a handle cannot be used to smuggle something long at the server", () => {
 assert.equal(productRef("/products/" + "x".repeat(500))?.length, 200);
});
