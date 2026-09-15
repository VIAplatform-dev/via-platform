// A month, as a grid, and a clock as a pair of numbers.
//
// WHY THIS EXISTS RATHER THAN @react-native-community/datetimepicker: that is a native module, and
// a native module means a new binary on every seller's phone for one control. This is arithmetic
// and a grid of Pressables, so it ships over the air like the rest of the app.
//
// It replaced four presets ("This evening", "Tomorrow morning", "Saturday morning"...). They were
// chosen on the theory that scheduling a listing is "put this out at a good time" rather than "pick
// an instant", which is true of the common case and useless for the one a seller actually asked
// about: a drop on a particular date, at a particular time.
//
// Everything takes `now` so it can be tested without freezing the clock.

/** Midnight, local, on the same day. Comparing days must never depend on the time of day. */
export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The month containing `d`, shifted by `delta` months. Day is pinned to the 1st: adding a month to
 *  the 31st of January otherwise lands in March. */
export function shiftMonth(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The calendar grid for a month: whole weeks, Sunday first, padded with nulls.
 *
 * Nulls rather than the neighbouring months' days. A greyed-out 30th of the previous month is a
 * tap target that looks disabled and a date that looks wrong, and this grid is for choosing a day
 * in THIS month. Always whole weeks so the grid never changes shape mid-month.
 */
export function monthGrid(month: Date): (Date | null)[][] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const lead = new Date(year, m, 1).getDay();
  const days = new Date(year, m + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => new Date(year, m, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** A day that has already been and gone cannot be scheduled into. Today is fine: the time decides. */
export function isPastDay(day: Date, now: Date = new Date()): boolean {
  return startOfDay(day).getTime() < startOfDay(now).getTime();
}

/**
 * "6:30pm", "18:30", "6pm", "18" → { hour, minute } on a 24-hour clock. Null if it isn't a time.
 *
 * Deliberately generous: this is typed on a phone, and rejecting "6pm" for want of a colon is the
 * kind of strictness that makes a seller give up and publish it now instead.
 */
export function parseClock(text: string): { hour: number; minute: number } | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(t);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const suffix = m[3];
  if (minute > 59) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === "pm" && hour !== 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
  } else if (hour > 23) return null;
  return { hour, minute };
}

/** 18, 30 → "6:30pm". The way the rest of the app writes a time. */
export function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour < 12 ? "am" : "pm"}`;
}

/** A chosen day plus a chosen time, as one instant. */
export function combine(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

/**
 * Is this a time the server will accept?
 *
 * It refuses anything at or before now + 60s, so offering it here would be offering an error. The
 * UI uses this to disable the confirm rather than to explain a failure afterwards.
 */
export function isSchedulable(when: Date | null, now: Date = new Date()): boolean {
  return !!when && when.getTime() > now.getTime() + 60_000;
}

/**
 * Where the calendar opens when she switches from "now" to "schedule".
 *
 * Tomorrow evening: always comfortably past the server's one-minute floor (so the confirm is never
 * born disabled) and the commonest slot a drop actually goes out in.
 */
export function tomorrowEvening(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return d;
}

