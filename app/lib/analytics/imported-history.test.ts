import { test } from "node:test";
import assert from "node:assert/strict";
import { countsAsSale, mergeByDay, mergeRecent } from "./imported-history.ts";

test("a refunded or cancelled row is not revenue", () => {
 for (const s of ["refunded", "Refunded", "partially_refunded", "cancelled", "canceled", "voided", "chargeback", "declined", "payment failed", "pending", "unpaid", "abandoned"]) {
  assert.equal(countsAsSale(s), false, s);
 }
});

test("an ordinary sale counts, in whatever spelling the export used", () => {
 for (const s of ["paid", "Paid", "fulfilled", "complete", "COMPLETED", "success"]) {
  assert.equal(countsAsSale(s), true, s);
 }
});

test("an unrecognised or missing status counts", () => {
 // A blank status on a row that has a total is far more likely an ordinary sale than a refund, and
 // dropping real revenue is the worse mistake. A seller notices money missing, not money present.
 assert.equal(countsAsSale(null), true);
 assert.equal(countsAsSale(""), true);
 assert.equal(countsAsSale("   "), true);
 assert.equal(countsAsSale("something-new-shopify-invented"), true);
});

test("the revenue chart is one line, summed per day", () => {
 const vya = [{ day: "03-01", cents: 1000 }, { day: "03-03", cents: 500 }];
 const imported = [{ day: "03-01", cents: 4000 }, { day: "03-02", cents: 250 }];
 assert.deepEqual(mergeByDay(vya, imported), [
  { day: "03-01", cents: 5000 },
  { day: "03-02", cents: 250 },
  { day: "03-03", cents: 500 },
 ]);
});

test("merging handles an empty or missing side", () => {
 const one = [{ day: "03-01", cents: 100 }];
 assert.deepEqual(mergeByDay(one, []), one);
 assert.deepEqual(mergeByDay([], one), one);
 assert.deepEqual(mergeByDay(null as never, one), one);
 assert.deepEqual(mergeByDay([], []), []);
 // A day with no date is not a day.
 assert.deepEqual(mergeByDay([{ day: "", cents: 9 }], one), one);
});

test("recent sales interleave by date, newest first", () => {
 const vya = [{ title: "VYA sale", amountCents: 100, at: "2026-03-05T00:00:00Z" }];
 const imported = [
  { title: "Shopify sale", amountCents: 200, at: "2026-03-06T00:00:00Z" },
  { title: "Older", amountCents: 300, at: "2026-03-01T00:00:00Z" },
 ];
 assert.deepEqual(mergeRecent(vya, imported, 6).map((s) => s.title), ["Shopify sale", "VYA sale", "Older"]);
 assert.equal(mergeRecent(vya, imported, 2).length, 2);
});

test("an undated row sorts last, never first", () => {
 // Imported exports routinely have a blank date column; one of those must not take the top of
 // "recent sales" and make the dashboard look stale.
 const out = mergeRecent(
  [{ title: "dated", amountCents: 1, at: "2026-03-05T00:00:00Z" }],
  [{ title: "undated", amountCents: 1, at: null }],
  6,
 );
 assert.deepEqual(out.map((s) => s.title), ["dated", "undated"]);
});
