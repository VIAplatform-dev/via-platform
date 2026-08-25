import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSendAtFivePmEastern, easternHour, FIVE_PM_EASTERN_SLOTS } from "./eastern-cron.ts";

// The whole point of registering two UTC slots is that exactly ONE of them is 5 PM in New York on
// any given Tuesday. If both ever fired, the 120h send-lock would still stop a duplicate, but the
// email would land an hour off. These pin the behaviour on both sides of the daylight-saving line.

const SUMMER_2100 = new Date("2026-08-25T21:00:00Z"); // Tue in EDT (UTC-4) → 5 PM
const SUMMER_2200 = new Date("2026-08-25T22:00:00Z"); // Tue in EDT          → 6 PM
const WINTER_2100 = new Date("2027-01-19T21:00:00Z"); // Tue in EST (UTC-5) → 4 PM
const WINTER_2200 = new Date("2027-01-19T22:00:00Z"); // Tue in EST          → 5 PM

test("the clock is read in New York, not in UTC", () => {
 assert.equal(easternHour(SUMMER_2100), 17);
 assert.equal(easternHour(SUMMER_2200), 18);
 assert.equal(easternHour(WINTER_2100), 16);
 assert.equal(easternHour(WINTER_2200), 17);
});

test("during daylight time the 21:00 UTC slot sends and the 22:00 slot stands down", () => {
 assert.equal(shouldSendAtFivePmEastern("0 21 * * 2", SUMMER_2100), true);
 assert.equal(shouldSendAtFivePmEastern("0 22 * * 2", SUMMER_2200), false);
});

test("during standard time it is the other way round — no manual change in November", () => {
 assert.equal(shouldSendAtFivePmEastern("0 21 * * 2", WINTER_2100), false);
 assert.equal(shouldSendAtFivePmEastern("0 22 * * 2", WINTER_2200), true);
});

test("exactly one slot sends, on either side of the daylight-saving line", () => {
 for (const [a, b] of [[SUMMER_2100, SUMMER_2200], [WINTER_2100, WINTER_2200]] as const) {
  const firing = [
   shouldSendAtFivePmEastern(FIVE_PM_EASTERN_SLOTS[0], a),
   shouldSendAtFivePmEastern(FIVE_PM_EASTERN_SLOTS[1], b),
  ].filter(Boolean);
  assert.equal(firing.length, 1);
 }
});

// The guard must never be the reason an email fails to go out.
test("a manual trigger is never blocked", () => {
 assert.equal(shouldSendAtFivePmEastern(null, WINTER_2100), true);
 assert.equal(shouldSendAtFivePmEastern(undefined, SUMMER_2200), true);
});

test("a schedule we did not register is left alone — including a stale one from an old deployment", () => {
 // This is exactly the 11 AM Eastern job that two abandoned Vercel projects were still running.
 assert.equal(shouldSendAtFivePmEastern("0 15 * * 2", new Date("2026-08-25T15:00:00Z")), true);
 assert.equal(shouldSendAtFivePmEastern("0 20 * * 2", new Date("2026-08-25T20:00:00Z")), true);
});
