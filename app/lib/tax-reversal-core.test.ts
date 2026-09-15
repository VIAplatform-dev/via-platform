import { test } from "node:test";
import assert from "node:assert/strict";
import { taxReversalFor } from "./tax-reversal-core.ts";

const base = { fullChargeCents: 12000, refundAmountCents: 12000, sharedIntent: false, taxCollected: true };

test("a clean full refund reverses the tax", () => {
 assert.equal(taxReversalFor(base), "full");
 // Over-refunded (goodwill) is still full.
 assert.equal(taxReversalFor({ ...base, refundAmountCents: 13000 }), "full");
});

test("a kept fee means part of the tax is still owed, so we do not guess", () => {
 // THE BUG THIS PREVENTS. Reversing in full here hands the seller back tax she is still holding on
 // the restocking fee the buyer paid.
 assert.equal(taxReversalFor({ ...base, refundAmountCents: 10800 }), "manual");
 assert.equal(taxReversalFor({ ...base, refundAmountCents: 0 }), "manual");
});

test("one piece out of a bag does not reverse the whole bag's tax", () => {
 // Orders are one row per PIECE and a bag of three is one PaymentIntent and one tax transaction.
 assert.equal(taxReversalFor({ ...base, sharedIntent: true }), "manual");
 assert.equal(taxReversalFor({ ...base, sharedIntent: true, siblingsAllRefunded: false }), "manual");
 // Once the last piece goes back, the whole transaction can be reversed.
 assert.equal(taxReversalFor({ ...base, sharedIntent: true, siblingsAllRefunded: true }), "full");
});

test("no tax collected, nothing to reverse", () => {
 // A seller with no registrations collects nothing, which is most of them.
 assert.equal(taxReversalFor({ ...base, taxCollected: false }), "none");
 assert.equal(taxReversalFor({ ...base, taxCollected: false, refundAmountCents: 1 }), "none");
});

test("a charge of nothing is never a full reversal", () => {
 // Guards against a zero/absent charge total reading as "refunded in full".
 assert.equal(taxReversalFor({ ...base, fullChargeCents: 0, refundAmountCents: 0 }), "manual");
});
