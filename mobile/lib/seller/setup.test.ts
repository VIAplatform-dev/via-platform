import { test } from "node:test";
import assert from "node:assert/strict";
import { setupSummary, phoneRouteFor, type SetupStep } from "./setup.ts";

// "Set up your store" on the phone. The steps arrive from /api/store/onboarding-status (shaped by
// app/lib/setup-core.ts on the web); what the phone decides is the count and where a tap goes.

const step = (id: SetupStep["id"], done = false, optional = false): SetupStep => ({
  id, label: id, href: `/admin/x/${id}`, done, optional,
});

test("the summary mirrors the web: required steps decide completeness, the domain never does", () => {
  const steps = [step("ship_from", true), step("payments", true), step("shipping", true), step("first_listing", true), step("returns", true), step("domain", false, true)];
  assert.deepEqual(setupSummary(steps), { done: 5, total: 6, complete: true, next: null });
  const partial = [step("ship_from", true), step("payments"), step("shipping"), step("first_listing"), step("returns"), step("domain", false, true)];
  const s = setupSummary(partial);
  assert.equal(s.complete, false);
  assert.equal(s.done, 1);
  assert.equal(s.next?.id, "payments");
});

test("a step the phone can do itself opens in the app; the rest open the web settings", () => {
  assert.equal(phoneRouteFor(step("first_listing")), "/(seller)/list");
  assert.equal(phoneRouteFor(step("payments")), "/(seller)/payouts");
  assert.equal(phoneRouteFor(step("ship_from")), null);
  assert.equal(phoneRouteFor(step("shipping")), null);
  assert.equal(phoneRouteFor(step("returns")), null);
  assert.equal(phoneRouteFor(step("domain")), null);
});

test("a server that predates setup steps answers with no list — the phone must neither crash nor show the block", () => {
  // Seen live: the phone pointed at a deploy without Tier 3, Home rendered, and `steps.filter`
  // threw on undefined. An unknown checklist is "nothing to show", never a red screen.
  const sum = setupSummary(undefined);
  assert.deepEqual(sum, { done: 0, total: 0, complete: true, next: null });
});
