import { test } from "node:test";
import assert from "node:assert/strict";
import { slotsOn, slotsBetween, canBook, windowsOn, weekdayOf, type Settings } from "./slots-core.ts";

// A shop's week, as it actually thinks about it. The edges that matter: a slot must FIT before
// closing, a blackout beats opening hours, and capacity is per start time.

const THU = "2026-09-10"; // a Thursday
const FRI = "2026-09-11";
const SAT = "2026-09-12";

const S = (over: Partial<Settings> = {}): Settings => ({
 openingHours: [{ day: 4, start: "11:00", end: "13:00" }], // Thursdays, 11–1
 blackoutDates: [],
 slotMinutes: 45,
 slotCapacity: 1,
 ...over,
});

test("weekdays are read in UTC, not the viewer's clock", () => {
 assert.equal(weekdayOf(THU), 4);
 assert.equal(weekdayOf(SAT), 6);
});

test("slots fill a window and stop before closing", () => {
 // 11–1 at 45 minutes fits 11:00 and 11:45. 12:30 would run to 13:15, past close.
 const s = slotsOn(THU, S()).map((x) => `${x.start}-${x.end}`);
 assert.deepEqual(s, ["11:00-11:45", "11:45-12:30"]);
});

test("a shop that shuts for lunch gets two runs of slots", () => {
 const s = slotsOn(THU, S({ openingHours: [
  { day: 4, start: "10:00", end: "11:00" },
  { day: 4, start: "14:00", end: "15:00" },
 ], slotMinutes: 30 }));
 assert.deepEqual(s.map((x) => x.start), ["10:00", "10:30", "14:00", "14:30"]);
});

test("a day the shop isn't open has no slots", () => {
 assert.deepEqual(slotsOn(FRI, S()), []);
});

test("a blackout date beats the opening hours", () => {
 assert.deepEqual(slotsOn(THU, S({ blackoutDates: [THU] })), []);
});

test("capacity is per start time, not per day", () => {
 const s = S({ slotCapacity: 2 });
 const booked = [{ day: THU, start: "11:00" }, { day: THU, start: "11:00" }];
 const slots = slotsOn(THU, s, booked);
 assert.equal(slots[0].taken, 2);
 assert.equal(slots[0].free, false); // 11:00 is full
 assert.equal(slots[1].free, true); // 11:45 is untouched
});

test("an appointment on another day doesn't consume this one", () => {
 const slots = slotsOn(THU, S(), [{ day: SAT, start: "11:00" }]);
 assert.equal(slots[0].taken, 0);
});

test("a range only returns days the shop is open", () => {
 const days = new Set(slotsBetween(THU, SAT, S()).map((x) => x.day));
 assert.deepEqual([...days], [THU]);
});

test("windowsOn ignores malformed and back-to-front windows", () => {
 const hours = [
  { day: 4, start: "11:00", end: "13:00" },
  { day: 4, start: "18:00", end: "09:00" }, // ends before it starts
  { day: 4, start: "nope", end: "13:00" },
 ];
 assert.deepEqual(windowsOn(THU, hours), [{ day: 4, start: "11:00", end: "13:00" }]);
});

// ── booking the thing ──────────────────────────────────────────────────────

test("a real free slot can be booked", () => {
 assert.deepEqual(canBook(THU, "11:00", S(), []), { ok: true });
});

test("a slot that isn't on the grid is refused, not rounded", () => {
 assert.deepEqual(canBook(THU, "11:20", S(), []), { ok: false, reason: "closed" });
 assert.deepEqual(canBook(FRI, "11:00", S(), []), { ok: false, reason: "closed" });
 assert.deepEqual(canBook(THU, "9am", S(), []), { ok: false, reason: "bad-slot" });
});

test("a full slot is refused even though the shop is open", () => {
 assert.deepEqual(canBook(THU, "11:00", S(), [{ day: THU, start: "11:00" }]), { ok: false, reason: "full" });
});

test("the past can't be booked, including earlier today", () => {
 const now = { day: THU, time: "11:30" };
 assert.deepEqual(canBook(THU, "11:00", S(), [], now), { ok: false, reason: "past" }); // half an hour ago
 assert.deepEqual(canBook(THU, "11:45", S(), [], now), { ok: true }); // still to come
 assert.deepEqual(canBook("2026-09-03", "11:00", S(), [], now), { ok: false, reason: "past" }); // yesterday
});
