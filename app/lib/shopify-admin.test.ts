import { test } from "node:test";
import assert from "node:assert/strict";
import { adminProductToImported } from "./shopify-admin.ts";

// A CONNECTED store should import strictly better than a scraped one: exact money in the shop's
// own currency, the full size run, the store's own product identity, and true collection
// membership — none of which has to be inferred from HTML.

const node = (over: Record<string, unknown> = {}) => ({
 id: "gid://shopify/Product/123",
 handle: "gucci-tom-ford-velvet-jacket",
 title: "Gucci by Tom Ford Fall 1999 Black Velvet Jacket",
 descriptionHtml: "<p>A <b>rare</b> piece</p>",
 totalInventory: 1,
 tags: ["archive", "gucci"],
 onlineStoreUrl: "https://shop.com/products/gucci-tom-ford-velvet-jacket",
 options: [{ name: "Size", values: ["S", "M"] }],
 featuredImage: { url: "https://cdn/a.jpg" },
 images: { edges: [{ node: { url: "https://cdn/a.jpg" } }, { node: { url: "https://cdn/b.jpg" } }] },
 variants: { edges: [
  { node: { id: "gid://shopify/ProductVariant/1", title: "S", price: "627.00", availableForSale: true, selectedOptions: [{ name: "Size", value: "S" }] } },
  { node: { id: "gid://shopify/ProductVariant/2", title: "M", price: "627.00", availableForSale: false, selectedOptions: [{ name: "Size", value: "M" }] } },
 ] },
 collections: { edges: [{ node: { handle: "archive" } }, { node: { handle: "outerwear" } }] },
 ...over,
});

test("money comes through as cents in the shop's own currency", () => {
 const p = adminProductToImported(node(), "GBP");
 assert.equal(p.priceCents, 62700, "cents, not a parsed display string");
 assert.equal(p.currency, "GBP", "the shop's currency, never assumed USD");
 assert.equal(p.price, "£627", "the display string is derived, not the source of truth");
});

test("carries the store's own identity so a re-sync matches instead of duplicating", () => {
 const p = adminProductToImported(node(), "USD");
 assert.equal(p.sourcePlatform, "shopify");
 assert.equal(p.sourceId, "gucci-tom-ford-velvet-jacket", "handle is the stable identity");
 assert.equal(p.sourceUrl, "https://shop.com/products/gucci-tom-ford-velvet-jacket");
});

test("falls back to the product id when a handle is missing", () => {
 const p = adminProductToImported(node({ handle: null }), "USD");
 assert.equal(p.sourceId, "gid://shopify/Product/123");
});

test("keeps the FULL size run, including sold-out sizes", () => {
 // Reproduction-vintage sellers list one style across a whole size run; keeping only the first
 // variant threw the rest away, and a sold-out size is still information a shopper needs.
 const p = adminProductToImported(node(), "USD");
 assert.equal(p.variants?.length, 2);
 assert.deepEqual(p.variants?.map((v) => v.size), ["S", "M"]);
 assert.deepEqual(p.variants?.map((v) => v.available), [true, false]);
 assert.equal(p.variants?.[0].priceCents, 62700);
});

test("reads collection membership straight from the API", () => {
 // This is what lets a connected store skip crawling up to 25 collection pages to work out
 // which products belong where.
 const p = adminProductToImported(node(), "USD");
 assert.deepEqual(p.collectionHandles, ["archive", "outerwear"]);
});

test("survives a sparse product node without throwing", () => {
 const p = adminProductToImported({ title: "Bare Minimum" }, "USD");
 assert.equal(p.name, "Bare Minimum");
 assert.equal(p.priceCents, null);
 assert.deepEqual(p.variants, []);
 assert.deepEqual(p.collectionHandles, []);
 assert.equal(p.image, "");
});

test("strips HTML out of the description", () => {
 assert.equal(adminProductToImported(node(), "USD").description, "A rare piece");
});

test("a variant's colour option is captured separately from its size", () => {
 const p = adminProductToImported(node({
  variants: { edges: [{ node: { id: "v1", title: "S / Black", price: "10.00", availableForSale: true,
   selectedOptions: [{ name: "Size", value: "S" }, { name: "Color", value: "Black" }] } }] },
 }), "USD");
 assert.equal(p.variants?.[0].size, "S");
 assert.equal(p.variants?.[0].color, "Black");
});
