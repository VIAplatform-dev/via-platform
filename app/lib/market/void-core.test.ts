import { test } from "node:test";
import assert from "node:assert/strict";
import { voidEligibility, VOID_WINDOW_MS, describeVoid } from "./void-core.ts";

const NOW = new Date("2026-09-07T15:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const base = { status: "paid", tender: "cash" as string | null, paidAt: hoursAgo(1), sessionId: "s1", stripePaymentIntent: null as string | null };

test("a cash sale from an hour ago, in the open session, can be voided", () => {
 assert.deepEqual(voidEligibility(base, { openSessionId: "s1", now: NOW }), { ok: true, kind: "cash" });
});

test("a card sale voids by refunding its payment", () => {
 assert.deepEqual(voidEligibility({ ...base, tender: "card", stripePaymentIntent: "pi_1" }, { openSessionId: "s1", now: NOW }), { ok: true, kind: "card" });
});

test("a card sale with no payment on record cannot be refunded, so it cannot be voided", () => {
 const r = voidEligibility({ ...base, tender: "card", stripePaymentIntent: null }, { openSessionId: "s1", now: NOW });
 assert.equal(r.ok, false);
 assert.match(String((r as { reason: string }).reason), /no card payment/i);
});

test("already refunded is a no-op, reported as such rather than refused", () => {
 assert.deepEqual(voidEligibility({ ...base, status: "refunded" }, { openSessionId: "s1", now: NOW }), { ok: false, alreadyVoided: true, reason: "Already voided" });
});

test("outside the open session, only the last 24 hours qualify", () => {
 assert.equal(voidEligibility({ ...base, sessionId: "old", paidAt: hoursAgo(23) }, { openSessionId: "s1", now: NOW }).ok, true);
 const r = voidEligibility({ ...base, sessionId: "old", paidAt: hoursAgo(25) }, { openSessionId: "s1", now: NOW });
 assert.equal(r.ok, false);
 assert.match(String((r as { reason: string }).reason), /24 hours/);
 // In the open session the window doesn't apply — a stall that opened yesterday can still fix today.
 assert.equal(voidEligibility({ ...base, sessionId: "s1", paidAt: hoursAgo(30) }, { openSessionId: "s1", now: NOW }).ok, true);
 assert.equal(VOID_WINDOW_MS, 24 * 3_600_000);
});

test("a sale that isn't paid (pending, cancelled) has nothing to void", () => {
 assert.equal(voidEligibility({ ...base, status: "cancelled" }, { openSessionId: "s1", now: NOW }).ok, false);
 assert.equal(voidEligibility({ ...base, status: "pending" }, { openSessionId: "s1", now: NOW }).ok, false);
});

test("the confirm copy says what will happen to the money and the piece", () => {
 assert.equal(describeVoid({ kind: "cash", amountCents: 12_000, currency: "GBP" }), "Cash: £120 comes off the tin. Piece goes back on the rack.");
 assert.equal(describeVoid({ kind: "card", amountCents: 4_550, currency: "USD" }), "Card: $45.50 is refunded to their card. Piece goes back on the rack.");
});
