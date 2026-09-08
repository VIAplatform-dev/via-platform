import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultParcelFor, tierForWeight, parcelMismatch, describeParcel, parcelEstimateFrom, resolveParcelAtPublish } from "./parcel-core.ts";
import { SHIPPING_TIERS } from "./shipping-tiers.ts";

test("a category default is honest and short: coats large, dresses medium, scarves small", () => {
 assert.deepEqual(defaultParcelFor("coats-jackets"), { tier: "large", weightOz: 52 });
 assert.deepEqual(defaultParcelFor("Coat"), { tier: "large", weightOz: 52 });
 assert.deepEqual(defaultParcelFor("dresses"), { tier: "medium", weightOz: 18 });
 assert.deepEqual(defaultParcelFor("sweaters"), { tier: "medium", weightOz: 24 });
 assert.deepEqual(defaultParcelFor("tops"), { tier: "small", weightOz: 10 });
 assert.deepEqual(defaultParcelFor("scarves"), { tier: "small", weightOz: 6 });
 assert.deepEqual(defaultParcelFor("jewelry"), { tier: "small", weightOz: 6 });
 assert.deepEqual(defaultParcelFor("boots"), { tier: "large", weightOz: 56 });
 assert.deepEqual(defaultParcelFor("heels"), { tier: "medium", weightOz: 24 });
 assert.deepEqual(defaultParcelFor("handbags"), { tier: "medium", weightOz: 28 });
 assert.deepEqual(defaultParcelFor("jeans"), { tier: "medium", weightOz: 26 });
});

test("an unknown category lands in the safe middle, like assignTier does with no data", () => {
 assert.deepEqual(defaultParcelFor(null), { tier: "medium", weightOz: 20 });
 assert.deepEqual(defaultParcelFor("teapot"), { tier: "medium", weightOz: 20 });
});

test("the category default's weight actually lands in the tier it names", () => {
 for (const c of ["coats-jackets", "dresses", "tops", "scarves", "boots", "handbags", null]) {
  const d = defaultParcelFor(c);
  assert.equal(tierForWeight(d.weightOz, SHIPPING_TIERS), d.tier, String(c));
 }
});

test("tierForWeight uses the tier thresholds; the boundary belongs to the lower tier", () => {
 assert.equal(tierForWeight(8, SHIPPING_TIERS), "small");
 assert.equal(tierForWeight(16, SHIPPING_TIERS), "small");
 assert.equal(tierForWeight(17, SHIPPING_TIERS), "medium");
 assert.equal(tierForWeight(48, SHIPPING_TIERS), "medium");
 assert.equal(tierForWeight(49, SHIPPING_TIERS), "large");
 assert.equal(tierForWeight(0, SHIPPING_TIERS), null);
 assert.equal(tierForWeight(null, SHIPPING_TIERS), null);
});

test("a mismatch is only a mismatch when the tiers differ", () => {
 assert.equal(parcelMismatch({ typedWeightOz: 20, estimate: { tier: "medium", weightOz: 24, source: "ai" } }), null);
 assert.equal(parcelMismatch({ typedWeightOz: null, estimate: { tier: "large", weightOz: 52, source: "ai" } }), null);
 assert.equal(parcelMismatch({ typedWeightOz: 8, estimate: null }), null);
 const m = parcelMismatch({ typedWeightOz: 8, estimate: { tier: "large", weightOz: 52, source: "category" }, category: "coats-jackets" });
 assert.deepEqual(m, {
  typedTier: "small",
  estimatedTier: "large",
  message: "You typed 8 oz, but this looks like a coat (large parcel). Buyers get quoted the small tier and you pay the difference.",
 });
});

test("the mismatch message names the piece when it can, and the tier when it can't", () => {
 const m = parcelMismatch({ typedWeightOz: 60, estimate: { tier: "small", weightOz: 8, source: "ai" } });
 assert.equal(m?.message, "You typed 60 oz, but this looks like a small parcel. Buyers get quoted the large tier — that's more than it needs.");
});

test("describeParcel reads as a label: tier, and the weight in pounds when it's over one", () => {
 assert.equal(describeParcel("medium", 32), "Medium parcel · ~2 lb");
 assert.equal(describeParcel("small", 8), "Small parcel · 8 oz");
 assert.equal(describeParcel("large", 52), "Large parcel · ~3.3 lb");
 assert.equal(describeParcel("medium", null), "Medium parcel");
});

test("the AI's parcel becomes an estimate; junk becomes null", () => {
 assert.deepEqual(parcelEstimateFrom({ weightOz: 40, lengthIn: 16, widthIn: 12, heightIn: 6 }), { tier: "medium", weightOz: 40, lengthIn: 16, widthIn: 12, heightIn: 6, source: "ai" });
 // Bulky but light: girth pushes it up, like assignTier.
 assert.equal(parcelEstimateFrom({ weightOz: 10, lengthIn: 20, widthIn: 14, heightIn: 8 })?.tier, "large");
 assert.equal(parcelEstimateFrom(null), null);
 assert.equal(parcelEstimateFrom({ weightOz: "heavy" }), null);
});

test("at publish: what she typed wins, then the AI, then the category — and the estimate is kept either way", () => {
 const ai = { weightOz: 44, lengthIn: 16, widthIn: 12, heightIn: 6 };
 // Typed weight stands.
 assert.deepEqual(resolveParcelAtPublish({ typed: { weightOz: 20 }, aiParcel: ai, category: "coats-jackets" }).parcel, { weightOz: 20, lengthIn: 16, widthIn: 12, heightIn: 6 });
 // No weight typed → the AI's, dims and all.
 const fromAi = resolveParcelAtPublish({ typed: {}, aiParcel: ai, category: "coats-jackets" });
 assert.deepEqual(fromAi.parcel, { weightOz: 44, lengthIn: 16, widthIn: 12, heightIn: 6 });
 assert.equal(fromAi.estimate?.source, "ai");
 // No AI either → the category default, with box dims that keep it in that tier.
 const fromCat = resolveParcelAtPublish({ typed: {}, aiParcel: null, category: "coats-jackets" });
 assert.equal(fromCat.parcel.weightOz, 52);
 assert.equal(fromCat.estimate?.source, "category");
 assert.equal(fromCat.estimate?.tier, "large");
 // Nothing known at all → the old medium-mailer defaults, but the coat no longer quotes small.
 const none = resolveParcelAtPublish({ typed: {}, aiParcel: null, category: null });
 assert.equal(none.parcel.weightOz, 20);
 assert.equal(tierForWeight(none.parcel.weightOz, SHIPPING_TIERS), "medium");
});
