import test from "node:test";
import assert from "node:assert/strict";
import { canTransition, ledgerEffect, planOffPlatformPayout, payoutStatusLabel, payoutStatusForIntent } from "./consignment-payout-core.ts";

// Every one of these is somebody's money. The two failures that matter are paying a consignor for a
// debit that later bounced, and taking money off her balance for a payment she never received —
// so most of what follows is about those.

test("nothing is paid before the debit clears", () => {
 assert.equal(canTransition("awaiting_funds", "paid"), true);
 // There is no route that reaches "paid" without passing through the wait.
 assert.equal(canTransition("failed", "paid"), false);
 assert.equal(canTransition("canceled", "paid"), false);
});

test("a cleared payout is final", () => {
 // A cleared ACH that reverses weeks later is a NEW debit to chase, not an edit to this row —
 // rewriting history here would silently re-credit a consignor who has been paid.
 for (const to of ["awaiting_funds", "failed", "canceled"] as const) {
  assert.equal(canTransition("paid", to), false, to);
 }
});

test("starting a payout HOLDS the money so it can't be paid twice", () => {
 assert.equal(ledgerEffect(null, "awaiting_funds"), "hold");
});

test("a bounced debit gives the money back — this is the one that must not be forgotten", () => {
 // recordPayout debits her ledger the moment the row exists. If the ACH fails and nothing releases
 // it, she is owed $50 that no longer appears anywhere. She would have to notice herself.
 assert.equal(ledgerEffect("awaiting_funds", "failed"), "release");
 assert.equal(ledgerEffect("awaiting_funds", "canceled"), "release");
});

test("clearing doesn't touch the balance again — the hold BECAME the payment", () => {
 // Debiting twice would take $100 off her balance for a $50 payout.
 assert.equal(ledgerEffect("awaiting_funds", "paid"), "none");
});

test("an impossible move changes no balance", () => {
 assert.equal(ledgerEffect("paid", "failed"), "none");
 assert.equal(ledgerEffect("failed", "paid"), "none");
});

const ready = { storeBankConnected: true, consignorPayoutReady: true };

test("pays what is owed", () => {
 const p = planOffPlatformPayout({ owedCents: 5000, ...ready });
 assert.deepEqual(p, { ok: true, amountCents: 5000 });
});

test("money already in flight is not sent a second time", () => {
 // Pressing Pay twice while the first ACH settles would debit the store twice for one sale.
 const p = planOffPlatformPayout({ owedCents: 5000, inFlightCents: 5000, ...ready });
 assert.equal(p.ok, false);
 assert.match((p as { reason: string }).reason, /already on its way/);
});

test("only the remainder is sent when part is in flight", () => {
 const p = planOffPlatformPayout({ owedCents: 8000, inFlightCents: 5000, ...ready });
 assert.deepEqual(p, { ok: true, amountCents: 3000 });
});

test("no bank connected is refused with the reason, not a failed transfer", () => {
 const p = planOffPlatformPayout({ owedCents: 5000, ...ready, storeBankConnected: false });
 assert.equal(p.ok, false);
 assert.match((p as { reason: string }).reason, /Connect a bank account/);
});

test("a consignor who hasn't finished setup is refused before any money moves", () => {
 const p = planOffPlatformPayout({ owedCents: 5000, ...ready, consignorPayoutReady: false });
 assert.equal(p.ok, false);
 assert.match((p as { reason: string }).reason, /payouts/);
});

test("nothing owed says so plainly", () => {
 const p = planOffPlatformPayout({ owedCents: 0, ...ready });
 assert.equal(p.ok, false);
 assert.match((p as { reason: string }).reason, /Nothing owed/);
});

test("a trivial amount isn't worth an ACH fee", () => {
 assert.equal(planOffPlatformPayout({ owedCents: 40, ...ready }).ok, false);
 assert.equal(planOffPlatformPayout({ owedCents: 100, ...ready }).ok, true);
});

test("nonsense figures never produce a payment", () => {
 for (const owed of [-500, NaN]) {
  assert.equal(planOffPlatformPayout({ owedCents: owed, ...ready }).ok, false, String(owed));
 }
});

test("statuses read as English, because sellers don't read enums", () => {
 assert.equal(payoutStatusLabel("awaiting_funds"), "On its way — clearing");
 assert.equal(payoutStatusLabel("failed"), "Didn’t go through");
});

test("an ACH still clearing is not a reason to pay anyone", () => {
 // `processing` is where an ACH spends its whole life. Reading it as success pays the consignor
 // days before the money exists, which is the exact failure this file was written to prevent.
 assert.equal(payoutStatusForIntent("processing"), "awaiting_funds");
 assert.equal(payoutStatusForIntent("succeeded"), "paid");
});

test("Stripe's word for a bounced ACH is requires_payment_method, not failed", () => {
 // There is no "failed" PaymentIntent status. Matching on the wrong string would leave the hold
 // on her balance forever — money she is owed that no longer appears anywhere.
 assert.equal(payoutStatusForIntent("requires_payment_method"), "failed");
 assert.equal(payoutStatusForIntent("canceled"), "canceled");
});

test("a status that means nothing yet changes nothing", () => {
 for (const s of ["requires_confirmation", "requires_action", "requires_capture", "", null, undefined]) {
  assert.equal(payoutStatusForIntent(s), null, String(s));
 }
});
