// ───────────────────────────────────────────────────────────────────────────
// Appointment slots — the scheduling maths, pure and unit-tested.
//
// A DIFFERENT question from rental availability, and conflating the two is the
// mistake to avoid. Rental availability asks "is this dress free that week?" and
// is per item. This asks "can someone come at 2pm on Thursday?" and is per store,
// bounded by opening hours and how many people the shop can see at once.
//
// Times are the store's own clock. No timezone conversion happens here — a shop
// that opens at 11 opens at 11, and the day it belongs to is the day it's on.
// ───────────────────────────────────────────────────────────────────────────

import type { AppointmentSettings, OpeningWindow } from "./settings-core";

/** "YYYY-MM-DD". */
export type Day = string;
/** "HH:MM", 24-hour, in the store's own clock. */
export type Time = string;

export type Slot = { day: Day; start: Time; end: Time; taken: number; capacity: number; free: boolean };

const MS_PER_DAY = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isDay = (d: unknown): d is Day => typeof d === "string" && DAY_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
export const isTime = (t: unknown): t is Time => typeof t === "string" && TIME_RE.test(t);

const minutes = (t: Time) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const addDays = (d: Day, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
/** 0 = Sunday … 6 = Saturday, read in UTC so it can't drift with the viewer's clock. */
export const weekdayOf = (d: Day) => new Date(`${d}T00:00:00Z`).getUTCDay();

export type Settings = Pick<AppointmentSettings, "openingHours" | "blackoutDates" | "slotMinutes" | "slotCapacity">;
/** An appointment already on the books, as far as the scheduler cares. */
export type Booked = { day: Day; start: Time };

/**
 * The windows a store is open on one day. Several are allowed — a shop that shuts
 * for lunch has two, and nothing here assumes otherwise.
 */
export function windowsOn(day: Day, hours: OpeningWindow[]): OpeningWindow[] {
 if (!isDay(day)) return [];
 const w = weekdayOf(day);
 return (hours || []).filter((h) => h.day === w && isTime(h.start) && isTime(h.end) && minutes(h.start) < minutes(h.end));
}

/**
 * Every slot on one day, free or not.
 *
 * A slot must FIT INSIDE its window: a 45-minute appointment cannot start at 17:30
 * against a 18:00 close, because the shop would be shut halfway through it.
 */
export function slotsOn(day: Day, s: Settings, booked: Booked[] = []): Slot[] {
 if (!isDay(day)) return [];
 if ((s.blackoutDates || []).includes(day)) return [];

 const size = Math.max(5, Math.round(s.slotMinutes || 45));
 const capacity = Math.max(1, Math.round(s.slotCapacity || 1));
 const takenAt = new Map<string, number>();
 for (const b of booked) {
  if (b.day !== day || !isTime(b.start)) continue;
  takenAt.set(b.start, (takenAt.get(b.start) ?? 0) + 1);
 }

 const out: Slot[] = [];
 for (const w of windowsOn(day, s.openingHours)) {
  const close = minutes(w.end);
  for (let m = minutes(w.start); m + size <= close; m += size) {
   const start = clock(m);
   const taken = takenAt.get(start) ?? 0;
   out.push({ day, start, end: clock(m + size), taken, capacity, free: taken < capacity });
  }
 }
 return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Slots across a run of days — what a booking page renders. */
export function slotsBetween(from: Day, to: Day, s: Settings, booked: Booked[] = [], maxDays = 60): Slot[] {
 if (!isDay(from) || !isDay(to)) return [];
 const out: Slot[] = [];
 let d = from;
 for (let i = 0; i < maxDays && Date.parse(`${d}T00:00:00Z`) <= Date.parse(`${to}T00:00:00Z`); i++) {
  out.push(...slotsOn(d, s, booked));
  d = addDays(d, 1);
 }
 return out;
}

export type SlotRefusal = "bad-slot" | "closed" | "full" | "past";

/**
 * Is this exact slot bookable right now?
 *
 * Re-asked on the server when someone books, never trusted from the page: between
 * rendering a calendar and pressing the button, the shop's last free 2pm can go.
 */
export function canBook(day: Day, start: Time, s: Settings, booked: Booked[], now?: { day: Day; time: Time }): { ok: true } | { ok: false; reason: SlotRefusal } {
 if (!isDay(day) || !isTime(start)) return { ok: false, reason: "bad-slot" };
 if (now && (day < now.day || (day === now.day && start <= now.time))) return { ok: false, reason: "past" };
 const slot = slotsOn(day, s, booked).find((x) => x.start === start);
 if (!slot) return { ok: false, reason: "closed" };
 return slot.free ? { ok: true } : { ok: false, reason: "full" };
}
