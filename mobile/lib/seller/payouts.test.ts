import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutActionFor } from "./payouts.ts";

test("cash settles marketplace sales as well as VYA ones", () => {
  // The store paid her out of the till; this is the bookkeeping.
  const a = payoutActionFor({ method: "cash", balanceCents: 9000, payableCents: 5000, offPlatform: { totalCents: 4000 } });
  assert.equal(a.canPay, true);
  assert.equal(a.amountCents, 9000);
  assert.equal(a.verb, "Record");
});

test("direct deposit can only send what VYA is holding", () => {
  const a = payoutActionFor({ method: "stripe", balanceCents: 9000, payableCents: 5000, offPlatform: { totalCents: 4000 } });
  assert.equal(a.amountCents, 5000);
  assert.equal(a.verb, "Send");
  assert.match(a.note ?? "", /still inside the return hold/);
});

test("owed entirely off-platform, by deposit, offers nothing and says why", () => {
  // The marketplace paid the store. VYA has no money to send, however much is owed.
  const a = payoutActionFor({ method: "stripe", balanceCents: 4000, payableCents: 0, offPlatform: { totalCents: 4000 } });
  assert.equal(a.canPay, false);
  assert.match(a.note ?? "", /record it as cash/);
});

test("owed but still in the return hold says so rather than failing on tap", () => {
  const a = payoutActionFor({ method: "cash", balanceCents: 4000, payableCents: 0 });
  assert.equal(a.canPay, false);
  assert.equal(a.note, "Still inside the return hold.");
});

test("a debit still clearing blocks a second payment", () => {
  const a = payoutActionFor({ method: "ach", balanceCents: 5000, payableCents: 5000, inFlightCents: 5000 });
  assert.equal(a.canPay, false);
  assert.match(a.note ?? "", /still clearing/);
});

test("owing nothing is quiet — no button, no explanation", () => {
  const a = payoutActionFor({ method: "cash", balanceCents: 0, payableCents: 0 });
  assert.equal(a.canPay, false);
  assert.equal(a.note, null);
});

test("no method set falls back to the store's default", () => {
  const a = payoutActionFor({ method: "", balanceCents: 3000, payableCents: 3000 }, "stripe");
  assert.equal(a.verb, "Send");
});
