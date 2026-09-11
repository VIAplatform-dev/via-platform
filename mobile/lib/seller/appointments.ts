// The diary, read the way a seller reads it: what is left TODAY, then the rest.
//
// Mirrors app/lib/appointments/appointments-db.ts. `day` is YYYY-MM-DD and `start`/`end` are HH:MM,
// both plain strings the server stores as written — compared as strings here for the same reason
// rentals.ts does: they are wall-clock times in her shop, and a Date would invent a timezone.

export type Appointment = {
  id: string;
  kind: string;
  day: string;
  start: string;
  end: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  note: string | null;
  status: string;
  depositCents?: number;
  depositPaid?: boolean;
};

/** Cancelled and no-show are history; they should not occupy a line in today's schedule. */
const OFF = new Set(["cancelled", "no-show"]);

/** Now as HH:MM, so "still to come" means what it says. */
export function nowTime(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(now.getHours())}:${p(now.getMinutes())}`;
}

/** Today's diary, earliest first, with the cancelled ones dropped. */
export function daySchedule(all: Appointment[], day: string): Appointment[] {
  return all
    .filter((a) => a.day === day && !OFF.has(a.status))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * The ones still ahead of her.
 *
 * An appointment is "still to come" until it ENDS, not until it starts — a fitting running right
 * now is the most relevant thing on the screen, and dropping it the moment it begins is how a
 * seller looks at her phone mid-appointment and sees an empty afternoon.
 */
export function stillToCome(schedule: Appointment[], time: string = nowTime()): Appointment[] {
  return schedule.filter((a) => a.end > time);
}

/** "2:30pm" from "14:30". Her clock, not the database's. */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/**
 * "2:30–3pm · Try-on · Marta" — one appointment, one line.
 *
 * The am/pm is dropped from the START when both ends share it: "9–9:30am" is how the time is said
 * out loud, and "9am–9:30am" is how a database says it.
 */
export function appointmentLine(a: Appointment): string {
  const from = clock(a.start);
  const to = clock(a.end);
  const sameHalf = from.slice(-2) === to.slice(-2);
  const span = `${sameHalf ? from.slice(0, -2) : from}–${to}`;
  const who = a.customerName?.trim();
  return [span, a.kind, who].filter(Boolean).join(" · ");
}

/** The Home tile: what is left today, said as a person would. */
export function appointmentsTileLine(schedule: Appointment[], time: string = nowTime()): string {
  const left = stillToCome(schedule, time);
  if (!schedule.length) return "Nothing booked today";
  if (!left.length) return "Done for today";
  const next = left[0];
  return left.length === 1
    ? `One more · ${clock(next.start)}`
    : `${left.length} left · next ${clock(next.start)}`;
}
