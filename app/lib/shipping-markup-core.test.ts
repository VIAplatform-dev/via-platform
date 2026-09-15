import { test } from "node:test";
import assert from "node:assert";
import {
  buyerShippingCents, markupMarginCents, bindingRule, quoteFromRate, DEFAULT_MARKUP,
} from "./shipping-markup-core.ts";

test("the buyer is never quoted less than the label costs", () => {
  // The whole reason for the change: the flat $24 Large tier lost $7.07 coast-to-coast.
  for (const cost of [1, 99, 568, 600, 695, 1005, 1402, 3107, 4971, 12000]) {
    assert.ok(buyerShippingCents(cost) > cost, `cost ${cost} quoted ${buyerShippingCents(cost)}`);
    assert.ok(markupMarginCents(cost) > 0, `cost ${cost}`);
  }
});

test("near buyers pay less than far buyers, which flat pricing could never do", () => {
  // Large coat: $14.02 across town, $31.07 coast to coast. Under the flat tier both paid $24.
  assert.ok(buyerShippingCents(1402) < buyerShippingCents(3107));
  assert.ok(buyerShippingCents(1402) < 2400, "a near large parcel should now beat the old $24");
});

test("quotes are whole units, always rounded up", () => {
  for (const cost of [568, 600, 695, 1005, 1402, 3107]) {
    const q = buyerShippingCents(cost);
    assert.equal(q % 100, 0, `${q} is not a whole unit`);
    assert.ok(q >= cost + DEFAULT_MARKUP.minMarginCents || q >= cost * (1 + DEFAULT_MARKUP.pct));
  }
  // 15% of $12.00 is $13.80 -> $14. Rounding DOWN to $13 would hand back part of the margin.
  assert.equal(buyerShippingCents(1200), 1400);
});

test("the floor carries cheap postage, where a percentage earns nothing", () => {
  // 15% of $6.00 is 90c. Less than the card fee on the same $6.
  assert.equal(bindingRule(600), "floor");
  assert.ok(markupMarginCents(600) >= DEFAULT_MARKUP.minMarginCents);
  // On expensive postage the percentage takes over.
  assert.equal(bindingRule(3107), "pct");
});

test("margin scales with cost instead of being a windfall on one size", () => {
  const cheap = markupMarginCents(600);
  const dear = markupMarginCents(3107);
  assert.ok(dear > cheap, "a dearer label should earn more, but not 10x more");
  // And never the $10 windfall that made a near-zone coat feel like a rip-off.
  assert.ok(markupMarginCents(1402) < 700, `margin was ${markupMarginCents(1402)}`);
});

test("zero and nonsense costs quote zero rather than a bare markup", () => {
  assert.equal(buyerShippingCents(0), 0);
  assert.equal(buyerShippingCents(-500), 0);
});

test("a quote carries what the buyer needs to choose", () => {
  const fast = quoteFromRate({ amountCents: 1608, estDays: 2 });
  const slow = quoteFromRate({ amountCents: 1005, estDays: 5 });
  assert.equal(fast.service, "Express");
  assert.equal(slow.service, "Standard");
  assert.ok(fast.buyerPaysCents > slow.buyerPaysCents);
  assert.equal(slow.estDays, 5);
});

test("the carrier's name never reaches the buyer", () => {
  // She bought from the store, not from USPS. Naming the carrier invites "why isn't it their price?"
  const q = quoteFromRate({ amountCents: 1005, provider: "USPS", service: "Ground Advantage", estDays: 5 });
  assert.ok(!/usps|ground advantage/i.test(q.service), q.service);
});

test("a custom policy is honoured end to end", () => {
  const tenPct = { pct: 0.10, minMarginCents: 0 };
  assert.equal(buyerShippingCents(1200, tenPct), 1400); // 13.20 -> ceil 14
  assert.equal(buyerShippingCents(3107, tenPct), 3500); // 34.18 -> ceil 35
  assert.equal(bindingRule(600, tenPct), "pct");
});
