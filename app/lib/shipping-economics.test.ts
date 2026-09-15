import { test } from "node:test";
import assert from "node:assert";
import {
  tierEconomics, allTierEconomics, breakEvenPriceCents, expeditedCostCents,
  expeditedPriceCents, storeCostRangeCents, storeCostForParcel, storeCostLine,
  MEASURED_COST_CENTS, EXPEDITED_MULTIPLIER,
} from "./shipping-economics.ts";
import { SHIPPING_TIERS, MIN_MARGIN_CENTS } from "./shipping-tiers.ts";

test("the Large tier loses money to the far coast. The finding this file exists for", () => {
  const large = tierEconomics("large");
  assert.ok(large.losesMoneyFar, "large should be flagged as loss-making far");
  assert.ok(large.marginFarCents < 0, `margin was ${large.marginFarCents}`);
  // Healthy across town, underwater cross-country: exactly the trap a flat national price sets.
  assert.ok(large.marginNearCents > 0);
});

test("Small is thin far, Medium is the only healthy one end to end", () => {
  assert.ok(tierEconomics("small").marginFarCents < MIN_MARGIN_CENTS, "small should be under target far");
  assert.ok(!tierEconomics("small").losesMoneyFar, "small is thin, not loss-making");
  assert.ok(tierEconomics("medium").healthy, "medium should clear target far");
});

test("break-even clears the target and lands on a whole dollar", () => {
  assert.equal(breakEvenPriceCents(3107), 3400); // 31.07 + 2.50 -> 34.00
  assert.equal(breakEvenPriceCents(600), 900);
  for (const cost of [1, 599, 1402, 3107, 9999]) {
    const p = breakEvenPriceCents(cost);
    assert.equal(p % 100, 0, `${p} is not a whole unit`);
    assert.ok(p - cost >= MIN_MARGIN_CENTS, `${p} - ${cost} < target`);
  }
});

test("every tier gets a break-even price that would actually fix it", () => {
  for (const e of allTierEconomics()) {
    assert.ok(e.breakEvenPriceCents - e.costFarCents >= MIN_MARGIN_CENTS, e.label);
  }
  // And Large's is meaningfully above what the buyer pays today, which is the recommendation.
  assert.ok(tierEconomics("large").breakEvenPriceCents > tierEconomics("large").buyerPaysCents);
});

test("expedited is priced off the FAR zone, never an average", () => {
  // Pricing one flat national rate off an average is how Large ended up $7 down.
  for (const t of SHIPPING_TIERS) {
    const price = expeditedPriceCents(t.id);
    assert.ok(price - expeditedCostCents(t.id, "far") >= MIN_MARGIN_CENTS, t.id);
    assert.ok(price - expeditedCostCents(t.id, "near") >= MIN_MARGIN_CENTS, t.id);
  }
});

test("expedited always costs more than ground, and is always priced above it", () => {
  assert.ok(EXPEDITED_MULTIPLIER > 1);
  for (const t of SHIPPING_TIERS) {
    for (const zone of ["near", "far"] as const) {
      assert.ok(expeditedCostCents(t.id, zone) > MEASURED_COST_CENTS[t.id][zone], `${t.id}/${zone}`);
    }
    assert.ok(expeditedPriceCents(t.id) > t.priceCents, `expedited ${t.id} should beat the standard price`);
  }
});

test("a store is shown a RANGE, because it cannot know where the buyer is", () => {
  const r = storeCostRangeCents("medium");
  assert.equal(r.lowCents, MEASURED_COST_CENTS.medium.near);
  assert.equal(r.highCents, MEASURED_COST_CENTS.medium.far);
  assert.ok(r.highCents > r.lowCents, "a single number here would be a promise we can't keep");
});

test("the store cost follows the parcel, through the same tiering as the buyer price", () => {
  assert.equal(storeCostForParcel({ weightOz: 12, lengthIn: 10, widthIn: 13, heightIn: 1 }).tierId, "small");
  assert.equal(storeCostForParcel({ weightOz: 90, lengthIn: 20, widthIn: 16, heightIn: 10 }).tierId, "large");
  // No dimensions at all falls to the safe middle, same as the buyer-facing tiering.
  assert.equal(storeCostForParcel(null).tierId, "medium");
});

test("the line a store reads names both ends and says why", () => {
  const line = storeCostLine("large");
  assert.match(line, /\$14\.02/);
  assert.match(line, /\$31\.07/);
  assert.match(line, /how far/);
  assert.match(storeCostLine("small", "GBP"), /£/);
});

test("measured costs cover every tier, in both zones, and rise with distance", () => {
  for (const t of SHIPPING_TIERS) {
    const m = MEASURED_COST_CENTS[t.id];
    assert.ok(m, `${t.id} has no measured cost`);
    assert.ok(m.near > 0 && m.far > 0, t.id);
    assert.ok(m.far >= m.near, `${t.id}: far should never be cheaper than near`);
  }
});
