import { test } from "node:test";
import assert from "node:assert/strict";
import { combine, formatClock, isPastDay, isSchedulable, monthGrid, monthLabel, parseClock, sameDay, shiftMonth, startOfDay } from "./calendar.ts";

// September 2026 starts on a Tuesday and has 30 days.
const SEP = new Date(2026, 8, 1);

test("a month is whole weeks, Sunday first, padded with nulls", () => {
  const weeks = monthGrid(SEP);
  assert.equal(weeks.length, 5);
  weeks.forEach((w) => assert.equal(w.length, 7));
  // Sunday and Monday are blank; the 1st is Tuesday.
  assert.deepEqual(weeks[0].slice(0, 2), [null, null]);
  assert.equal(weeks[0][2]?.getDate(), 1);
  // 30 days, and the tail is padded rather than short.
  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, 30);
  assert.equal(days[29]?.getDate(), 30);
});

test("a month starting on Sunday has no lead padding", () => {
  const weeks = monthGrid(new Date(2026, 10, 1)); // Nov 2026 starts Sunday
  assert.equal(weeks[0][0]?.getDate(), 1);
});

test("February in a leap year", () => {
  const days = monthGrid(new Date(2028, 1, 1)).flat().filter(Boolean);
  assert.equal(days.length, 29);
});

test("stepping months does not fall off the end of a short one", () => {
  // The 31st + 1 month must be February, not March.
  assert.equal(shiftMonth(new Date(2026, 0, 31), 1).getMonth(), 1);
  assert.equal(monthLabel(shiftMonth(SEP, 1)), "October 2026");
  assert.equal(monthLabel(shiftMonth(SEP, -1)), "August 2026");
  assert.equal(monthLabel(shiftMonth(SEP, 4)), "January 2027");
});

test("days are compared as days, whatever the time on them", () => {
  assert.equal(sameDay(new Date(2026, 8, 15, 1), new Date(2026, 8, 15, 23)), true);
  assert.equal(sameDay(new Date(2026, 8, 15), new Date(2026, 8, 16)), false);
  assert.equal(sameDay(null, new Date()), false);
  assert.equal(startOfDay(new Date(2026, 8, 15, 13, 40)).getHours(), 0);
});

test("yesterday is past, today is not: the time of day decides today", () => {
  const now = new Date(2026, 8, 15, 14, 0);
  assert.equal(isPastDay(new Date(2026, 8, 14), now), true);
  assert.equal(isPastDay(new Date(2026, 8, 15, 1), now), false);
  assert.equal(isPastDay(new Date(2026, 8, 16), now), false);
});

/* ── the clock ─────────────────────────────────────────────────────────── */

test("a time typed the way a person types one", () => {
  assert.deepEqual(parseClock("6pm"), { hour: 18, minute: 0 });
  assert.deepEqual(parseClock("6:30pm"), { hour: 18, minute: 30 });
  assert.deepEqual(parseClock("18:30"), { hour: 18, minute: 30 });
  assert.deepEqual(parseClock(" 6 : 30 PM "), { hour: 18, minute: 30 });
  assert.deepEqual(parseClock("9"), { hour: 9, minute: 0 });
});

test("midnight and noon, the two that trip every clock parser", () => {
  assert.deepEqual(parseClock("12am"), { hour: 0, minute: 0 });
  assert.deepEqual(parseClock("12pm"), { hour: 12, minute: 0 });
  assert.deepEqual(parseClock("12:01am"), { hour: 0, minute: 1 });
});

test("nonsense is null, not a guess", () => {
  assert.equal(parseClock("25:00"), null);
  assert.equal(parseClock("6:99"), null);
  assert.equal(parseClock("13pm"), null);
  assert.equal(parseClock("0pm"), null);
  assert.equal(parseClock("evening"), null);
  assert.equal(parseClock(""), null);
});

test("and back out again", () => {
  assert.equal(formatClock(18, 0), "6pm");
  assert.equal(formatClock(18, 30), "6:30pm");
  assert.equal(formatClock(0, 0), "12am");
  assert.equal(formatClock(12, 0), "12pm");
  assert.equal(formatClock(9, 5), "9:05am");
});

/* ── putting the two together ──────────────────────────────────────────── */

test("a day and a time make one instant", () => {
  const when = combine(new Date(2026, 8, 20, 13, 45), 18, 30);
  assert.equal(when.getDate(), 20);
  assert.equal(when.getHours(), 18);
  assert.equal(when.getMinutes(), 30);
});

test("the server's one-minute floor is enforced before she can tap, not after", () => {
  const now = new Date(2026, 8, 15, 14, 0);
  assert.equal(isSchedulable(new Date(2026, 8, 15, 14, 0, 30), now), false);
  assert.equal(isSchedulable(new Date(2026, 8, 15, 14, 2), now), true);
  assert.equal(isSchedulable(new Date(2026, 8, 14), now), false);
  assert.equal(isSchedulable(null, now), false);
});

/* ── the clock's steppers ──────────────────────────────────────────────── */

// The clock steps hours and minutes with arrows rather than offering preset times. The wrapping is
// the part worth pinning: 11pm + 1 is midnight, not 24, and 55 + 5 minutes is 0, not 60.

test("hours wrap around midnight in both directions", () => {
  const up = (h: number) => (h + 1) % 24;
  const down = (h: number) => (h + 23) % 24;
  assert.equal(up(23), 0);
  assert.equal(down(0), 23);
  assert.equal(up(11), 12);
  assert.equal(down(12), 11);
});

test("minutes step by five and wrap at the hour", () => {
  const up = (m: number) => (m + 5) % 60;
  const down = (m: number) => (m + 55) % 60;
  assert.equal(up(55), 0);
  assert.equal(down(0), 55);
  assert.equal(up(0), 5);
});

test("the am/pm toggle keeps the hour and moves the half", () => {
  // The control does `half === "am" ? hour % 12 : (hour % 12) + 12`.
  const toAm = (h: number) => h % 12;
  const toPm = (h: number) => (h % 12) + 12;
  assert.equal(toAm(18), 6);
  assert.equal(toPm(6), 18);
  // Noon and midnight, again: 12am is hour 0, 12pm is hour 12.
  assert.equal(toAm(12), 0);
  assert.equal(toPm(0), 12);
  // Formatting agrees with the toggle either way round.
  assert.equal(formatClock(toAm(12), 0), "12am");
  assert.equal(formatClock(toPm(0), 0), "12pm");
});
