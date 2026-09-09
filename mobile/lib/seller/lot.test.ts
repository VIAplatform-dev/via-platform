import { test } from "node:test";
import assert from "node:assert/strict";
import { splitLotCost, todayISO, lotLine, newLotId } from "./lot.ts";

test("an equal split hands the remainder pennies to the first pieces (same as the server)", () => {
  assert.deepEqual(splitLotCost(10_000, ["a", "b", "c"]), { a: 3334, b: 3333, c: 3333 });
  assert.deepEqual(splitLotCost(10, ["a", "b", "c", "d"]), { a: 3, b: 3, c: 2, d: 2 });
});

test("with prices the lot follows the prices; missing prices fall back to equal", () => {
  assert.deepEqual(splitLotCost(10_000, ["coat", "scarf"], { coat: 20_000, scarf: 5_000 }), { coat: 8000, scarf: 2000 });
  assert.deepEqual(splitLotCost(300, ["a", "b", "c"], { a: 100 }), { a: 100, b: 100, c: 100 });
});

test("nothing to split gives nothing", () => {
  assert.deepEqual(splitLotCost(1000, []), {});
  assert.deepEqual(splitLotCost(0, ["a"]), { a: 0 });
});

test("today is a plain date the server accepts", () => {
  assert.equal(todayISO(new Date("2026-09-07T23:30:00.000Z")), "2026-09-07");
});

test("the line under the batch cost says what each piece will carry", () => {
  assert.equal(lotLine(3, 10_000, "GBP"), "£33.33 each, give or take a penny");
  assert.equal(lotLine(0, 10_000, "GBP"), null);
  assert.equal(lotLine(3, 0, "GBP"), null);
});

test("a lot id has the server's shape, and two batches never share one", () => {
  assert.match(newLotId(), /^lot_[a-z0-9]{12}$/);
  assert.notEqual(newLotId(), newLotId());
  assert.equal(newLotId(() => 0), "lot_aaaaaaaaaaaa");
});
