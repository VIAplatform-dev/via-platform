import { test } from "node:test";
import assert from "node:assert/strict";
import { periodKeyFrom, limitFor } from "./store-ai-usage-db.ts";
import { AI_LISTINGS_PER_PERIOD, TRIAL_AI_LISTINGS } from "./plans.ts";

// The allowance resets when the subscription renews, on the store's own anniversary. That is done
// by keying the counter on Stripe's period end rather than by computing dates ourselves — so these
// pin the one thing that could silently give a store a second allowance, or none at all.

test("the same billing period is the same key, whenever you ask", () => {
 const end = "2026-09-12T00:00:00.000Z";
 assert.equal(periodKeyFrom(end), periodKeyFrom(end));
});

test("renewing produces a new key, so the count starts again", () => {
 const sept = periodKeyFrom("2026-09-12T00:00:00.000Z");
 const oct = periodKeyFrom("2026-10-12T00:00:00.000Z");
 assert.notEqual(sept, oct);
});

test("a store billed on the 12th resets on the 12th, not the 1st", () => {
 // The key carries the anniversary date itself — there is no month-boundary logic to get wrong.
 assert.ok(periodKeyFrom("2026-09-12T00:00:00.000Z").endsWith("-09-12"));
});

test("no subscription falls back to the calendar month rather than counting nothing", () => {
 const k = periodKeyFrom(null);
 assert.ok(k.startsWith("cal:"), k);
 assert.ok(/^cal:\d{4}-\d{2}$/.test(k), k);
});

test("a malformed date from Stripe degrades to the calendar month", () => {
 assert.ok(periodKeyFrom("not-a-date").startsWith("cal:"));
});

test("every paid tier has an allowance, and they increase", () => {
 assert.equal(limitFor("starter", false), AI_LISTINGS_PER_PERIOD.starter);
 assert.ok(AI_LISTINGS_PER_PERIOD.starter < AI_LISTINGS_PER_PERIOD.studio);
 assert.ok(AI_LISTINGS_PER_PERIOD.studio < AI_LISTINGS_PER_PERIOD.atelier);
});

test("a trial gets the top allowance whatever tier it is nominally on", () => {
 assert.equal(limitFor("starter", true), TRIAL_AI_LISTINGS);
 assert.equal(limitFor(null, true), TRIAL_AI_LISTINGS);
});

test("no tier and no trial means no AI — not unlimited", () => {
 // Getting this backwards would hand free AI to every store without a subscription.
 assert.equal(limitFor(null, false), 0);
});
