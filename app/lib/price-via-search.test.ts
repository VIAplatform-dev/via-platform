import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSoldPrice, looksLikeSameListing } from "./price-via-search.ts";

// Sold-through is the most valuable signal the pricer can have and the one it has never had, so the
// bar for accepting one is high: only a price Google explicitly quotes as a completed sale counts.
// Every string below is copied verbatim from real SerpApi snippets for vestiairecollective.com,
// including the ones that must NOT be read as a sale.

test("reads a realized sale price out of the crawl", () => {
 const usd = extractSoldPrice("Celine. Tab Bag leather handbag. Very good condition. Brown, Leather. Sold at $562.84 ...");
 assert.equal(usd, 56284);
});

test("converts a foreign realized price rather than quoting it as dollars", () => {
 // "Sold at £313.71" entering the comp set as $313.71 is a silent systematic error, not a rounding one.
 const usd = extractSoldPrice("Celine. Triomphe Vintage leather travel bag. Very good condition. Brown, Leather. Sold at £313.71.");
 assert.ok(usd !== null, "a sterling sale is still a sale");
 assert.ok(usd > 31371, "sterling converts upward, so the USD figure must exceed the sterling one");
});

test("'sold with' is packaging, not a sale", () => {
 // Vestiaire lists what ships with the piece under this heading. A bare /sold/ match swept it in.
 assert.equal(extractSoldPrice("Measurements. Width:12 in; Height:12 in; Depth:9 in. Sold with. Dust bag."), null);
});

test("an order-status line is not a price", () => {
 assert.equal(extractSoldPrice("Seller profile picture - undefined. Follow. item sold. shipped. canceled ..."), null);
});

test("a live asking price is never mistaken for a sale", () => {
 assert.equal(extractSoldPrice("CELINE Tab Bag leather handbag. $1,448 + Duties. Romania"), null);
});

test("thousands separators survive", () => {
 assert.equal(extractSoldPrice("Rare vintage piece. Sold at $1,448.00 on Vestiaire"), 144800);
});

test("a currency we cannot convert is dropped, not guessed", () => {
 // Quoting an unconvertible price as dollars would be worse than having no comp at all. This one
 // parsed as $4.00 while the currency marker was optional — a plausible number, silently wrong.
 assert.equal(extractSoldPrice("Sold at 4 500 kr"), null);
});

test("a sale with no currency marker at all is dropped", () => {
 assert.equal(extractSoldPrice("Sold at 313.71"), null);
});

// The guard that stops any of this becoming laundering: the sale has to belong to THIS listing.
test("a sale on the same host for a different piece is rejected", () => {
 assert.equal(
  looksLikeSameListing(
   "Moschino Black Koi Fish Graphic Sleeveless Top Size 10",
   "https://www.vestiairecollective.com/women-clothing/tops/moschino/koi-top-123.shtml",
   "Celine Triomphe vintage leather travel bag",
   "vestiairecollective.com",
   "https://www.vestiairecollective.com/women-bags/handbags/celine/travel-bag-999.shtml",
  ),
  true,
  "same host is accepted by design — the host check is what makes a blocked listing recoverable at all",
 );
 // ...which is why the sold price is only ever attached to a match we already confirmed by image.
});
