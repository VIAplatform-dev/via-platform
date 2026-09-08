import { test } from "node:test";
import assert from "node:assert/strict";
import { setupSteps, setupSummary, stepVerb, type SetupInput } from "./setup-core.ts";

// "Set up your store": the six things between a new seller and a first sale that has nowhere to go
// wrong. Pure over the flags Home already has, so the web card and the phone block agree.

const NONE: SetupInput = { shipFromSet: false, paymentsConnected: false, chargesEnabled: false, shippingConfigured: false, servedZoneCount: 0, liveListings: 0, policySet: false, customDomain: null };
const ALL: SetupInput = { shipFromSet: true, paymentsConnected: true, chargesEnabled: true, shippingConfigured: true, servedZoneCount: 2, liveListings: 3, policySet: true, customDomain: "shop.example.com" };

test("six steps, in the order she should do them, each with somewhere to go", () => {
 const steps = setupSteps(NONE);
 assert.deepEqual(steps.map((s) => s.id), ["ship_from", "payments", "shipping", "first_listing", "returns", "domain"]);
 assert.deepEqual(steps.map((s) => s.href), [
  "/admin/settings/locations", "/admin/settings/payments", "/admin/settings/shipping", "/admin/add-listing", "/admin/settings/general", "/admin/settings/domain",
 ]);
 assert.equal(steps[0].label, "Add the address you ship from");
 assert.equal(steps[0].hint, "Needed before a listing can go live");
 assert.equal(steps[1].label, "Connect Stripe so you can get paid");
 assert.equal(steps[2].label, "Switch shipping on");
 assert.equal(steps[3].label, "List your first piece");
 assert.equal(steps[4].label, "Set your returns policy");
 assert.equal(steps[5].label, "Connect your own domain");
 for (const s of steps) assert.equal(s.done, false);
});

test("a base other than /admin rewrites every link (the phone opens the web settings)", () => {
 const steps = setupSteps(NONE, "https://getvya.ai/admin");
 assert.ok(steps.every((s) => s.href.startsWith("https://getvya.ai/admin/")));
});

test("Stripe connected but not yet able to charge reads as unfinished, with the reason", () => {
 const steps = setupSteps({ ...NONE, paymentsConnected: true, chargesEnabled: false });
 const pay = steps.find((s) => s.id === "payments")!;
 assert.equal(pay.done, false);
 assert.equal(pay.label, "Finish Stripe setup");
 assert.equal(pay.hint, "Stripe still needs a few details");
 const ok = setupSteps({ ...NONE, paymentsConnected: true, chargesEnabled: true }).find((s) => s.id === "payments")!;
 assert.equal(ok.done, true);
});

test("shipping counts only once a row exists AND at least one zone is served", () => {
 assert.equal(setupSteps({ ...NONE, shippingConfigured: true, servedZoneCount: 0 })[2].done, false);
 assert.equal(setupSteps({ ...NONE, shippingConfigured: false, servedZoneCount: 2 })[2].done, false);
 assert.equal(setupSteps({ ...NONE, shippingConfigured: true, servedZoneCount: 1 })[2].done, true);
});

test("the domain is optional: shown, never blocking, and says so", () => {
 const steps = setupSteps({ ...ALL, customDomain: null });
 const dom = steps.find((s) => s.id === "domain")!;
 assert.equal(dom.optional, true);
 assert.equal(dom.done, false);
 assert.equal(dom.hint, "Optional — your VYA address works today");
 const sum = setupSummary(steps);
 assert.equal(sum.complete, true);
 assert.equal(sum.done, 5);
 assert.equal(sum.total, 6);
 assert.equal(sum.next, null);
 assert.equal(setupSummary(setupSteps(ALL)).done, 6);
});

test("the summary names the next thing to do — the first undone required step", () => {
 const sum = setupSummary(setupSteps({ ...ALL, shippingConfigured: false, liveListings: 0 }));
 assert.equal(sum.complete, false);
 assert.equal(sum.done, 4); // ship_from, payments, returns, domain
 assert.equal(sum.next?.id, "shipping");
});

test("a store with nothing done has six to go and starts with the address", () => {
 const sum = setupSummary(setupSteps(NONE));
 assert.deepEqual({ done: sum.done, total: sum.total, complete: sum.complete, next: sum.next?.id }, { done: 0, total: 6, complete: false, next: "ship_from" });
});

test("each step has a verb for the one button on the card", () => {
 const steps = setupSteps(NONE);
 assert.deepEqual(steps.map(stepVerb), ["Add address", "Connect Stripe", "Switch shipping on", "List a piece", "Set returns policy", "Connect domain"]);
 // Stripe half-done says finish, not connect.
 const halfway = setupSteps({ ...NONE, paymentsConnected: true, chargesEnabled: false });
 assert.equal(stepVerb(halfway[1]), "Finish Stripe setup");
});

test("a skipped optional step counts as done for completeness, stays optional, and says it was skipped", () => {
 const steps = setupSteps({ ...NONE, skipped: ["domain"] });
 const dom = steps.find((s) => s.id === "domain")!;
 assert.equal(dom.done, true);
 assert.equal(dom.optional, true);
 assert.equal(dom.skipped, true);
 assert.equal(setupSummary(steps).done, 1);
 // Skipping a required step is not a thing: the list is ignored for it.
 const cheat = setupSteps({ ...NONE, skipped: ["ship_from" as "domain"] });
 assert.equal(cheat[0].done, false);
 assert.equal(cheat[0].skipped, undefined);
 // A domain that IS connected is done, not skipped, whatever the list says.
 const connected = setupSteps({ ...ALL, skipped: ["domain"] }).find((s) => s.id === "domain")!;
 assert.equal(connected.done, true);
 assert.equal(connected.skipped, undefined);
});
