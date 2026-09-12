// When a piece should go live, chosen on a phone.
//
// NO DATE PICKER. `@react-native-community/datetimepicker` is a native module, which means a new
// dependency and a new build for one control — and a wheel picker is the wrong instrument anyway.
// Scheduling a listing is not "pick an arbitrary instant", it is "put this out at a good time", and
// the good times are a short list: this evening, tomorrow morning, the weekend. Presets cover almost
// every case in one tap; the typed box is there for the one they don't.
//
// Everything takes `now` so the presets can be tested without freezing the clock.

export type Preset = { key: string; label: string; at: Date };

function at(base: Date, addDays: number, hour: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Days until the next Saturday. 0 would mean "today", so a Saturday rolls to the next one. */
function daysToSaturday(from: Date): number {
  const delta = (6 - from.getDay() + 7) % 7;
  return delta === 0 ? 7 : delta;
}

/**
 * The offers, soonest first, with anything already past dropped.
 *
 * "This evening" disappears after 6pm rather than sitting there offering a time that has gone —
 * an option that errors when tapped is worse than one that isn't there.
 */
export function schedulePresets(now: Date = new Date()): Preset[] {
  const all: Preset[] = [
    { key: "tonight", label: "This evening", at: at(now, 0, 18) },
    { key: "tomorrow-am", label: "Tomorrow morning", at: at(now, 1, 9) },
    { key: "tomorrow-pm", label: "Tomorrow evening", at: at(now, 1, 18) },
    { key: "weekend", label: "Saturday morning", at: at(now, daysToSaturday(now), 10) },
  ];
  // A minute's grace, matching the server: it refuses anything at or before now + 60s.
  const floor = now.getTime() + 60_000;
  const seen = new Set<number>();
  return all
    .filter((p) => p.at.getTime() > floor)
    .filter((p) => (seen.has(p.at.getTime()) ? false : (seen.add(p.at.getTime()), true)));
}

/**
 * A typed date, or null when it isn't one yet.
 *
 * Accepts "2026-09-15 18:00" and "2026-09-15T18:00" — a space is what a person types. Parsed as
 * LOCAL time on purpose: she means six in the evening where she is standing, and appending a Z
 * would list a London seller's piece at 7pm in summer.
 */
export function parseScheduleInput(text: string | null | undefined, now: Date = new Date()): Date | null {
  const t = String(text ?? "").trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return null;
  const [date, time] = t.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // Built from parts rather than Date.parse: an ISO string with no zone is treated as UTC by the
  // spec in some engines and local in others, and "some engines" is not a timezone policy.
  const when = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (isNaN(when.getTime())) return null;
  if (when.getTime() <= now.getTime() + 60_000) return null;
  return when;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Goes live Friday at 6pm" — or "Goes live today at 6pm" when it is today. */
export function describeSchedule(when: Date | string | null | undefined, now: Date = new Date()): string | null {
  if (!when) return null;
  const d = when instanceof Date ? when : new Date(when);
  if (isNaN(d.getTime())) return null;
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const mins = d.getMinutes();
  const clock = `${hour12}${mins ? `:${String(mins).padStart(2, "0")}` : ""}${d.getHours() < 12 ? "am" : "pm"}`;
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const day = sameDay ? "today" : isTomorrow ? "tomorrow" : DAYS[d.getDay()];
  return `Goes live ${day} at ${clock}`;
}
