import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCostAcross } from "./cost-split.ts";

// Splitting one payment across several pieces. What matters is that it lands on the penny: a
// seller reconciles these against a bank statement.

test("an equal split hands the remainder pennies to the first pieces", () => {
 // £100 across 3 → 33.34 / 33.33 / 33.33, and the total is exactly what she paid.
 assert.deepEqual(splitCostAcross(10_000, ["a", "b", "c"]), { a: 3334, b: 3333, c: 3333 });
 assert.deepEqual(splitCostAcross(10, ["a", "b", "c", "d"]), { a: 3, b: 3, c: 2, d: 2 });
});

test("with prices, the cost is split in proportion to what each piece will sell for", () => {
 // A £200 coat and a £50 scarf bought together for £100: the coat carries four fifths of it.
 assert.deepEqual(splitCostAcross(10_000, ["coat", "scarf"], { coat: 20_000, scarf: 5_000 }), { coat: 8000, scarf: 2000 });
});

test("a proportional split still sums to the total, remainder to the first", () => {
 const out = splitCostAcross(10_000, ["a", "b", "c"], { a: 100, b: 100, c: 100 });
 assert.equal(out.a + out.b + out.c, 10_000);
 assert.deepEqual(out, { a: 3334, b: 3333, c: 3333 });
 // Odd weights: 1000 across 3:1:1 → 600 / 200 / 200.
 assert.deepEqual(splitCostAcross(1000, ["a", "b", "c"], { a: 3, b: 1, c: 1 }), { a: 600, b: 200, c: 200 });
});

test("pieces without a price fall back to an equal split (a zero weight would starve them)", () => {
 assert.deepEqual(splitCostAcross(300, ["a", "b", "c"], { a: 100 }), { a: 100, b: 100, c: 100 });
 assert.deepEqual(splitCostAcross(300, ["a", "b", "c"], { a: 0, b: 0, c: 0 }), { a: 100, b: 100, c: 100 });
});

test("nothing to split gives nothing, never NaN or a negative", () => {
 assert.deepEqual(splitCostAcross(1000, []), {});
 assert.deepEqual(splitCostAcross(0, ["a", "b"]), { a: 0, b: 0 });
 assert.deepEqual(splitCostAcross(-50, ["a"]), { a: 0 });
 assert.deepEqual(splitCostAcross(10.7, ["a"]), { a: 11 });
});
