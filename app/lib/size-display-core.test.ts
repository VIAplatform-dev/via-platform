import { test } from "node:test";
import assert from "node:assert/strict";
import { sizeLine, formatSizeLine } from "./size-display-core.ts";

test("a seller's own fit note beats the tag: that is her telling the buyer what to order", () => {
 const s = sizeLine({ size: "IT 44", category: "dresses", title: "Prada slip dress", description: "Marked IT 44 but runs true to a US 6.", currency: "USD" });
 assert.deepEqual(s, { marked: "IT 44", fits: "US 6", source: "seller" });
 assert.equal(formatSizeLine(s), "Marked IT 44 · fits a US 6 (seller's note)");
});

test("without a note, a European or UK tag is converted from the size table", () => {
 const s = sizeLine({ size: "IT 40", category: "dresses", title: "Gucci dress", description: null, currency: "USD" });
 assert.deepEqual(s, { marked: "IT 40", fits: "US 4", source: "conversion" });
 assert.equal(formatSizeLine(s), "Marked IT 40 · about a US 4");
 const shoe = sizeLine({ size: "EU 38", category: "heels", title: "Ferragamo pumps", description: null, currency: "USD" });
 assert.deepEqual(shoe, { marked: "EU 38", fits: "US 7.5", source: "conversion" });
});

test("a UK store's bare shoe number is read as a UK size", () => {
 const s = sizeLine({ size: "5", category: "boots", title: "Chelsea boots", description: null, currency: "GBP" });
 assert.deepEqual(s, { marked: "5", fits: "US 7", source: "conversion" });
});

test("a tag with nothing to convert prints as marked, with no invented conversion", () => {
 const s = sizeLine({ size: "M", category: "tops", title: "Silk blouse", description: null, currency: "USD" });
 assert.deepEqual(s, { marked: "M", fits: null, source: "tag" });
 assert.equal(formatSizeLine(s), "M");
 // Already a US size: converting would print "US 8 · about a US 8".
 const us = sizeLine({ size: "US 8", category: "dresses", title: "Dress", description: null, currency: "USD" });
 assert.equal(us?.fits, null);
});

test("no size at all is null, not 'Marked —'", () => {
 assert.equal(sizeLine({ size: null, category: "tops", title: "Blouse", description: "lovely", currency: "USD" }), null);
 assert.equal(sizeLine({ size: "  ", category: "tops", title: "Blouse", description: null, currency: "USD" }), null);
 assert.equal(formatSizeLine(null), null);
});
