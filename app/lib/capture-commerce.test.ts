import { test } from "node:test";
import assert from "node:assert/strict";
import { productContentHash } from "./capture-commerce-core.ts";
import type { ImportedProduct } from "./store-import.ts";

// ── M1: money and identity ─────────────────────────────────────────────────────────────────
// The import used to round-trip money through a FORMATTED string ("£120.00" → digits → cents)
// and guess the currency from the glyph, which labelled a UK store's GBP catalogue as USD.
// It also matched products by title, which on one-of-one vintage both merges distinct pieces
// and duplicates renamed ones. These tests pin the corrected behaviour.

const base = (over: Partial<ImportedProduct> = {}): ImportedProduct => ({
 name: "Gucci by Tom Ford Fall 1999 Black Velvet Jacket",
 price: "£627.00",
 priceCents: 62700,
 currency: "GBP",
 image: "https://cdn/img1.jpg",
 images: ["https://cdn/img1.jpg"],
 available: true,
 sourcePlatform: "shopify",
 sourceId: "gucci-tom-ford-velvet-jacket",
 ...over,
});

test("content hash is stable for an unchanged product", () => {
 assert.equal(productContentHash(base()), productContentHash(base()));
});

test("content hash changes when the price changes", () => {
 assert.notEqual(productContentHash(base()), productContentHash(base({ priceCents: 59900, price: "£599.00" })));
});

test("content hash changes when the item sells out", () => {
 assert.notEqual(productContentHash(base()), productContentHash(base({ available: false })));
});

test("content hash changes when images change", () => {
 assert.notEqual(
  productContentHash(base()),
  productContentHash(base({ images: ["https://cdn/img1.jpg", "https://cdn/img2.jpg"] })),
 );
});

test("content hash is currency-aware — same number, different currency is NOT the same listing", () => {
 // The bug this guards: 627 GBP and 627 USD are different prices, and a re-sync must notice.
 assert.notEqual(productContentHash(base()), productContentHash(base({ currency: "USD" })));
});

test("content hash survives a formatted-price-only product (legacy sources)", () => {
 // Sources that give us no numeric price fall back to parsing the display string; that path must
 // still produce a usable, stable hash rather than throwing.
 const legacy = base({ priceCents: undefined, currency: undefined, price: "$627.00" });
 assert.equal(typeof productContentHash(legacy), "string");
 assert.equal(productContentHash(legacy), productContentHash(legacy));
});

test("two distinct one-of-one pieces sharing a title hash differently when their images differ", () => {
 // Vintage stores really do list two different garments under the same name. Title alone can't
 // tell them apart — this is why matching keys on sourceId, and why the hash includes images.
 const a = base({ sourceId: "levis-501-a", images: ["https://cdn/a.jpg"] });
 const b = base({ sourceId: "levis-501-b", images: ["https://cdn/b.jpg"] });
 assert.notEqual(productContentHash(a), productContentHash(b));
});
