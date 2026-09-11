import { test } from "node:test";
import assert from "node:assert/strict";
import { schedulePresets, parseScheduleInput, describeSchedule } from "./schedule.ts";

// A Wednesday, 2pm.
const WED_2PM = new Date(2026, 8, 9, 14, 0, 0, 0);

test("the presets are the times a seller actually picks", () => {
  const p = schedulePresets(WED_2PM);
  assert.deepEqual(p.map((x) => x.key), ["tonight", "tomorrow-am", "tomorrow-pm", "weekend"]);
  assert.equal(p[0].at.getHours(), 18);
  assert.equal(p[3].at.getDay(), 6, "Saturday");
});

test("a time that has gone is not offered", () => {
  // 8pm: "this evening" is over. Offering it would error the moment it was tapped.
  const evening = new Date(2026, 8, 9, 20, 0, 0, 0);
  assert.deepEqual(schedulePresets(evening).map((x) => x.key), ["tomorrow-am", "tomorrow-pm", "weekend"]);
});

test("on a Saturday, 'Saturday morning' means the NEXT one", () => {
  const sat = new Date(2026, 8, 12, 14, 0, 0, 0);
  const weekend = schedulePresets(sat).find((p) => p.key === "weekend")!;
  assert.equal(weekend.at.getDate(), 19, "a week later, not today");
});

test("a typed date is read as local time, not UTC", () => {
  const d = parseScheduleInput("2026-09-15 18:00", WED_2PM)!;
  assert.equal(d.getHours(), 18, "six in the evening where she is standing");
  assert.equal(d.getDate(), 15);
  // The space form is what a person types; the T form is what a machine writes.
  assert.equal(parseScheduleInput("2026-09-15T18:00", WED_2PM)!.getTime(), d.getTime());
});

test("half-typed and past dates are refused rather than guessed at", () => {
  assert.equal(parseScheduleInput("2026-09-1", WED_2PM), null);
  assert.equal(parseScheduleInput("", WED_2PM), null);
  assert.equal(parseScheduleInput(null, WED_2PM), null);
  // The server refuses anything inside a minute; matching here means she is told before she saves.
  assert.equal(parseScheduleInput("2026-09-09 14:00", WED_2PM), null);
  assert.equal(parseScheduleInput("2026-01-01 09:00", WED_2PM), null);
});

test("the line names the day, and says today or tomorrow when it is", () => {
  assert.equal(describeSchedule(new Date(2026, 8, 9, 18, 0), WED_2PM), "Goes live today at 6pm");
  assert.equal(describeSchedule(new Date(2026, 8, 10, 9, 30), WED_2PM), "Goes live tomorrow at 9:30am");
  assert.equal(describeSchedule(new Date(2026, 8, 12, 10, 0), WED_2PM), "Goes live Saturday at 10am");
});

test("noon and midnight don't come out as 0", () => {
  assert.match(describeSchedule(new Date(2026, 8, 10, 12, 0), WED_2PM)!, /12pm/);
  assert.match(describeSchedule(new Date(2026, 8, 10, 0, 0), WED_2PM)!, /12am/);
});

test("nothing scheduled says nothing", () => {
  assert.equal(describeSchedule(null), null);
  assert.equal(describeSchedule("not a date"), null);
});
