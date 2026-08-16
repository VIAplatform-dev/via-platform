import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyMatchesByImage, matchesToComps, priceToCents } from "./comps.ts";

// The fallback guarantees: verification only ever REMOVES matches it can prove are a different
// item. With no query embedding or no thumbnails it can't prove anything, so it must pass the set
// through untouched (filtered=false) — never make pricing worse than before.
test("verifyMatchesByImage is a no-op without a query embedding", async () => {
 const matches = [{ title: "Gucci bag", priceCents: 180000, source: "realreal", thumbnail: "https://t/x.jpg" }];
 const { verified, filtered, checked } = await verifyMatchesByImage(null, matches);
 assert.equal(filtered, false);
 assert.equal(checked, 0);
 assert.deepEqual(verified, matches);
});

test("verifyMatchesByImage is a no-op when no match has a thumbnail", async () => {
 const matches = [{ title: "Gucci bag", priceCents: 180000, source: "realreal" }];
 const { verified, filtered } = await verifyMatchesByImage([0.1, 0.2, 0.3], matches);
 assert.equal(filtered, false);
 assert.deepEqual(verified, matches);
});

test("matchesToComps keeps only priced matches", () => {
 const comps = matchesToComps([
  { title: "priced", priceCents: 12000, source: "ebay" },
  { title: "no price", priceCents: null, source: "blog" },
 ]);
 assert.equal(comps.length, 1);
 assert.equal(comps[0].priceCents, 12000);
});

test("priceToCents coerces SerpApi shapes", () => {
 assert.equal(priceToCents({ extracted_value: 18 }), 1800);
 assert.equal(priceToCents("$1,800.00"), 180000);
 assert.equal(priceToCents(null), null);
});
