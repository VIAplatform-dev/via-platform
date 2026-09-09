import { test } from "node:test";
import assert from "node:assert/strict";
import { floorFor, findBelowFloor, describeBelowFloor } from "./price-floor-core.ts";

test("the floor is cost plus the markup", () => {
 assert.equal(floorFor(10_000, 3000), 13_000);
 assert.equal(floorFor(10_000, 0), 10_000);
 assert.equal(floorFor(4_500, 10000), 9_000);
});

test("a piece under its floor is reported with what it is short by", () => {
 const m = findBelowFloor(["a"], { a: 11_000 }, { a: 10_000 }, 3000);
 assert.deepEqual(m, [{ id: "a", priceCents: 11_000, costCents: 10_000, floorCents: 13_000, shortCents: 2_000 }]);
});

test("a piece at or above its floor is not a miss", () => {
 assert.deepEqual(findBelowFloor(["a"], { a: 13_000 }, { a: 10_000 }, 3000), []);
 assert.deepEqual(findBelowFloor(["a"], { a: 40_000 }, { a: 10_000 }, 3000), []);
});

test("no cost is not a miss — a floor over an unknown cost is not a floor", () => {
 assert.deepEqual(findBelowFloor(["a"], { a: 500 }, { a: null }, 3000), []);
 assert.deepEqual(findBelowFloor(["a"], { a: 500 }, {}, 3000), []);
});

test("an unpriced draft is not a miss — it has not been priced wrongly yet", () => {
 assert.deepEqual(findBelowFloor(["a"], { a: 0 }, { a: 10_000 }, 3000), []);
});

test("the worst shortfall is named first", () => {
 const m = findBelowFloor(["a", "b", "c"],
  { a: 12_000, b: 5_000, c: 12_900 },
  { a: 10_000, b: 10_000, c: 10_000 }, 3000);
 assert.deepEqual(m.map((x) => x.id), ["b", "a", "c"]);
});

test("a zero markup still floors at cost — selling under cost is the thing being caught", () => {
 const m = findBelowFloor(["a"], { a: 9_000 }, { a: 10_000 }, 0);
 assert.equal(m[0].floorCents, 10_000);
 assert.equal(m[0].shortCents, 1_000);
});

test("ids not in the maps are skipped, not counted as misses", () => {
 assert.deepEqual(findBelowFloor(["ghost"], {}, {}, 3000), []);
});

test("the sentence counts pieces and speaks in per cent", () => {
 const one = findBelowFloor(["a"], { a: 100 }, { a: 10_000 }, 3000);
 assert.equal(describeBelowFloor(one, 3000), "1 piece is priced below your 30% minimum over what you paid.");
 const two = findBelowFloor(["a", "b"], { a: 100, b: 100 }, { a: 10_000, b: 10_000 }, 3000);
 assert.equal(describeBelowFloor(two, 3000), "2 pieces are priced below your 30% minimum over what you paid.");
 assert.equal(describeBelowFloor([], 3000), "");
});

test("a proportional split is all-or-nothing, which is what the warning should say", () => {
 // Splitting a lot IN PROPORTION TO PRICE gives every piece the same cost:price ratio, so the floor
 // test comes out the same for all of them: either the lot cost more than its prices support, or it
 // did not. Naming "4 of 20" would be nonsense here — it is the lot, not the pieces.
 const prices = { bag: 40_000, tee: 1_200 };
 const share = (id: keyof typeof prices) => Math.floor((34_000 * prices[id]) / (40_000 + 1_200));
 const costs = { bag: share("bag"), tee: share("tee") };
 const misses = findBelowFloor(["bag", "tee"], prices, costs, 3000);
 assert.equal(misses.length, 2, "both, because the ratio is identical");
});

test("a lot cheap enough to clear the floor reports nothing", () => {
 const prices = { bag: 40_000, tee: 1_200 };
 const share = (id: keyof typeof prices) => Math.floor((10_000 * prices[id]) / (40_000 + 1_200));
 assert.deepEqual(findBelowFloor(["bag", "tee"], prices, { bag: share("bag"), tee: share("tee") }, 3000), []);
});

test("an EQUAL split does vary per piece — the cheap ones are the ones that miss", () => {
 // The other real shape: a flat cost each (or a split that fell back to equal because a price was
 // missing). Now the cheap pieces carry a cost their price can't support and the good ones are fine.
 const prices = { bag: 40_000, tee: 1_200, scarf: 900 };
 const costs = { bag: 1_000, tee: 1_000, scarf: 1_000 };
 const misses = findBelowFloor(["bag", "tee", "scarf"], prices, costs, 3000);
 assert.deepEqual(misses.map((m) => m.id), ["scarf", "tee"]); // floor is 1,300 for each
 assert.equal(misses[0].shortCents, 400);
});
