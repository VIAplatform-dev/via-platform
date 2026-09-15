import { test } from "node:test";
import assert from "node:assert/strict";
import { showsProductNotes, isMeasured } from "./storefront-product-notes.ts";

test("nothing is printed until the seller says so", () => {
 // The bug: a saved shipping row was enough, so every store quoted postage it never agreed to.
 assert.equal(showsProductNotes(false, true), false);
 assert.equal(showsProductNotes(true, true), true);
});

test("a switch turned on before the settings exist publishes nothing", () => {
 // Without a row the zones are VYA's defaults, not her answer. Her name, our guess.
 assert.equal(showsProductNotes(true, false), false);
 assert.equal(showsProductNotes(false, false), false);
});

test("only a real yes counts", () => {
 for (const v of [undefined, null, 0, 1, "", "true", "false", {}]) {
  assert.equal(showsProductNotes(v, true), false, `enabled=${JSON.stringify(v)}`);
  assert.equal(showsProductNotes(true, v), false, `saved=${JSON.stringify(v)}`);
 }
});

test("measured means one real figure, not all four", () => {
 assert.equal(isMeasured({ weightOz: 12 }), true);
 assert.equal(isMeasured({ lengthIn: 10, widthIn: 8, heightIn: 3 }), true);
 // Girth alone, no weight. The tier still assigns from the larger of the two.
 assert.equal(isMeasured({ weightOz: 0, lengthIn: 10 }), true);
});

test("an unweighed piece is not measured, however it arrives", () => {
 // This is the case that printed "Shipping from $14" for a piece nobody had touched: assignTier
 // falls back to Medium, and the page rendered the fallback as if it were a fact.
 assert.equal(isMeasured(null), false);
 assert.equal(isMeasured(undefined), false);
 assert.equal(isMeasured({}), false);
 assert.equal(isMeasured({ weightOz: null, lengthIn: null, widthIn: null, heightIn: null }), false);
 assert.equal(isMeasured({ weightOz: 0, lengthIn: 0, widthIn: 0, heightIn: 0 }), false);
 // Junk out of the database is not a measurement either.
 assert.equal(isMeasured({ weightOz: NaN } as never), false);
 assert.equal(isMeasured({ weightOz: "heavy" } as never), false);
 // Negative is corrupt, not light.
 assert.equal(isMeasured({ weightOz: -4 }), false);
});
