import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyShortfall, describeShortfall, isDeclared } from "./shipping-shortfall.ts";

const measured = { weightOz: 32, lengthIn: 14, widthIn: 10, heightIn: 4 };
const blank = { weightOz: null, lengthIn: null, widthIn: null, heightIn: null };

test("a label that came in under the postage is not a shortfall", () => {
 const s = classifyShortfall({ paidCents: 1400, labelCostCents: 900, items: [measured] });
 assert.equal(s.shortfallCents, 0);
 assert.equal(s.recoverable, false);
});

test("an unmeasured piece is the seller's, and it is the one she can prevent", () => {
 // The quote came off a category guess and the box did not. Review warns her about exactly this.
 const s = classifyShortfall({ paidCents: 800, labelCostCents: 3100, items: [blank] });
 assert.equal(s.shortfallCents, 2300);
 assert.equal(s.cause, "unmeasured");
 assert.equal(s.recoverable, true);
 assert.match(s.note, /no weight or measurements|had a weight/);
});

test("one unmeasured piece in a box of measured ones still counts, and says how many", () => {
 const s = classifyShortfall({ paidCents: 1400, labelCostCents: 2000, items: [measured, blank, measured] });
 assert.equal(s.cause, "unmeasured");
 assert.equal(s.recoverable, true);
 assert.match(s.note, /1 of 3 pieces/);
});

test("a measured single piece that still fell short is VYA's pricing, not her fault", () => {
 // The distinction the old ops email could not make: both reasons produced the same sentence.
 const s = classifyShortfall({ paidCents: 1400, labelCostCents: 1900, items: [measured] });
 assert.equal(s.cause, "pricing");
 assert.equal(s.recoverable, false);
 assert.match(s.note, /thin/);
});

test("several measured pieces in one box is VYA's arithmetic, not her declaration", () => {
 const s = classifyShortfall({ paidCents: 1400, labelCostCents: 2400, items: [measured, measured] });
 assert.equal(s.cause, "combined-parcel");
 assert.equal(s.recoverable, false);
});

test("a carrier re-rate is hers by definition", () => {
 // The carrier weighed the parcel and disagreed with what she wrote on it. Measured or not.
 const s = classifyShortfall({ paidCents: 800, labelCostCents: 2600, items: [measured], fromCarrierAdjustment: true });
 assert.equal(s.cause, "carrier-adjustment");
 assert.equal(s.recoverable, true);
 assert.equal(s.shortfallCents, 1800);
});

test("junk figures never invent a debt", () => {
 for (const bad of [null, undefined, NaN, -100, "lots"]) {
  const s = classifyShortfall({ paidCents: 1400, labelCostCents: bad as number, items: [measured] });
  assert.equal(s.shortfallCents, 0, String(bad));
  assert.equal(s.recoverable, false, String(bad));
 }
 // A missing paid figure does not make the whole label recoverable from her either.
 const noPaid = classifyShortfall({ paidCents: null, labelCostCents: 2000, items: [measured] });
 assert.equal(noPaid.shortfallCents, 2000);
 assert.equal(noPaid.recoverable, false, "a measured piece is never her fault");
});

test("measured means one real figure, not all four", () => {
 assert.equal(isDeclared({ weightOz: 12 }), true);
 assert.equal(isDeclared({ lengthIn: 10, widthIn: 8, heightIn: 3 }), true);
 assert.equal(isDeclared(blank), false);
 assert.equal(isDeclared({ weightOz: 0, lengthIn: 0 }), false);
});

test("the ledger line says the amount and whose it is", () => {
 const money = (c: number) => `£${(c / 100).toFixed(2)}`;
 const hers = classifyShortfall({ paidCents: 800, labelCostCents: 3100, items: [blank] });
 assert.match(describeShortfall(hers, money), /^£23\.00 to recover from the seller/);
 const ours = classifyShortfall({ paidCents: 1400, labelCostCents: 1900, items: [measured] });
 assert.match(describeShortfall(ours, money), /^£5\.00 ours to absorb/);
 assert.equal(describeShortfall(classifyShortfall({ paidCents: 1400, labelCostCents: 900, items: [measured] }), money), "No shortfall.");
});
