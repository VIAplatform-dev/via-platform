import { test } from "node:test";
import assert from "node:assert/strict";
import { planLabel, billingLine, tierPriceLine, invoiceLine, invoiceStatusNote } from "./billing.ts";

test("a store with no paid tier is on the Free plan, not a blank card", () => {
  // What /api/store/billing actually returns for an unbilled store: tier, interval and status all
  // null, with the truth in `plan`. Rendering tier straight through left an empty burgundy box.
  assert.equal(planLabel({ tier: null, plan: "free", interval: null, status: null, currentPeriodEnd: null }), "Free");
});

test("a paid tier is named, and capitalised as a title", () => {
  assert.equal(planLabel({ tier: "studio", plan: "studio", interval: "month", status: "active", currentPeriodEnd: null }), "Studio");
});

test("tier wins over plan when both are present", () => {
  assert.equal(planLabel({ tier: "atelier", plan: "studio", interval: "month", status: "active", currentPeriodEnd: null }), "Atelier");
});

test("nothing at all still names something rather than rendering blank", () => {
  assert.equal(planLabel({ tier: null, plan: null, interval: null, status: null, currentPeriodEnd: null }), "Free");
});

test("the billing line is omitted entirely when there is nothing to bill", () => {
  // "Billed" with no interval after it is the bug this replaces.
  assert.equal(billingLine({ tier: null, plan: "free", interval: null, status: null, currentPeriodEnd: null }), null);
});

test("a billed plan says how often, and when it renews", () => {
  assert.equal(
    billingLine({ tier: "studio", plan: "studio", interval: "month", status: "active", currentPeriodEnd: "2026-10-01T00:00:00.000Z" }),
    "Billed monthly · renews 1 Oct 2026",
  );
});

test("a yearly plan reads yearly, not year", () => {
  assert.match(billingLine({ tier: "studio", plan: "studio", interval: "year", status: "active", currentPeriodEnd: null })!, /^Billed yearly$/);
});

test("an interval with no renewal date drops the clause rather than inventing one", () => {
  assert.equal(billingLine({ tier: "studio", plan: "studio", interval: "month", status: "active", currentPeriodEnd: null }), "Billed monthly");
});

test("a tier's price reads as a price, not a bill", () => {
  const t = { id: "studio", name: "Studio", priced: true, price: { month: { amount: 2900, currency: "USD" }, year: { amount: 29000, currency: "USD" } } };
  assert.equal(tierPriceLine(t, "month"), "$29/mo");
  assert.equal(tierPriceLine(t, "year"), "$290/yr");
});

test("a tier with no yearly price says so instead of reading as free", () => {
  // "$0/yr" on Atelier would be the worst bug on this screen.
  const t = { id: "atelier", name: "Atelier", priced: true, price: { month: { amount: 9900, currency: "GBP" }, year: null } };
  assert.equal(tierPriceLine(t, "year"), "Monthly only");
  assert.equal(tierPriceLine(t, "month"), "£99/mo");
});

test("a currency the phone doesn't have a symbol for still prints its code", () => {
  const t = { id: "starter", name: "Starter", priced: true, price: { month: { amount: 1500, currency: "cad" } } };
  assert.equal(tierPriceLine(t, "month"), "CAD 15/mo");
});

test("an invoice keeps its pennies — it is what actually left her account", () => {
  const i = { id: "in_1", number: "A-1", amountCents: 2900, currency: "USD", status: "paid", createdAt: "2026-10-01T00:00:00.000Z", pdfUrl: null };
  assert.equal(invoiceLine(i), "1 Oct 2026 · $29.00");
  assert.equal(invoiceLine({ ...i, amountCents: 2934, currency: "GBP" }), "1 Oct 2026 · £29.34");
});

test("an invoice with no date still shows the amount", () => {
  const i = { id: "in_1", number: null, amountCents: 2900, currency: "USD", status: "paid", createdAt: null, pdfUrl: null };
  assert.equal(invoiceLine(i), "$29.00");
});

test("only the exceptional invoice states speak", () => {
  const base = { id: "in_1", number: null, amountCents: 1, currency: "USD", createdAt: null, pdfUrl: null };
  assert.equal(invoiceStatusNote({ ...base, status: "paid" }), null);
  assert.equal(invoiceStatusNote({ ...base, status: "open" }), "Unpaid");
  assert.equal(invoiceStatusNote({ ...base, status: "void" }), "Voided");
});
