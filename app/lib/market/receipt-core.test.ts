import { test } from "node:test";
import assert from "node:assert/strict";
import { marketTag, normalizeReceiptEmail, receiptCopy } from "./receipt-core.ts";

test("the market tag is the session name, slugified, under a market: prefix", () => {
 assert.equal(marketTag("Brick Lane"), "market:brick-lane");
 assert.equal(marketTag("Market · Sep 7"), "market:market-sep-7");
 assert.equal(marketTag("  Portobello   Road!! "), "market:portobello-road");
 assert.equal(marketTag(""), "market:market");
});

test("a receipt email is checked loosely and lower-cased; junk is nothing", () => {
 assert.equal(normalizeReceiptEmail(" Ana@Example.com "), "ana@example.com");
 assert.equal(normalizeReceiptEmail("not an email"), null);
 assert.equal(normalizeReceiptEmail(""), null);
 assert.equal(normalizeReceiptEmail(null), null);
 assert.equal(normalizeReceiptEmail(42), null);
});

test("the receipt says what was bought, how it was paid and where", () => {
 const r = receiptCopy({
  storeName: "Sourced by Scottie", sessionName: "Brick Lane", currency: "GBP",
  lines: [{ title: "Fendi Baguette", saleCents: 12_000 }, { title: "Silk scarf", saleCents: 3_000 }],
  amountCents: 15_000, tender: "cash", tenderedCents: 20_000, changeCents: 5_000,
 });
 assert.equal(r.subject, "Your receipt from Sourced by Scottie");
 assert.match(r.body, /Fendi Baguette/);
 assert.match(r.body, /Silk scarf/);
 assert.match(r.body, /£150/);
 assert.match(r.body, /Paid in cash/);
 assert.match(r.body, /£200 given, £50 change/);
 assert.match(r.body, /Brick Lane/);
});

test("no change line when nothing was tendered, and card reads as card", () => {
 const r = receiptCopy({ storeName: "S", sessionName: "Today", currency: "USD", lines: [{ title: "Coat", saleCents: 5_000 }], amountCents: 5_000, tender: "card", tenderedCents: null, changeCents: null });
 assert.match(r.body, /Paid by card/);
 assert.doesNotMatch(r.body, /change/);
 assert.match(r.body, /\$50/);
});
