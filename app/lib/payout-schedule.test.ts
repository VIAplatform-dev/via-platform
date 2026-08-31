import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutScheduleFor, payoutScheduleNotice, STRIPE_MAX_DELAY_DAYS } from "./payout-schedule.ts";
import type { RefundPolicy } from "./store-policy-db.ts";

const policy = (over: Partial<RefundPolicy> = {}): RefundPolicy => ({
 refundsEnabled: true, returnWindowDays: 14, restockingFeePct: 0, returnShippingPaidBy: "buyer", policyText: null, ...over,
});

test("the payout waits out the store's own return window, plus the return's journey back", () => {
 assert.deepEqual(payoutScheduleFor(policy({ returnWindowDays: 14 })), { delayDays: 17, windowDays: 14, clamped: false });
 assert.deepEqual(payoutScheduleFor(policy({ returnWindowDays: 30 })).delayDays, STRIPE_MAX_DELAY_DAYS);
 assert.equal(payoutScheduleFor(policy({ returnWindowDays: 7 })).delayDays, 10);
});

test("a store with no policy on file gets the default window", () => {
 // getRefundPolicy already answers 14 days for a store that never set one; null is the case where
 // we couldn't read it at all, and the safe assumption is the same 14 days rather than paying out
 // immediately on a store that may well accept returns.
 assert.equal(payoutScheduleFor(null).delayDays, 17);
});

test("'returns at our discretion' (no stated window) is treated as the default 14 days", () => {
 assert.equal(payoutScheduleFor(policy({ returnWindowDays: 0 })).delayDays, 17);
});

test("a final-sale store is paid as fast as Stripe allows — there is nothing to hold against", () => {
 const s = payoutScheduleFor(policy({ refundsEnabled: false, returnWindowDays: 30 }));
 assert.equal(s.delayDays, "minimum");
 assert.equal(s.clamped, false);
});

test("a window longer than Stripe will hold is clamped, and the store is told", () => {
 const s = payoutScheduleFor(policy({ returnWindowDays: 60 }));
 assert.equal(s.delayDays, STRIPE_MAX_DELAY_DAYS);
 assert.equal(s.windowDays, 60);
 assert.equal(s.clamped, true, "the seller's own policy outlives the hold — they must know");
 const notice = payoutScheduleNotice(s);
 assert.match(notice || "", /60/, "says what their policy promises");
 assert.match(notice || "", /30/, "and what Stripe will actually hold");
});

test("losing part of the shipping buffer is not worth alarming anyone about", () => {
 // A 28-day window wants 31 and gets 30: the window the buyer was promised is still fully covered,
 // only the padding is trimmed. Warning here would train sellers to ignore the warning that matters.
 const s = payoutScheduleFor(policy({ returnWindowDays: 28 }));
 assert.equal(s.delayDays, STRIPE_MAX_DELAY_DAYS);
 assert.equal(s.clamped, false);
 assert.equal(payoutScheduleNotice(s), null);
});

test("nothing to say when the window fits", () => {
 assert.equal(payoutScheduleNotice(payoutScheduleFor(policy({ returnWindowDays: 14 }))), null);
 assert.equal(payoutScheduleNotice(payoutScheduleFor(policy({ refundsEnabled: false }))), null);
});

test("a nonsense window can never produce a nonsense schedule", () => {
 assert.equal(payoutScheduleFor(policy({ returnWindowDays: -5 })).delayDays, 17, "negative reads as unset");
 assert.equal(payoutScheduleFor(policy({ returnWindowDays: 9999 })).delayDays, STRIPE_MAX_DELAY_DAYS);
});
