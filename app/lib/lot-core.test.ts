import { test } from "node:test";
import assert from "node:assert/strict";
import { splitLotCost, newLotId, parseAcquiredAt, todayISO } from "./lot-core.ts";

test("an equal split hands the remainder pennies to the first pieces", () => {
 // £100 across 3 → 33.34 / 33.33 / 33.33, and the total is exactly what she paid.
 assert.deepEqual(splitLotCost(10_000, ["a", "b", "c"]), { a: 3334, b: 3333, c: 3333 });
 assert.deepEqual(splitLotCost(10, ["a", "b", "c", "d"]), { a: 3, b: 3, c: 2, d: 2 });
});

test("with prices, the lot is split in proportion to what each piece will sell for", () => {
 // A £200 coat and a £50 scarf bought together for £100: the coat carries four fifths of it.
 assert.deepEqual(splitLotCost(10_000, ["coat", "scarf"], { coat: 20_000, scarf: 5_000 }), { coat: 8000, scarf: 2000 });
});

test("a proportional split still sums to the total, remainder to the first", () => {
 const out = splitLotCost(10_000, ["a", "b", "c"], { a: 100, b: 100, c: 100 });
 assert.equal(out.a + out.b + out.c, 10_000);
 assert.deepEqual(out, { a: 3334, b: 3333, c: 3333 });
 // Odd weights: 1000 across 3:1:1 → 600 / 200 / 200.
 assert.deepEqual(splitLotCost(1000, ["a", "b", "c"], { a: 3, b: 1, c: 1 }), { a: 600, b: 200, c: 200 });
});

test("pieces without a price fall back to an equal split (a zero weight would starve them)", () => {
 assert.deepEqual(splitLotCost(300, ["a", "b", "c"], { a: 100 }), { a: 100, b: 100, c: 100 });
 assert.deepEqual(splitLotCost(300, ["a", "b", "c"], { a: 0, b: 0, c: 0 }), { a: 100, b: 100, c: 100 });
});

test("nothing to split gives nothing, never NaN or a negative", () => {
 assert.deepEqual(splitLotCost(1000, []), {});
 assert.deepEqual(splitLotCost(0, ["a", "b"]), { a: 0, b: 0 });
 assert.deepEqual(splitLotCost(-50, ["a"]), { a: 0 });
 assert.deepEqual(splitLotCost(10.7, ["a"]), { a: 11 });
});

test("lot ids are short, random and distinct", () => {
 const a = newLotId(), b = newLotId();
 assert.match(a, /^lot_[a-z0-9]{10,}$/);
 assert.notEqual(a, b);
});

test("an acquired date is a plain YYYY-MM-DD or nothing", () => {
 assert.equal(parseAcquiredAt("2026-09-07"), "2026-09-07");
 assert.equal(parseAcquiredAt("2026-09-07T10:00:00.000Z"), "2026-09-07");
 assert.equal(parseAcquiredAt("last tuesday"), null);
 assert.equal(parseAcquiredAt(""), null);
 assert.equal(parseAcquiredAt(null), null);
});

test("today is a plain date the acquired_at column accepts", () => {
 assert.equal(todayISO(new Date("2026-09-07T23:30:00.000Z")), "2026-09-07");
 assert.equal(parseAcquiredAt(todayISO()), todayISO());
});
