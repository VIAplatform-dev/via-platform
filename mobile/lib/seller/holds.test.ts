import { test } from "node:test";
import assert from "node:assert/strict";
import { describeHold, holdLapseRow, HOLD_LENGTHS } from "./holds.ts";

const NOW = new Date("2026-09-07T10:00:00.000Z");

test("a hold reads the way she would say it", () => {
  assert.equal(describeHold({ name: "Ana", expiresAt: "2026-09-10T18:00:00.000Z" }, NOW), "Held for Ana · 3 days left");
  assert.equal(describeHold({ name: "", expiresAt: "2026-09-07T18:00:00.000Z" }, NOW), "On hold · until tonight");
});

test("the Needs-you row names who to call, and only for holds that lapse today", () => {
  assert.equal(holdLapseRow({ name: "Ana", title: "Fendi baguette", expiresAt: "2026-09-07T18:00:00.000Z" }, NOW), "Ana's hold on Fendi baguette lapses tonight");
  assert.equal(holdLapseRow({ name: "", title: "Fendi baguette", expiresAt: "2026-09-07T18:00:00.000Z" }, NOW), "The hold on Fendi baguette lapses tonight");
  assert.equal(holdLapseRow({ name: "Ana", title: "Fendi baguette", expiresAt: "2026-09-09T18:00:00.000Z" }, NOW), null);
});

test("the hold-length chips are the ones a shop actually uses", () => {
  assert.deepEqual(HOLD_LENGTHS.map((h) => h.days), [1, 3, 7, 14]);
});
