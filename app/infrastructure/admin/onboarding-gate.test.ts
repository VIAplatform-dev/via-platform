import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardingGate } from "./onboarding-gate.ts";

test("a new seller with no store sees the wizard, as her first run", () => {
  assert.deepEqual(onboardingGate({ needsOnboarding: true, staff: false }), { go: "wizard", again: false });
});

test("a seller who already has a shop is sent to her workspace", () => {
  // She has finished this flow. This is the ONLY case that redirects.
  assert.deepEqual(onboardingGate({ slug: "her-shop" }), { go: "home" });
});

test("VYA staff with a shop stay, and it counts as an extra run", () => {
  // The reported bug: Gianna, signed in as a seller with a store, was bounced to Home.
  assert.deepEqual(onboardingGate({ slug: "gianna-shop", staff: true }), { go: "wizard", again: true });
});

test("VYA staff with no shop yet get an ordinary first run", () => {
  assert.deepEqual(onboardingGate({ needsOnboarding: true, staff: true }), { go: "wizard", again: false });
});

test("the owner on the admin cookie stays too", () => {
  assert.deepEqual(onboardingGate({ admin: true, slug: "via-admin", staff: true }), { go: "wizard", again: true });
});

test("no flag in the URL is required, because there is no URL here", () => {
  // The whole point: the decision depends on WHO she is, never on what she remembered to type.
  assert.equal(onboardingGate({ slug: "s", staff: true }).go, "wizard");
});

test("staff missing from whoami's answer reads as an ordinary seller", () => {
  // Documents the second bug rather than defending it: whoami must put `staff` on every answer,
  // because this function cannot tell "not staff" from "nobody said". The repair path forgot.
  assert.deepEqual(onboardingGate({ slug: "gianna-shop" }), { go: "home" });
});

test("nobody signed in goes to sign-in, not to the wizard", () => {
  assert.deepEqual(onboardingGate(null), { go: "sign-in" });
  assert.deepEqual(onboardingGate(undefined), { go: "sign-in" });
  assert.deepEqual(onboardingGate({ admin: false }), { go: "sign-in" });
});
