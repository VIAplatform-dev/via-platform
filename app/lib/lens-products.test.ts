import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLensMatches, mergeLensMatches, pricedCount } from "./lens-products.ts";

test("parseLensMatches reads visual_matches with SerpApi price shapes and tags pricedFrom only when priced", () => {
 const r = { visual_matches: [
  { title: "Gucci Jackie", link: "https://a", source: "TheRealReal", price: { value: "$1,250*", extracted_value: 1250, currency: "$" } },
  { title: "no price", link: "https://b", source: "Vogue" },
  { title: "", link: "https://c" },
 ] };
 const ms = parseLensMatches(r, "products");
 assert.equal(ms.length, 2);
 assert.equal(ms[0].priceCents, 125000);
 assert.equal(ms[0].pricedFrom, "products");
 assert.equal(ms[1].priceCents, null);
 assert.equal(ms[1].pricedFrom, undefined);
});

test("parseLensMatches falls back to a `products` array and tolerates null", () => {
 assert.equal(parseLensMatches({ products: [{ title: "x", price: 40 }] })[0].priceCents, 4000);
 assert.deepEqual(parseLensMatches(null), []);
});

test("mergeLensMatches adopts a products price for an unpriced primary link and appends new links", () => {
 const primary = [
  { title: "id hit", priceCents: null, source: "Grailed", link: "https://g" },
  { title: "already priced", priceCents: 9000, source: "eBay", link: "https://e" },
 ];
 const products = [
  { title: "id hit (shop)", priceCents: 12000, source: "Grailed", link: "https://g", pricedFrom: "products" as const },
  { title: "already priced (shop)", priceCents: 1, source: "eBay", link: "https://e", pricedFrom: "products" as const },
  { title: "new", priceCents: 5000, source: "Poshmark", link: "https://p", pricedFrom: "products" as const },
 ];
 const out = mergeLensMatches(primary, products);
 assert.equal(out.length, 3);
 assert.equal(out[0].title, "id hit"); // primary row kept (brand consensus order)
 assert.equal(out[0].priceCents, 12000);
 assert.equal(out[0].pricedFrom, "products");
 assert.equal(out[1].priceCents, 9000); // primary price wins
 assert.equal(out[2].link, "https://p");
 assert.equal(pricedCount(out), 3);
 assert.equal(primary[0].priceCents, null); // non-mutating
});
