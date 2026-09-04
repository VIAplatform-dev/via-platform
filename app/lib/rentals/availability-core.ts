// ───────────────────────────────────────────────────────────────────────────
// Rental availability — the date maths, pure and unit-tested.
//
// The whole reason rentals are harder than sales: a piece is not available or
// unavailable, it is available ON SOME DATES. Everything here works in plain
// "YYYY-MM-DD" days with both ends inclusive, and never touches a Date's local
// timezone — a rental that starts on the 14th starts on the 14th in Sydney too.
// ───────────────────────────────────────────────────────────────────────────

import type { RentalSettings } from "./settings-core";

/** A calendar day, "YYYY-MM-DD". */
export type Day = string;
/** A run of days, both ends inclusive. */
export type Span = { start: Day; end: Day };

const MS_PER_DAY = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(d: unknown): d is Day {
 if (typeof d !== "string" || !DAY_RE.test(d)) return false;
 const t = Date.parse(`${d}T00:00:00Z`);
 return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d; // rejects 2026-02-31
}

function ms(d: Day): number {
 return Date.parse(`${d}T00:00:00Z`);
}

export function addDays(d: Day, n: number): Day {
 return new Date(ms(d) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Inclusive length: the 14th to the 18th is five days, not four. */
export function lengthInDays(s: Span): number {
 return Math.round((ms(s.end) - ms(s.start)) / MS_PER_DAY) + 1;
}

export function spansOverlap(a: Span, b: Span): boolean {
 return ms(a.start) <= ms(b.end) && ms(b.start) <= ms(a.end);
}

export function isValidSpan(s: Span): boolean {
 return isDay(s.start) && isDay(s.end) && ms(s.start) <= ms(s.end);
}

/**
 * The days a rental actually takes the piece off the floor: the rented days,
 * plus getting it there, plus getting it back, plus the store's turnaround.
 *
 * This is frozen onto the booking when it is made and never recomputed. If it
 * were derived at query time, a store editing its cleaning days on Tuesday
 * would silently shift the availability of every rental already out.
 */
export function blockedBand(rented: Span, s: Pick<RentalSettings, "shipOutDays" | "shipBackDays" | "turnaroundDays">): Span {
 return {
  start: addDays(rented.start, -s.shipOutDays),
  end: addDays(rented.end, s.shipBackDays + s.turnaroundDays),
 };
}

export type Tier = { days: number; cents: number };

/**
 * Price for a length: the cheapest tier that covers it. Four days on a
 * 4/7/28-day ladder pays the 4-day rate; five days pays the 7-day rate. Longer
 * than every tier is not a cheap rental, it's not for rent — null, not a guess.
 */
export function priceForDays(days: number, tiers: Tier[]): number | null {
 if (!Number.isFinite(days) || days < 1) return null;
 const ladder = (tiers || [])
  .filter((t) => t && Number.isFinite(t.days) && Number.isFinite(t.cents) && t.days > 0 && t.cents >= 0)
  .sort((a, b) => a.days - b.days);
 const fit = ladder.find((t) => days <= t.days);
 return fit ? Math.round(fit.cents) : null;
}

export type Refusal =
 | "bad-dates"
 | "too-short"
 | "too-long"
 | "too-soon"
 | "beyond-horizon"
 | "no-price"
 | "unavailable";

export type Quote =
 | { ok: true; days: number; cents: number; rented: Span; blocked: Span }
 | { ok: false; reason: Refusal };

/**
 * Can this piece be rented for these dates, and for how much?
 *
 * Order matters: the cheapest checks first, availability last, so a request
 * that was never going to be legal doesn't get compared against every booking.
 * The same function answers the product page and re-validates at payment —
 * a quote the customer saw is never trusted on the way back in.
 */
export function quote(
 rented: Span,
 s: RentalSettings,
 tiers: Tier[],
 today: Day,
 takenBands: Span[] = [],
): Quote {
 if (!isValidSpan(rented) || !isDay(today)) return { ok: false, reason: "bad-dates" };

 const days = lengthInDays(rented);
 if (days < s.minDays) return { ok: false, reason: "too-short" };
 if (days > s.maxDays) return { ok: false, reason: "too-long" };

 const earliest = addDays(today, s.leadDays);
 if (ms(rented.start) < ms(earliest)) return { ok: false, reason: "too-soon" };

 const latest = addDays(today, s.horizonDays);
 if (ms(rented.end) > ms(latest)) return { ok: false, reason: "beyond-horizon" };

 const cents = priceForDays(days, tiers);
 if (cents == null) return { ok: false, reason: "no-price" };

 const blocked = blockedBand(rented, s);
 if (takenBands.some((b) => isValidSpan(b) && spansOverlap(blocked, b))) {
  return { ok: false, reason: "unavailable" };
 }
 return { ok: true, days, cents, rented, blocked };
}

/**
 * The gaps left in the bookable window once existing bookings are subtracted.
 * Feeds a date picker: these are the days that are free, not the days a rental
 * could legally start — a five-day gap on a seven-day minimum is still free,
 * and it is the picker's job to say so.
 */
export function freeSpans(takenBands: Span[], s: RentalSettings, today: Day): Span[] {
 if (!isDay(today)) return [];
 const from = addDays(today, s.leadDays);
 const to = addDays(today, s.horizonDays);
 if (ms(from) > ms(to)) return [];

 const taken = (takenBands || [])
  .filter(isValidSpan)
  .map((b) => ({ start: b.start, end: b.end }))
  .sort((a, b) => ms(a.start) - ms(b.start));

 const free: Span[] = [];
 let cursor = from;
 for (const b of taken) {
  if (ms(b.end) < ms(cursor)) continue; // already behind us
  if (ms(b.start) > ms(to)) break; // beyond the horizon
  if (ms(b.start) > ms(cursor)) free.push({ start: cursor, end: addDays(b.start, -1) });
  const after = addDays(b.end, 1);
  if (ms(after) > ms(cursor)) cursor = after;
  if (ms(cursor) > ms(to)) break;
 }
 if (ms(cursor) <= ms(to)) free.push({ start: cursor, end: to });
 return free.filter((f) => ms(f.start) <= ms(f.end));
}

/** Postgres daterange is half-open: [start, end+1). */
export function toDateRange(s: Span): string {
 return `[${s.start},${addDays(s.end, 1)})`;
}

/** Read one back. Returns null for an empty or unbounded range. */
export function fromDateRange(range: string | null | undefined): Span | null {
 const m = (range || "").match(/^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)$/);
 if (!m) return null;
 const end = addDays(m[2], -1);
 return ms(m[1]) <= ms(end) ? { start: m[1], end } : null;
}
