import { test } from "node:test";
import assert from "node:assert/strict";
import { floorFor, floorMissFor, describeFloorMiss } from "./price-floor.ts";

test("the floor is cost plus the markup — the same numbers the server gets", () => {
  // Lifted from app/lib/price-floor-core.test.ts. If these ever diverge, a piece raised on the phone
  // and the same piece raised on the web end up at different prices.
  assert.equal(floorFor(10_000, 3000), 13_000);
  assert.equal(floorFor(10_000, 0), 10_000);
  assert.equal(floorFor(4_500, 10000), 9_000);
});

test("a piece under its floor comes back with what it is short by", () => {
  assert.deepEqual(floorMissFor(11_000, 10_000, 3000), {
    priceCents: 11_000, costCents: 10_000, floorCents: 13_000, shortCents: 2_000,
  });
});

test("a piece at or above its floor is not a miss", () => {
  assert.equal(floorMissFor(13_000, 10_000, 3000), null);
  assert.equal(floorMissFor(40_000, 10_000, 3000), null);
});

test("no cost is not a miss — a floor over an unknown cost is not a floor", () => {
  assert.equal(floorMissFor(500, null, 3000), null);
  assert.equal(floorMissFor(500, undefined, 3000), null);
  assert.equal(floorMissFor(500, 0, 3000), null);
});

test("an unpriced draft is not a miss — it has not been priced wrongly yet", () => {
  assert.equal(floorMissFor(0, 10_000, 3000), null);
  assert.equal(floorMissFor(null, 10_000, 3000), null);
});

test("a markup that hasn't loaded yet stays silent rather than flooring at cost", () => {
  // The Review screen asks /api/store/pricing for this. Until it answers there is no floor to be
  // under, and warning off a guessed 0% would accuse her of underpricing on no evidence.
  assert.equal(floorMissFor(9_000, 10_000, null), null);
  assert.equal(floorMissFor(9_000, 10_000, undefined), null);
  assert.equal(floorMissFor(9_000, 10_000, Number.NaN), null);
});

test("a zero markup still floors at cost — selling under cost is the thing being caught", () => {
  const m = floorMissFor(9_000, 10_000, 0);
  assert.equal(m?.floorCents, 10_000);
  assert.equal(m?.shortCents, 1_000);
});

test("a cost typed with pennies floors on the pennies", () => {
  // Review holds cost as typed text ("34.50"), so the screen converts to cents before asking.
  assert.equal(floorFor(3_450, 3000), 4_485);
  assert.equal(floorMissFor(4_400, 3_450, 3000)?.shortCents, 85);
});

test("the sentence names her markup, what she paid and where the floor lands", () => {
  const m = floorMissFor(4_000, 5_000, 3000)!;
  assert.equal(
    describeFloorMiss(m, 3000, "USD"),
    "Below your pricing floor — your 30% minimum over the $50 you paid works out at $65.",
  );
  assert.equal(
    describeFloorMiss(m, 3000, "GBP"),
    "Below your pricing floor — your 30% minimum over the £50 you paid works out at £65.",
  );
});
