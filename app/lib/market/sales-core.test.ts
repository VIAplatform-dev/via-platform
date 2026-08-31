import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeSales } from "./sales-core.ts";

test("summarizes count, gross and average, ignoring refunded orders", () => {
 const s = summarizeSales([
 { amountCents: 8500, status: "paid", tender: "cash" },
 { amountCents: 12000, status: "paid", tender: "qr" },
 { amountCents: 5000, status: "refunded", tender: "qr" },
 ]);
 assert.equal(s.count, 2);
 assert.equal(s.grossCents, 20500);
 assert.equal(s.avgCents, 10250);
 assert.equal(s.refundedCount, 1);
 assert.deepEqual(s.byTender, { cash: 8500, qr: 12000 });
});

test("an empty day is all zeros, not NaN", () => {
 const s = summarizeSales([]);
 assert.equal(s.count, 0);
 assert.equal(s.grossCents, 0);
 assert.equal(s.avgCents, 0);
});
