import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFitLetterFromDescription, extractSizeFromDescription, feedProductPricing } from "./shopifyClient.ts";

// ── Which option is the price: the public products.json feed ─────────────────────────────────────
// venusvintage.co lists 3 Day Rental / 7 Day Rental / Purchase on every piece, with $0.00 meaning
// "not offered". Reading the first option skipped 116 of its 135 pieces. See variant-pricing.ts.
const feedV = (id: number, title: string, price: string, available = true) => ({ id, title, option1: title, option2: null, price, available });

test("public feed — a rental shop's listing is priced from Purchase, and rental options are not sizes", () => {
 const r = feedProductPricing([feedV(11, "3 Day Rental", "0.00"), feedV(12, "7 Day Rental", "75.00"), feedV(13, "Purchase", "380.00")]);
 assert.equal(r.price, 380);
 assert.equal(r.variant?.id, 13);
 assert.equal(r.rentOnly, false);
 assert.deepEqual(r.variants, [{ sourceVariantId: "13", size: null, color: null, priceCents: 38000, available: true }]);
});

test("public feed — a rent-only listing has no price, says it is rent-only, and carries its rental ladder", () => {
 const r = feedProductPricing([feedV(1, "3 Day Rental", "0.00"), feedV(2, "7 Day Rental", "150.00"), feedV(3, "Purchase", "0.00")]);
 assert.equal(r.price, null);
 assert.equal(r.variant, null);
 assert.equal(r.rentOnly, true);
 assert.deepEqual(r.rentalTiers, [{ days: 7, cents: 15000 }]);
});

test("public feed — a piece that both sells and rents carries a buy price AND a rental ladder", () => {
 const r = feedProductPricing([feedV(1, "3 Day Rental", "22.00"), feedV(2, "Purchase", "540.00"), feedV(3, "7 Day Rental", "80.00")]);
 assert.equal(r.price, 540);
 assert.equal(r.rentOnly, false);
 assert.deepEqual(r.rentalTiers, [{ days: 3, cents: 2200 }, { days: 7, cents: 8000 }]);
});

test("public feed — an ordinary size run maps exactly as it did before", () => {
 const r = feedProductPricing([
  { id: 1, title: "S", option1: "S", option2: null, price: "627.00", available: true },
  { id: 2, title: "M", option1: "M", option2: "Black", price: "627.00", available: false },
 ]);
 assert.equal(r.price, 627);
 assert.equal(r.variant?.id, 1);
 assert.deepEqual(r.variants, [
  { sourceVariantId: "1", size: "S", color: null, priceCents: 62700, available: true },
  { sourceVariantId: "2", size: "M", color: "Black", priceCents: 62700, available: false },
 ]);
});

test("public feed — a one-option listing keeps its old mapping, so no store's items all register as changed", () => {
 // The size here has always been "Default Title" (the feed's option1). Tidying it would make every
 // one-option item in every store look different to the next sync, and rewrite all of them.
 const r = feedProductPricing([{ id: 5, title: "Default Title", option1: "Default Title", option2: null, price: "90.00", available: true }]);
 assert.equal(r.price, 90);
 assert.equal(r.variant?.id, 5);
 assert.deepEqual(r.variants, [{ sourceVariantId: "5", size: "Default Title", color: null, priceCents: 9000, available: true }]);
});

test("public feed — a variant with no price string is unpriced, as before", () => {
 const r = feedProductPricing([{ id: 8, title: "Default Title", option1: "Default Title", option2: null, available: true }]);
 assert.equal(r.price, null);
 assert.equal(r.variants?.[0].priceCents, null);
});

// Regression: a letter size must not match the first letter of a following word.
// Vintage shoe listings say "Size: Marked 36" — this used to return "M" (the M of
// "Marked"), mislabeling heels as size M. It must NOT, while real letters still work.
test("extractSizeFromDescription — 'Size: Marked NN' does not return the M of Marked", () => {
 assert.equal(extractSizeFromDescription("Material: leather. Size: Marked 36 - TTS US 6"), null);
 assert.equal(extractSizeFromDescription("Size: Marked 34.5, insole 9in"), null);
});

test("extractSizeFromDescription — real labeled sizes still extract", () => {
 assert.equal(extractSizeFromDescription("Lovely silk top. Size: M. Fits great."), "M");
 assert.equal(extractSizeFromDescription("Size: Medium"), "M");
 assert.equal(extractSizeFromDescription("Size: 8"), "8");
 assert.equal(extractSizeFromDescription("Tagged size: EU 38"), "EU 38");
});

test("extractFitLetterFromDescription — the IT-54 cow-print case (Best Fit M - XL)", () => {
 const desc = "<p>Label: IT54</p><p>Best Fit M - XL (depending on desired fit)</p>";
 assert.equal(extractFitLetterFromDescription(desc), "M-XL");
});

test("extractFitLetterFromDescription — single and word fits", () => {
 assert.equal(extractFitLetterFromDescription("Fits like a large"), "L");
 assert.equal(extractFitLetterFromDescription("Best fit small"), "S");
 assert.equal(extractFitLetterFromDescription("Fit: M-L"), "M-L");
 assert.equal(extractFitLetterFromDescription("best fits medium to large"), "M-L");
 assert.equal(extractFitLetterFromDescription("Best Fit XS-S"), "XS-S");
});

test("extractFitLetterFromDescription — conservative: never guesses", () => {
 assert.equal(extractFitLetterFromDescription("Runs small"), null); // not an explicit fit statement
 assert.equal(extractFitLetterFromDescription("Fits like a glove"), null); // 'glove' isn't a size
 assert.equal(extractFitLetterFromDescription("A beautiful medium-weight wool coat"), null);
 assert.equal(extractFitLetterFromDescription("Label: IT 54"), null); // a tag, not a fit
 // "Fit: Labeled IT" must NOT read the L of "Labeled" as size Large (real bug:
 // a "- XS" dress showed Large because of this).
 assert.equal(extractFitLetterFromDescription("Fit: Labeled IT. Recommended for a modern size extra small."), null);
 assert.equal(extractFitLetterFromDescription("Fit: Material is silk"), null); // M of "Material"
 assert.equal(extractFitLetterFromDescription(""), null);
 assert.equal(extractFitLetterFromDescription(null), null);
});
