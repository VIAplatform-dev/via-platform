import { test } from "node:test";
import assert from "node:assert/strict";
import { parcelForLabel } from "./parcel-core.ts";
import { SHIPPING_TIERS, assignTier } from "./shipping-tiers.ts";

const priceOf = (id: string) => SHIPPING_TIERS.find((t) => t.id === id)!.priceCents;

test("a massive bag with no measurements does not buy a mailer label", () => {
 // The whole point. The buyer paid the Large tier, so the label is bought as a Large parcel even
 // though the listing never recorded a weight.
 const p = parcelForLabel({ item: {}, shippingPaidCents: priceOf("large") });
 assert.ok(p.weightOz >= 48, `got ${p.weightOz}oz`);
 assert.equal(assignTier(p).id, "large");
});

test("what the buyer paid is a floor the label can't go under", () => {
 for (const id of ["small", "medium", "large"]) {
  const p = parcelForLabel({ item: {}, shippingPaidCents: priceOf(id) });
  assert.equal(assignTier(p).id, id, `paid ${id}`);
 }
});

test("a listing with real measurements uses them", () => {
 const p = parcelForLabel({ item: { weightOz: 90, lengthIn: 22, widthIn: 18, heightIn: 12 }, shippingPaidCents: priceOf("large") });
 assert.equal(p.weightOz, 90);
 assert.equal(p.lengthIn, 22);
});

test("measurements that are smaller than the tier paid for don't shrink the parcel", () => {
 // A heavy coat mis-listed at 4oz shouldn't buy a 4oz label just because someone typed it.
 const p = parcelForLabel({ item: { weightOz: 4, lengthIn: 2, widthIn: 2, heightIn: 1 }, shippingPaidCents: priceOf("large") });
 assert.ok(p.weightOz >= 48);
 assert.equal(assignTier(p).id, "large");
});

test("nonsense measurements are ignored rather than trusted", () => {
 for (const bad of [{ weightOz: 0 }, { weightOz: -5 }, { weightOz: NaN }, { weightOz: null }]) {
  const p = parcelForLabel({ item: bad, shippingPaidCents: priceOf("medium") });
  assert.ok(p.weightOz > 0 && Number.isFinite(p.weightOz), JSON.stringify(bad));
 }
});

test("no measurements and no payment defaults to the middle, not the bottom", () => {
 // Under-buying is the expensive mistake; over-buying costs pennies.
 const p = parcelForLabel({ item: {}, shippingPaidCents: 0 });
 assert.equal(assignTier(p).id, "medium");
 assert.ok(p.weightOz >= 48);
});

test("a payment between tiers counts as the tier it actually covers", () => {
 const between = priceOf("medium") + 100; // paid more than Medium, less than Large
 assert.equal(assignTier(parcelForLabel({ item: {}, shippingPaidCents: between })).id, "medium");
});
