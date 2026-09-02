import test from "node:test";
import assert from "node:assert/strict";
import { consignorCutWithFee, settledThroughVya, estimateMarketplaceFeeCents } from "./consignment-fees.ts";

// This decides what somebody is actually owed, and the payout half decides whether VYA sends its
// own money. Both are worth being paranoid about.

test("a VYA sale is settled through VYA — there is a balance behind the payout", () => {
 for (const ch of ["vya", "storefront", "market", null, undefined, "VYA"]) {
  assert.equal(settledThroughVya(ch), true, String(ch));
 }
});

test("a marketplace sale is NOT settled through VYA", () => {
 // The seller was paid directly by eBay. Paying the consignor from VYA's balance would be VYA
 // spending its own money on a sale it never processed.
 for (const ch of ["ebay", "depop", "etsy", "poshmark", "vinted"]) {
  assert.equal(settledThroughVya(ch), false, ch);
 }
});

test("by default the store absorbs the marketplace fee", () => {
 // $100 sale, 50/50, eBay took $13. The consignor still gets $50 — the store's half carries it.
 const r = consignorCutWithFee(10000, 50, { feeCents: 1300 });
 assert.equal(r.cutCents, 5000);
 assert.equal(r.feeAppliedCents, 0);
 assert.equal(r.baseCents, 10000);
});

test("on a split policy the fee comes off the top, then the split applies", () => {
 // $100 − $13 = $87, halved = $43.50. The store keeps the other $43.50 instead of $37.
 const r = consignorCutWithFee(10000, 50, { feeCents: 1300, policy: "split" });
 assert.equal(r.cutCents, 4350);
 assert.equal(r.feeAppliedCents, 1300);
 assert.equal(r.baseCents, 8700);
});

test("rounding goes the store's way, never inventing money it doesn't hold", () => {
 // $10.01 at 33% of ($10.01 − $1) = 297.33 → 297, not 298.
 const r = consignorCutWithFee(1001, 33, { feeCents: 100, policy: "split" });
 assert.equal(r.cutCents, 297);
});

test("a fee bigger than the sale floors at zero rather than going negative", () => {
 const r = consignorCutWithFee(500, 50, { feeCents: 900, policy: "split" });
 assert.equal(r.baseCents, 0);
 assert.equal(r.cutCents, 0);
 assert.equal(r.feeAppliedCents, 500);
});

test("nonsense splits are clamped, not trusted", () => {
 assert.equal(consignorCutWithFee(10000, 150).cutCents, 10000);
 assert.equal(consignorCutWithFee(10000, -10).cutCents, 0);
 assert.equal(consignorCutWithFee(10000, NaN).cutCents, 0);
});

test("no fee supplied behaves exactly as before", () => {
 // The existing behaviour has to be untouched for every VYA sale, which has no marketplace fee.
 for (const policy of ["store", "split"] as const) {
  assert.equal(consignorCutWithFee(10000, 60, { policy }).cutCents, 6000, policy);
 }
});

test("fee estimates exist for the marketplaces we list to, and nowhere else", () => {
 assert.equal(estimateMarketplaceFeeCents("ebay", 10000), 1325);
 assert.equal(estimateMarketplaceFeeCents("depop", 10000), 1000);
 // No guess for a channel we don't know — a made-up fee would quietly change someone's payout.
 assert.equal(estimateMarketplaceFeeCents("vya", 10000), null);
 assert.equal(estimateMarketplaceFeeCents(null, 10000), null);
});
