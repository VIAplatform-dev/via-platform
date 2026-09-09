import { test } from "node:test";
import assert from "node:assert/strict";
import { sender, vyaShouldSend, isMarketing, describe as describeOwnership } from "./email-ownership.ts";

const off = { espConnected: false, handOverMarketing: true };
const on = { espConnected: true, handOverMarketing: true };
const onButKeeping = { espConnected: true, handOverMarketing: false };

test("with nothing connected, VYA sends everything", () => {
 assert.equal(vyaShouldSend("order-confirmation", off), true);
 assert.equal(vyaShouldSend("new-arrivals", off), true);
 assert.equal(vyaShouldSend("abandoned-basket", off), true);
});

test("an order email is never handed over, however connected the store is", () => {
 // A receipt that depends on a marketing subscription being current is not a receipt.
 for (const k of ["order-confirmation", "shipping", "delivery", "refund", "deposit-receipt",
  "appointment-confirmation", "appointment-reminder", "rental-return", "offer-reply", "consignor-payout"] as const) {
  assert.equal(sender(k, on), "vya", `${k} must stay with VYA`);
  assert.equal(isMarketing(k), false, `${k} is not marketing`);
 }
});

test("marketing moves to their tool once connected — that's the whole point", () => {
 // Both sending the same abandoned-basket email is the failure this exists to prevent.
 assert.equal(sender("abandoned-basket", on), "esp");
 assert.equal(sender("new-arrivals", on), "esp");
 assert.equal(sender("welcome", on), "esp");
 assert.equal(sender("custom-automation", on), "esp");
 assert.equal(vyaShouldSend("abandoned-basket", on), false);
});

test("a store can keep marketing, and then VYA sends it again", () => {
 assert.equal(sender("new-arrivals", onButKeeping), "vya");
 assert.equal(vyaShouldSend("abandoned-basket", onButKeeping), true);
});

test("a campaign the seller writes and sends is always ours", () => {
 // She's standing in front of it and pressed send. Handover is about the automatic ones.
 assert.equal(sender("campaign", on), "vya");
 assert.equal(sender("campaign", onButKeeping), "vya");
});

test("the summary line says something true in each of the three states", () => {
 assert.match(describeOwnership(off, "Mailchimp"), /VYA sends everything/);
 assert.match(describeOwnership(on, "Mailchimp"), /Mailchimp sends your marketing/);
 // Keeping marketing while connected is legitimate but risky, and the line says so.
 assert.match(describeOwnership(onButKeeping, "Mailchimp"), /two of the same email/);
});
