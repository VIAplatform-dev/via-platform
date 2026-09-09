import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCostAcross, batchCostLine } from "./cost-split.ts";

test("an equal split hands the remainder pennies to the first pieces (same as the server)", () => {
  assert.deepEqual(splitCostAcross(10_000, ["a", "b", "c"]), { a: 3334, b: 3333, c: 3333 });
  assert.deepEqual(splitCostAcross(10, ["a", "b", "c", "d"]), { a: 3, b: 3, c: 2, d: 2 });
});

test("with prices the lot follows the prices; missing prices fall back to equal", () => {
  assert.deepEqual(splitCostAcross(10_000, ["coat", "scarf"], { coat: 20_000, scarf: 5_000 }), { coat: 8000, scarf: 2000 });
  assert.deepEqual(splitCostAcross(300, ["a", "b", "c"], { a: 100 }), { a: 100, b: 100, c: 100 });
});

test("nothing to split gives nothing", () => {
  assert.deepEqual(splitCostAcross(1000, []), {});
  assert.deepEqual(splitCostAcross(0, ["a"]), { a: 0 });
});

test("the line under the batch cost says what each piece will carry", () => {
  assert.equal(batchCostLine(3, 10_000, "GBP"), "£33.33 each, give or take a penny");
  assert.equal(batchCostLine(0, 10_000, "GBP"), null);
  assert.equal(batchCostLine(3, 0, "GBP"), null);
});
