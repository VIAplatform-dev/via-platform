import { test } from "node:test";
import assert from "node:assert/strict";
import { VOLATILE_SELECTOR } from "./parity-regions.ts";

/** Would this class attribute be excluded from the comparison? */
const excluded = (cls: string) =>
 VOLATILE_SELECTOR.split(",").some((sel) => {
  const m = /\[class\*="([^"]+)" i\]/.exec(sel.trim());
  return m ? cls.toLowerCase().includes(m[1].toLowerCase()) : false;
 });

test("recommendation strips are excluded from the comparison", () => {
 // "You may also like" is picked fresh per visit, by her shop and by ours, from different pools.
 // Comparing what is in it compares noise — and the census ALREADY grades that difference as
 // cosmetic. Counting the same difference again as a blocking price mismatch is double-counting.
 for (const cls of ["product-recommendations", "related-products", "also-like-grid", "complete-the-look"]) {
  assert.ok(excluded(cls), cls);
 }
});

test("recently-viewed is excluded — it is per shopper, not per shop", () => {
 assert.ok(excluded("recently-viewed"));
});

test("the product's own price region is NOT excluded", () => {
 // The whole point is still to catch a price we show that she would not honour.
 for (const cls of ["price", "product-form", "product__info", "price__regular", "card__price"]) {
  assert.ok(!excluded(cls), cls);
 }
});
