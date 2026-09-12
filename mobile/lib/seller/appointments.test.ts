import { test } from "node:test";
import assert from "node:assert/strict";
import { daySchedule, stillToCome, clock, appointmentLine, appointmentsTileLine, nowTime, type Appointment } from "./appointments.ts";

const DAY = "2026-09-11";
const a = (over: Partial<Appointment>): Appointment => ({
  id: "a", kind: "Try-on", day: DAY, start: "10:00", end: "10:30",
  customerName: null, customerEmail: null, customerPhone: null, note: null, status: "booked", ...over,
});

test("today's diary is earliest first", () => {
  const s = daySchedule([a({ id: "pm", start: "15:00", end: "15:30" }), a({ id: "am", start: "09:00", end: "09:30" })], DAY);
  assert.deepEqual(s.map((x) => x.id), ["am", "pm"]);
});

test("cancelled and no-shows don't take a line in the day", () => {
  const s = daySchedule([a({ id: "x", status: "cancelled" }), a({ id: "y", status: "no-show" }), a({ id: "ok" })], DAY);
  assert.deepEqual(s.map((x) => x.id), ["ok"]);
});

test("another day's bookings stay on their own day", () => {
  assert.deepEqual(daySchedule([a({ day: "2026-09-12" })], DAY), []);
});

test("an appointment running RIGHT NOW is still to come", () => {
  // Dropping it the moment it starts is how she checks her phone mid-fitting and sees an empty day.
  const s = daySchedule([a({ id: "now", start: "14:00", end: "15:00" })], DAY);
  assert.deepEqual(stillToCome(s, "14:20").map((x) => x.id), ["now"]);
  assert.deepEqual(stillToCome(s, "15:00"), []);
});

test("times read as a clock, not as a database column", () => {
  assert.equal(clock("14:30"), "2:30pm");
  assert.equal(clock("09:00"), "9am");
  assert.equal(clock("12:00"), "12pm");
  assert.equal(clock("00:15"), "12:15am");
});

test("a line names when, what and who", () => {
  assert.equal(appointmentLine(a({ start: "14:30", end: "15:00", kind: "Try-on", customerName: "Marta" })), "2:30–3pm · Try-on · Marta");
  assert.equal(appointmentLine(a({ start: "09:00", end: "09:30", kind: "Collection" })), "9–9:30am · Collection");
});

test("the tile counts what is LEFT, not what was booked", () => {
  const s = daySchedule([a({ start: "09:00", end: "09:30" }), a({ start: "16:00", end: "16:30" })], DAY);
  assert.equal(appointmentsTileLine(s, "08:00"), "2 left · next 9am");
  assert.equal(appointmentsTileLine(s, "10:00"), "One more · 4pm");
  assert.equal(appointmentsTileLine(s, "17:00"), "Done for today");
  assert.equal(appointmentsTileLine([], "10:00"), "Nothing booked today");
});

test("now is wall-clock, zero-padded", () => {
  assert.equal(nowTime(new Date(2026, 8, 11, 9, 5)), "09:05");
});
