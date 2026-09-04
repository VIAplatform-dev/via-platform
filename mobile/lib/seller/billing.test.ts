import { test } from "node:test";
import assert from "node:assert/strict";
import { planLabel, billingLine } from "./billing.ts";

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
