import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSplitPct, consignorCutCents, ledgerBalanceCents, type SplitRule } from "./consignment-logic.ts";

const rules: SplitRule[] = [
 { minPriceCents: 0, maxPriceCents: 9999, category: null, splitPct: 40 }, // < $100 → 40
 { minPriceCents: 10000, maxPriceCents: 49999, category: null, splitPct: 50 }, // $100–500 → 50
 { minPriceCents: 50000, maxPriceCents: null, category: null, splitPct: 60 }, // $500+ → 60
 { minPriceCents: 10000, maxPriceCents: null, category: "bags", splitPct: 70 }, // bags $100+ → 70
];

test("resolveSplitPct: consignor's own rate always wins", () => {
 assert.equal(resolveSplitPct({ consignorDefaultPct: 65, priceCents: 5000, category: null, rules, storeDefaultPct: 50 }), 65);
});

test("resolveSplitPct: price-band rules", () => {
 assert.equal(resolveSplitPct({ consignorDefaultPct: null, priceCents: 5000, category: "tops", rules, storeDefaultPct: 50 }), 40);
 assert.equal(resolveSplitPct({ consignorDefaultPct: null, priceCents: 25000, category: "tops", rules, storeDefaultPct: 50 }), 50);
 assert.equal(resolveSplitPct({ consignorDefaultPct: null, priceCents: 90000, category: "tops", rules, storeDefaultPct: 50 }), 60);
});

test("resolveSplitPct: category-specific beats catch-all in the same band", () => {
 // A $300 bag matches both the $100–500 catch-all (50) and the bags-$100+ rule (70); bags wins.
 assert.equal(resolveSplitPct({ consignorDefaultPct: null, priceCents: 30000, category: "bags", rules, storeDefaultPct: 50 }), 70);
});

test("resolveSplitPct: store default when nothing matches", () => {
 assert.equal(resolveSplitPct({ consignorDefaultPct: null, priceCents: 5000, category: null, rules: [], storeDefaultPct: 55 }), 55);
});

test("resolveSplitPct: clamps out-of-range percentages", () => {
 assert.equal(resolveSplitPct({ consignorDefaultPct: 140, priceCents: 5000, category: null, rules, storeDefaultPct: 50 }), 100);
});

test("consignorCutCents. Rounds to the nearest cent", () => {
 assert.equal(consignorCutCents(10000, 60), 6000);
 assert.equal(consignorCutCents(9999, 50), 5000); // 4999.5 → 5000
});

test("ledgerBalanceCents. Credits add, payouts/reversals subtract", () => {
 assert.equal(ledgerBalanceCents([{ amountCents: 6000 }, { amountCents: 4000 }, { amountCents: -6000 }]), 4000);
 assert.equal(ledgerBalanceCents([]), 0);
});
