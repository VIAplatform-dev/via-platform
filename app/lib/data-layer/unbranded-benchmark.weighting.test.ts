import { test } from "node:test";
import assert from "node:assert/strict";
import { weightedQuantile, effectiveN, weightOf } from "./unbranded-benchmark-db.ts";

// A weighted median is easy to get subtly wrong in a way that still returns a plausible number,
// which is the worst kind of wrong for a pricing anchor.

test("with equal weights it is just the median", () => {
 const pts = [10, 20, 30, 40, 50].map((p) => ({ priceCents: p, w: 1 }));
 assert.equal(weightedQuantile(pts, 0.5), 30);
});

test("recent sales pull the anchor towards themselves", () => {
 // Four old cheap sales and two recent expensive ones. Unweighted the median sits with the cheap
 // pile; weighted, the recent pair carries enough to move it.
 const pts = [
  { priceCents: 100, w: 0.1 }, { priceCents: 110, w: 0.1 },
  { priceCents: 120, w: 0.1 }, { priceCents: 130, w: 0.1 },
  { priceCents: 400, w: 1 }, { priceCents: 420, w: 1 },
 ];
 assert.equal(weightedQuantile(pts, 0.5), 400);
});

test("a single sale is its own median", () => {
 assert.equal(weightedQuantile([{ priceCents: 250, w: 0.3 }], 0.5), 250);
});

test("weights that have all decayed to nothing still return a number rather than zero", () => {
 const pts = [{ priceCents: 100, w: 0 }, { priceCents: 200, w: 0 }, { priceCents: 300, w: 0 }];
 assert.equal(weightedQuantile(pts, 0.5), 200);
});

test("an empty set is zero, not a crash", () => {
 assert.equal(weightedQuantile([], 0.5), 0);
});

test("a sale halves in weight every half-life", () => {
 assert.equal(weightOf(0), 1);
 assert.ok(Math.abs(weightOf(180) - 0.5) < 1e-9);
 assert.ok(Math.abs(weightOf(360) - 0.25) < 1e-9);
 assert.equal(weightOf(-5), 1, "a future-dated row is treated as today, never boosted above 1");
});

test("effective sample size is the honest count the floor is applied to", () => {
 // Ten fresh sales really are worth ten.
 assert.ok(Math.abs(effectiveN(Array(10).fill(1)) - 10) < 1e-9);
 // Forty sales that have all decayed are worth far fewer than forty — which is the whole point:
 // a raw "n >= 5" check would pass a segment carrying almost no weight.
 const stale = Array(40).fill(0.02);
 assert.ok(Math.abs(effectiveN(stale) - 40) < 1e-9, "uniform weights, however small, still count as their number");
 // One recent sale beside forty ancient ones is NOT worth forty-one.
 const lopsided = [1, ...Array(40).fill(0.01)];
 assert.ok(effectiveN(lopsided) < 5, `lopsided weights collapse the effective count (got ${effectiveN(lopsided).toFixed(1)})`);
});
