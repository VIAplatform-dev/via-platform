import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStepCopy, ringProgress, rowState, shortLabel } from "./setup-card-core.ts";
import { setupSteps, type SetupInput } from "./setup-core.ts";

// The Home card: one next step on the left (option B), the ring and the whole list on the right
// (option F). Pure over the steps the route returns, so the card's words are decided here.

const NONE: SetupInput = { shipFromSet: false, paymentsConnected: false, chargesEnabled: false, shippingConfigured: false, servedZoneCount: 0, liveListings: 0, policySet: false, customDomain: null };
const TWO_DONE: SetupInput = { ...NONE, paymentsConnected: true, chargesEnabled: true, liveListings: 1 };

test("two of six done: the address is next, four to go, then shipping and returns, domain in grey", () => {
 const copy = nextStepCopy(setupSteps(TWO_DONE));
 assert.ok(copy);
 assert.equal(copy.eyebrow, "Next · 4 to go");
 assert.equal(copy.headline, "Add the address you ship from");
 assert.equal(copy.hint, "Needed before a listing can go live. Two minutes.");
 assert.equal(copy.verb, "Add address");
 assert.equal(copy.href, "/admin/settings/locations");
 assert.deepEqual(copy.thenLine, { then: ["Shipping", "Returns"], optional: "Domain" });
});

test("the then-line shrinks as she goes: two, one, none remaining after the next step", () => {
 const one = nextStepCopy(setupSteps({ ...TWO_DONE, shipFromSet: true, shippingConfigured: true, servedZoneCount: 1 }));
 assert.equal(one?.headline, "Set your returns policy");
 assert.deepEqual(one?.thenLine, { then: [], optional: "Domain" });
 const two = nextStepCopy(setupSteps({ ...TWO_DONE, shipFromSet: true }));
 assert.equal(two?.headline, "Switch shipping on");
 assert.deepEqual(two?.thenLine, { then: ["Returns"], optional: "Domain" });
 // Three remaining after the next: only the next two are named.
 const many = nextStepCopy(setupSteps(NONE));
 assert.equal(many?.eyebrow, "Next · 6 to go");
 assert.deepEqual(many?.thenLine, { then: ["Stripe", "Shipping"], optional: "Domain" });
});

test("a step's hint and time cue read as one line; a step without a hint gets just the cue", () => {
 const shipping = nextStepCopy(setupSteps({ ...TWO_DONE, shipFromSet: true }));
 assert.equal(shipping?.hint, "One minute.");
 const stripe = nextStepCopy(setupSteps({ ...NONE, shipFromSet: true, paymentsConnected: true }));
 assert.equal(stripe?.headline, "Finish Stripe setup");
 assert.equal(stripe?.hint, "Stripe still needs a few details. About five minutes.");
 assert.equal(stripe?.verb, "Finish Stripe setup");
});

test("the optional line goes away once the domain is connected or skipped, and the count follows", () => {
 const skipped = nextStepCopy(setupSteps({ ...TWO_DONE, skipped: ["domain"] }));
 assert.deepEqual(skipped?.thenLine, { then: ["Shipping", "Returns"], optional: null });
 assert.equal(skipped?.eyebrow, "Next · 3 to go");
 const connected = nextStepCopy(setupSteps({ ...TWO_DONE, customDomain: "shop.example.com" }));
 assert.deepEqual(connected?.thenLine, { then: ["Shipping", "Returns"], optional: null });
});

test("nothing left to do means no copy", () => {
 assert.equal(nextStepCopy(setupSteps({ ...TWO_DONE, shipFromSet: true, shippingConfigured: true, servedZoneCount: 1, policySet: true })), null);
 assert.equal(nextStepCopy([]), null);
});

test("the ring is done over total in degrees, clamped", () => {
 assert.equal(ringProgress(2, 6), 120);
 assert.equal(ringProgress(0, 6), 0);
 assert.equal(ringProgress(6, 6), 360);
 assert.equal(ringProgress(7, 6), 360);
 assert.equal(ringProgress(1, 0), 0);
 assert.equal(ringProgress(-1, 6), 0);
});

test("each row is done, next, later, or optional", () => {
 const steps = setupSteps(TWO_DONE);
 const next = "ship_from";
 assert.deepEqual(steps.map((s) => rowState(s, next)), ["next", "done", "later", "done", "later", "optional"]);
 // A connected domain is a done row like any other; a skipped one too.
 assert.equal(rowState(setupSteps({ ...TWO_DONE, customDomain: "x.com" })[5], next), "done");
 assert.equal(rowState(setupSteps({ ...TWO_DONE, skipped: ["domain"] })[5], next), "done");
 assert.equal(rowState(steps[0], null), "later");
});

test("short labels for the then-line", () => {
 assert.deepEqual(setupSteps(NONE).map(shortLabel), ["Ship-from address", "Stripe", "Shipping", "First piece", "Returns", "Domain"]);
});
