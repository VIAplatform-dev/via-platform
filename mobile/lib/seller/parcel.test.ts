import { test } from "node:test";
import assert from "node:assert/strict";
import { tierForWeight, parcelMismatch, describeParcel, defaultParcelFor, TIERS } from "./parcel.ts";

// Mirror of app/lib/parcel-core.ts. The thresholds are copied from app/lib/shipping-tiers.ts —
// if those move, these must move with them, and the test below pins the numbers.

test("the tier thresholds match the server's (small ≤ 16 oz, medium ≤ 48 oz)", () => {
  assert.deepEqual(TIERS.map((t) => [t.id, t.maxWeightOz]), [["small", 16], ["medium", 48], ["large", Infinity]]);
  assert.equal(tierForWeight(16), "small");
  assert.equal(tierForWeight(17), "medium");
  assert.equal(tierForWeight(49), "large");
  assert.equal(tierForWeight(null), null);
  assert.equal(tierForWeight(0), null);
});

test("category defaults agree with the server: a coat is large, a dress medium, a scarf small", () => {
  assert.deepEqual(defaultParcelFor("coats-jackets"), { tier: "large", weightOz: 52 });
  assert.deepEqual(defaultParcelFor("coat"), { tier: "large", weightOz: 52 });
  assert.deepEqual(defaultParcelFor("dresses"), { tier: "medium", weightOz: 18 });
  assert.deepEqual(defaultParcelFor("scarf"), { tier: "small", weightOz: 6 });
  assert.deepEqual(defaultParcelFor(undefined), { tier: "medium", weightOz: 20 });
});

test("a mismatch only when the tiers differ, worded for the phone's one line", () => {
  assert.equal(parcelMismatch({ typedWeightOz: 20, estimate: { tier: "medium", weightOz: 24, source: "ai" } }), null);
  assert.equal(parcelMismatch({ typedWeightOz: null, estimate: { tier: "large", weightOz: 52, source: "ai" } }), null);
  const m = parcelMismatch({ typedWeightOz: 8, estimate: { tier: "large", weightOz: 52, source: "ai" }, category: "coats-jackets" });
  assert.equal(m?.message, "You typed 8 oz, but this looks like a coat (large parcel). Buyers get quoted the small tier and you pay the difference.");
});

test("describeParcel reads as the Review row", () => {
  assert.equal(describeParcel("medium", 32), "Medium parcel · ~2 lb");
  assert.equal(describeParcel("small", 8), "Small parcel · 8 oz");
  assert.equal(describeParcel("large", null), "Large parcel");
});
