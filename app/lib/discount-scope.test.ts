import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOrderDiscount, audienceAllows, applyDiscountToOrder, eligibleLines, describeScope } from "./discount-scope.ts";

const dress = { itemId: "d1", amountCents: 10_000 };
const bag = { itemId: "b1", amountCents: 20_000 };
const bothInBag = [dress, bag];
const anyone = { lastOrderAt: null, email: "a@b.com" };

// ── what a code comes off ──────────────────────────────────────────────────────────────────────

test("an unscoped code still works on the whole order", () => {
 const r = computeOrderDiscount({ kind: "percent", value: 10 }, bothInBag);
 assert.equal(r.offCents, 3_000);
 assert.equal(r.eligibleCents, 30_000);
});

test("20% off the dresses is 20% of the DRESS, whatever else is in the bag", () => {
 const r = computeOrderDiscount({ kind: "percent", value: 20, itemIds: ["d1"] }, bothInBag);
 assert.equal(r.offCents, 2_000);      // not 6,000
 assert.equal(r.eligibleCents, 10_000);
});

test("a fixed amount can't eat into the piece it isn't for", () => {
 // £250 off dresses, with a £100 dress and a £200 bag in the bag: at most the dress.
 const r = computeOrderDiscount({ kind: "fixed", value: 250, itemIds: ["d1"] }, bothInBag);
 assert.equal(r.offCents, 10_000);
});

test("a code for pieces that aren't in the bag is refused, not silently zero", () => {
 // "It did nothing" and "it isn't for these pieces" look identical on a receipt.
 const r = computeOrderDiscount({ kind: "percent", value: 50, itemIds: ["other"] }, bothInBag);
 assert.equal(r.offCents, 0);
 assert.match(r.refusal || "", /particular pieces/);
});

test("a code with no amount set says so instead of taking nothing quietly", () => {
 const r = computeOrderDiscount({ kind: "percent", value: null }, bothInBag);
 assert.equal(r.offCents, 0);
 assert.match(r.refusal || "", /amount/);
});

test("free shipping ignores scope and takes nothing off the goods", () => {
 const r = computeOrderDiscount({ kind: "free_shipping", value: null, itemIds: ["d1"] }, bothInBag);
 assert.deepEqual([r.offCents, r.freeShipping], [0, true]);
});

test("a discount never exceeds what it may act on", () => {
 assert.equal(computeOrderDiscount({ kind: "percent", value: 500 }, [dress]).offCents, 10_000);
});

test("eligibleLines picks exactly the named pieces", () => {
 assert.deepEqual(eligibleLines({ kind: "percent", value: 1, itemIds: ["b1"] }, bothInBag), [bag]);
 assert.deepEqual(eligibleLines({ kind: "percent", value: 1 }, bothInBag), bothInBag);
});

// ── who may use it ─────────────────────────────────────────────────────────────────────────────

test("an unrestricted code needs no email and no history", () => {
 assert.deepEqual(audienceAllows({ kind: "percent", value: 10 }, { lastOrderAt: null }), { ok: true, refusal: null });
});

test("a first-order code works for someone who has never bought", () => {
 assert.equal(audienceAllows({ kind: "percent", value: 10, audience: "new" }, anyone).ok, true);
});

test("a first-order code is refused once they've bought", () => {
 const r = audienceAllows({ kind: "percent", value: 10, audience: "new" }, { lastOrderAt: "2026-01-01", email: "a@b.com" });
 assert.equal(r.ok, false);
 assert.match(r.refusal || "", /first order/);
});

test("COMEBACK50: allowed when the last order is older than the window", () => {
 const now = new Date("2026-09-09T00:00:00Z");
 const rule = { kind: "percent" as const, value: 50, audience: "lapsed" as const, lapsedDays: 180 };
 assert.equal(audienceAllows(rule, { lastOrderAt: "2026-01-01", email: "a@b.com" }, now).ok, true);
});

test("COMEBACK50: refused when they bought last month, and says why", () => {
 const now = new Date("2026-09-09T00:00:00Z");
 const rule = { kind: "percent" as const, value: 50, audience: "lapsed" as const, lapsedDays: 180 };
 const r = audienceAllows(rule, { lastOrderAt: "2026-08-20", email: "a@b.com" }, now);
 assert.equal(r.ok, false);
 assert.match(r.refusal || "", /6 months/);
});

test("someone who never bought counts as lapsed — that's what a shop means by it", () => {
 const rule = { kind: "percent" as const, value: 50, audience: "lapsed" as const, lapsedDays: 180 };
 assert.equal(audienceAllows(rule, anyone).ok, true);
});

test("an audience-gated code asks for an email rather than guessing", () => {
 const r = audienceAllows({ kind: "percent", value: 50, audience: "lapsed" }, { lastOrderAt: null, email: null });
 assert.equal(r.ok, false);
 assert.match(r.refusal || "", /email/);
});

// ── the two rules together ─────────────────────────────────────────────────────────────────────

test("who fails, nothing comes off — the scope never gets a look in", () => {
 const r = applyDiscountToOrder(
  { kind: "percent", value: 50, audience: "new", itemIds: ["d1"] },
  bothInBag,
  { lastOrderAt: "2026-01-01", email: "a@b.com" },
 );
 assert.equal(r.offCents, 0);
 assert.match(r.refusal || "", /first order/);
});

test("who passes and scope applies", () => {
 const r = applyDiscountToOrder({ kind: "percent", value: 50, audience: "new", itemIds: ["d1"] }, bothInBag, anyone);
 assert.equal(r.offCents, 5_000);
 assert.equal(r.refusal, null);
});

test("the seller reads her own rule back in words", () => {
 assert.equal(describeScope({ kind: "percent", value: 20, itemIds: ["d1"] }, new Map([["d1", "Silk Slip Dress"]])), "only Silk Slip Dress");
 assert.equal(describeScope({ kind: "percent", value: 20, itemIds: ["a", "b"] }), "only 2 pieces");
 assert.equal(describeScope({ kind: "percent", value: 50, audience: "lapsed", lapsedDays: 180 }), "not ordered in 6 months");
 assert.equal(describeScope({ kind: "percent", value: 10 }), "");
});
