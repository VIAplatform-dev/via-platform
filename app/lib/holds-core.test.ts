import { test } from "node:test";
import assert from "node:assert/strict";
import { holdRef, parseHoldRef, holdUntil, holdsDueSoon, describeHold, holdPill, holdTiming } from "./holds-core.ts";

const NOW = new Date("2026-09-07T10:00:00.000Z");

test("a hold is a reservation whose owner tag names the customer", () => {
 // Reuses the reservations table exactly as checkout does — the tag is what tells a hold apart
 // from a buyer mid-checkout ('checkout') or an accepted offer ('offer-<token>').
 assert.equal(holdRef("Ana Ribeiro"), "hold:Ana Ribeiro");
 assert.deepEqual(parseHoldRef("hold:Ana Ribeiro"), { name: "Ana Ribeiro" });
});

test("anything that is not a hold parses as null", () => {
 assert.equal(parseHoldRef("checkout"), null);
 assert.equal(parseHoldRef("offer-abc123"), null);
 assert.equal(parseHoldRef("market-9f2"), null);
 assert.equal(parseHoldRef(null), null);
});

test("a blank name still makes a valid, findable hold", () => {
 // She often holds "for the woman in the green coat" — a name is optional, the hold is not.
 assert.equal(holdRef("  "), "hold:");
 assert.deepEqual(parseHoldRef("hold:"), { name: "" });
});

test("until-when accepts a day count or an ISO date, and is measured in seconds from now", () => {
 assert.equal(holdUntil({ days: 3 }, NOW), 3 * 86400);
 assert.equal(holdUntil({ until: "2026-09-10T10:00:00.000Z" }, NOW), 3 * 86400);
});

test("a hold cannot be in the past or longer than a month", () => {
 // Past: it would release on the next sweep, which is not what she asked for. Over a month: a
 // one-of-one off sale for a season is a decision, not a hold.
 assert.throws(() => holdUntil({ until: "2026-09-06T10:00:00.000Z" }, NOW), /future/);
 assert.throws(() => holdUntil({ days: 45 }, NOW), /30 days/);
 assert.throws(() => holdUntil({ days: 0 }, NOW), /future/);
});

test("holds due soon are grouped: expiring today, then this week", () => {
 const holds = [
  { itemId: "a", name: "Ana", expiresAt: "2026-09-07T18:00:00.000Z" },
  { itemId: "b", name: "Jo", expiresAt: "2026-09-10T09:00:00.000Z" },
  { itemId: "c", name: "Liv", expiresAt: "2026-09-30T09:00:00.000Z" },
 ];
 const due = holdsDueSoon(holds, NOW);
 assert.deepEqual(due.today.map((h) => h.itemId), ["a"]);
 assert.deepEqual(due.thisWeek.map((h) => h.itemId), ["b"]);
});

test("a hold reads as a sentence she would say", () => {
 assert.equal(describeHold({ name: "Ana", expiresAt: "2026-09-10T18:00:00.000Z" }, NOW), "Held for Ana · 3 days left");
 assert.equal(describeHold({ name: "", expiresAt: "2026-09-07T18:00:00.000Z" }, NOW), "On hold · until tonight");
 assert.equal(describeHold({ name: "Jo", expiresAt: "2026-09-08T09:00:00.000Z" }, NOW), "Held for Jo · until tomorrow");
});

test("the status pill leads with the state, then who, then the clock — and a buyer's reservation is not a hold", () => {
 // Web Inventory and the phone print the same words, so "On hold" always means a person and
 // "Reserved" always means a checkout in progress.
 assert.equal(holdPill({ name: "Ana", expiresAt: "2026-09-10T18:00:00.000Z" }, NOW), "On hold · Ana · 3 days left");
 assert.equal(holdPill({ name: "", expiresAt: "2026-09-07T18:00:00.000Z" }, NOW), "On hold · until tonight");
 assert.equal(holdPill(null, NOW), "Reserved");
 assert.equal(holdPill(undefined, NOW), "Reserved");
});

test("the clock half is shared by the sentence and the pill", () => {
 assert.equal(holdTiming({ expiresAt: "2026-09-07T09:00:00.000Z" }, NOW), "lapsed");
 assert.equal(holdTiming({ expiresAt: "2026-09-08T09:00:00.000Z" }, NOW), "until tomorrow");
 assert.equal(holdTiming({ expiresAt: "2026-09-09T10:00:00.000Z" }, NOW), "2 days left");
});
