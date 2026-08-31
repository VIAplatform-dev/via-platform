// ───────────────────────────────────────────────────────────────────────────
// Analytics — the period resolver (pure, no I/O, unit-tested).
//
// Every metric in the store analytics suite is a function of ONE resolved
// period, so this is the single place that decides what "Q3", "last 30 days" or
// a custom range actually mean — and what they get compared against. Two
// comparison windows are always produced alongside the current one:
//   • prior — the previous comparable window (Q3 → Q2, August → July)
//   • yoy   — the same window one year earlier (Q3 2026 → Q3 2025)
// so every headline number can carry direction, not just a value.
//
// Calendar boundaries resolve in the STORE's timezone (default UTC) so "best
// day" is the day the seller actually lived through, not a UTC slice of two.
// Windows are half-open [start, end) — the end instant belongs to the next one.
// ───────────────────────────────────────────────────────────────────────────

export type Granularity = "day" | "week" | "month";

/** A half-open time window, ready to hand to SQL. */
export type Window = {
 startISO: string;
 endISO: string; // exclusive
 label: string;
 days: number;
};

export type ResolvedPeriod = {
 key: string; // the canonical spec string, echoed back to the client
 tz: string;
 allTime: boolean;
 current: Window;
 prior: Window | null; // null for all-time (nothing precedes it)
 yoy: Window | null;
 granularity: Granularity; // bucket size for trend series
};

export type PeriodInput = {
 period?: string | null; // "30d" | "mtd" | "2026-08" | "2026-Q3" | "2026" | "custom" | "all"
 from?: string | null; // YYYY-MM-DD, custom only (inclusive)
 to?: string | null; // YYYY-MM-DD, custom only (inclusive)
 tz?: string | null; // IANA zone; falls back to UTC when missing or invalid
 now?: Date; // injectable clock, so this module stays testable
 /**
  * The store's first day of existence. "All time" starts here rather than at the
  * epoch, so an all-time chart has one bucket per month the store has traded
  * instead of six hundred empty ones stretching back to 1970.
  */
 earliest?: string | null;
};

const DAY_MS = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ── timezone helpers ───────────────────────────────────────────────────────
// Node ships full ICU, so Intl is the cheapest correct way to get a zone's
// offset at a given instant (DST included) without pulling in a date library.

const DTF_CACHE = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
 let f = DTF_CACHE.get(tz);
 if (!f) {
  f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  DTF_CACHE.set(tz, f);
 }
 return f;
}

/** True when the runtime recognises the zone — guards a user-supplied ?tz=. */
export function isValidTimeZone(tz: string): boolean {
 try { dtf(tz); return true; } catch { return false; }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsOf(d: Date, tz: string): Parts {
 const p = dtf(tz).formatToParts(d);
 const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
 return { year: g("year"), month: g("month"), day: g("day"), hour: g("hour") % 24, minute: g("minute"), second: g("second") };
}

/** The zone's UTC offset at instant `d`, in ms (positive east of Greenwich). */
function offsetMs(d: Date, tz: string): number {
 const p = partsOf(d, tz);
 return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - d.getTime() + (d.getTime() % 1000);
}

/**
 * The UTC instant of local midnight on y-m-d in `tz`. Two passes because the
 * first offset correction can itself land on the far side of a DST boundary.
 */
function zonedStart(year: number, month: number, day: number, tz: string): Date {
 const wall = Date.UTC(year, month - 1, day, 0, 0, 0);
 let t = wall - offsetMs(new Date(wall), tz);
 t = wall - offsetMs(new Date(t), tz);
 return new Date(t);
}

// ── period specs ───────────────────────────────────────────────────────────
// The parsed shape of what the caller asked for. Keeping it as a discriminated
// union (rather than jumping straight to dates) is what lets `prior` be
// calendar-aware: the month before August is July, not "31 days earlier".

type Spec =
 | { kind: "rolling"; days: number }
 | { kind: "month"; year: number; month: number }
 | { kind: "quarter"; year: number; quarter: number }
 | { kind: "year"; year: number }
 | { kind: "toDate"; unit: "month" | "quarter" | "year"; year: number; month: number; day: number }
 | { kind: "custom"; from: string; to: string }
 | { kind: "all" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseSpec(input: PeriodInput, now: Date, tz: string): Spec {
 const raw = (input.period || "").trim().toLowerCase();
 const today = partsOf(now, tz);

 if (raw === "all" || raw === "alltime" || raw === "all-time") return { kind: "all" };
 if (raw === "mtd") return { kind: "toDate", unit: "month", year: today.year, month: today.month, day: today.day };
 if (raw === "qtd") return { kind: "toDate", unit: "quarter", year: today.year, month: today.month, day: today.day };
 if (raw === "ytd") return { kind: "toDate", unit: "year", year: today.year, month: today.month, day: today.day };

 const rolling = raw.match(/^(\d{1,4})d$/);
 if (rolling) return { kind: "rolling", days: Math.min(3650, Math.max(1, Number(rolling[1]))) };

 const quarter = raw.match(/^(\d{4})[-\s]?q([1-4])$/) || raw.match(/^q([1-4])[-\s]?(\d{4})$/);
 if (quarter) {
  const [y, q] = raw.startsWith("q") ? [Number(quarter[2]), Number(quarter[1])] : [Number(quarter[1]), Number(quarter[2])];
  return { kind: "quarter", year: y, quarter: q };
 }

 const month = raw.match(/^(\d{4})-(\d{1,2})$/);
 if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) return { kind: "month", year: Number(month[1]), month: Number(month[2]) };

 const year = raw.match(/^(\d{4})$/);
 if (year) return { kind: "year", year: Number(year[1]) };

 if (raw === "custom" || (!raw && input.from && input.to)) {
  const from = String(input.from || "");
  const to = String(input.to || "");
  // A malformed custom range is a client bug, not a reason to 500 — fall back to
  // the default window so the dashboard still renders something truthful.
  if (ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to) return { kind: "custom", from, to };
 }

 return { kind: "rolling", days: 30 };
}

// ── spec → window ──────────────────────────────────────────────────────────

const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

function quarterOf(month: number): number {
 return Math.floor((month - 1) / 3) + 1;
}

/** The calendar month a to-date window starts in (month → itself, quarter → its first, year → January). */
function toDateStartMonth(spec: { unit: "month" | "quarter" | "year"; month: number }): number {
 if (spec.unit === "month") return spec.month;
 if (spec.unit === "quarter") return (quarterOf(spec.month) - 1) * 3 + 1;
 return 1;
}

function windowFor(spec: Spec, now: Date, tz: string, earliest?: string | null): Window {
 const mk = (start: Date, end: Date, label: string): Window => ({
  startISO: start.toISOString(),
  endISO: end.toISOString(),
  label,
  days: Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS)),
 });

 switch (spec.kind) {
  case "all": {
   const from = earliest && !Number.isNaN(Date.parse(earliest)) ? new Date(earliest) : new Date(EPOCH_ISO);
   const start = from.getTime() < now.getTime() ? from : new Date(now.getTime() - DAY_MS);
   return { startISO: start.toISOString(), endISO: now.toISOString(), label: "All time", days: Math.max(1, Math.round((now.getTime() - start.getTime()) / DAY_MS)) };
  }
  case "rolling": {
   const end = now;
   const start = new Date(end.getTime() - spec.days * DAY_MS);
   return mk(start, end, `Last ${spec.days} days`);
  }
  case "month": {
   const start = zonedStart(spec.year, spec.month, 1, tz);
   const end = zonedStart(spec.month === 12 ? spec.year + 1 : spec.year, spec.month === 12 ? 1 : spec.month + 1, 1, tz);
   return mk(start, end, `${MONTHS[spec.month - 1]} ${spec.year}`);
  }
  case "quarter": {
   const firstMonth = (spec.quarter - 1) * 3 + 1;
   const start = zonedStart(spec.year, firstMonth, 1, tz);
   const end = firstMonth + 3 > 12 ? zonedStart(spec.year + 1, 1, 1, tz) : zonedStart(spec.year, firstMonth + 3, 1, tz);
   return mk(start, end, `Q${spec.quarter} ${spec.year}`);
  }
  case "year": {
   return mk(zonedStart(spec.year, 1, 1, tz), zonedStart(spec.year + 1, 1, 1, tz), String(spec.year));
  }
  case "toDate": {
   const start = zonedStart(spec.year, toDateStartMonth(spec), 1, tz);
   const label = spec.unit === "month" ? "Month to date" : spec.unit === "quarter" ? "Quarter to date" : "Year to date";
   return mk(start, now, label);
  }
  case "custom": {
   const [fy, fm, fd] = spec.from.split("-").map(Number);
   const [ty, tm, td] = spec.to.split("-").map(Number);
   const start = zonedStart(fy, fm, fd, tz);
   // `to` is inclusive for the caller, so the exclusive end is the next midnight.
   const end = new Date(zonedStart(ty, tm, td, tz).getTime() + DAY_MS);
   return mk(start, end, `${spec.from} → ${spec.to}`);
  }
 }
}

// Calendar periods (and only those) have real calendar neighbours: the month
// before August is July, not "31 days earlier". Rolling / custom / to-date
// windows get slid instead — see resolvePeriod.
type CalendarSpec = Extract<Spec, { kind: "month" | "quarter" | "year" }>;

function priorSpec(spec: CalendarSpec): CalendarSpec {
 if (spec.kind === "month") return spec.month === 1 ? { kind: "month", year: spec.year - 1, month: 12 } : { kind: "month", year: spec.year, month: spec.month - 1 };
 if (spec.kind === "quarter") return spec.quarter === 1 ? { kind: "quarter", year: spec.year - 1, quarter: 4 } : { kind: "quarter", year: spec.year, quarter: spec.quarter - 1 };
 return { kind: "year", year: spec.year - 1 };
}

function yoySpec(spec: CalendarSpec): CalendarSpec {
 if (spec.kind === "month") return { kind: "month", year: spec.year - 1, month: spec.month };
 if (spec.kind === "quarter") return { kind: "quarter", year: spec.year - 1, quarter: spec.quarter };
 return { kind: "year", year: spec.year - 1 };
}

/** A window of `ms` length starting at `start` — used for to-date comparisons. */
function spanFrom(start: Date, ms: number, label: string): Window {
 return {
  startISO: start.toISOString(),
  endISO: new Date(start.getTime() + ms).toISOString(),
  label,
  days: Math.max(1, Math.round(ms / DAY_MS)),
 };
}

/** Shift a window back by `ms`, keeping its length — used for rolling/custom comparisons. */
function shiftBack(w: Window, ms: number, label: string): Window {
 return {
  startISO: new Date(Date.parse(w.startISO) - ms).toISOString(),
  endISO: new Date(Date.parse(w.endISO) - ms).toISOString(),
  label,
  days: w.days,
 };
}

function pickGranularity(days: number): Granularity {
 if (days <= 45) return "day";
 if (days <= 200) return "week";
 return "month";
}

/** Canonical string form of a spec, so the client gets back exactly what it asked for. */
function canonicalKey(spec: Spec): string {
 switch (spec.kind) {
  case "all": return "all";
  case "rolling": return `${spec.days}d`;
  case "month": return `${spec.year}-${String(spec.month).padStart(2, "0")}`;
  case "quarter": return `${spec.year}-Q${spec.quarter}`;
  case "year": return String(spec.year);
  case "toDate": return spec.unit === "month" ? "mtd" : spec.unit === "quarter" ? "qtd" : "ytd";
  case "custom": return `custom:${spec.from}:${spec.to}`;
 }
}

/**
 * The one entry point. Turns whatever the client sent into a current window plus
 * its two comparison windows and a sensible trend-bucket size.
 */
export function resolvePeriod(input: PeriodInput = {}): ResolvedPeriod {
 const now = input.now ?? new Date();
 const tz = input.tz && isValidTimeZone(input.tz) ? input.tz : "UTC";
 const spec = parseSpec(input, now, tz);
 const current = windowFor(spec, now, tz, input.earliest);
 const lengthMs = Date.parse(current.endISO) - Date.parse(current.startISO);

 let prior: Window | null;
 let yoy: Window | null;
 if (spec.kind === "all") {
  prior = null;
  yoy = null;
 } else if (spec.kind === "month" || spec.kind === "quarter" || spec.kind === "year") {
  // A calendar period compares against whole calendar periods: Q3 vs Q2, Q3 vs Q3 last year.
  prior = windowFor(priorSpec(spec), now, tz);
  yoy = windowFor(yoySpec(spec), now, tz);
 } else if (spec.kind === "toDate") {
  // "Quarter to date" is only honest against the SAME elapsed span of the previous
  // quarter — 29 days in vs 29 days in, never 29 days vs a finished 92.
  const m = toDateStartMonth(spec);
  const prevYear = spec.unit === "year" ? spec.year - 1 : spec.year;
  const prevStart = spec.unit === "month"
   ? (m === 1 ? zonedStart(spec.year - 1, 12, 1, tz) : zonedStart(spec.year, m - 1, 1, tz))
   : spec.unit === "quarter"
    ? (m === 1 ? zonedStart(spec.year - 1, 10, 1, tz) : zonedStart(spec.year, m - 3, 1, tz))
    : zonedStart(prevYear, 1, 1, tz);
  prior = spanFrom(prevStart, lengthMs, spec.unit === "year" ? "Same span last year" : `Same span, prior ${spec.unit}`);
  yoy = spanFrom(zonedStart(spec.year - 1, m, 1, tz), lengthMs, "Same period last year");
 } else {
  // Rolling and custom windows have no calendar predecessor — slide them.
  prior = shiftBack(current, lengthMs, "Prior period");
  yoy = shiftBack(current, 365 * DAY_MS, "Same period last year");
 }

 return {
  key: canonicalKey(spec),
  tz,
  allTime: spec.kind === "all",
  current,
  prior,
  yoy,
  granularity: pickGranularity(current.days),
 };
}

/** Percent change, or null when the base is zero (a % of nothing means nothing). */
export function deltaPct(current: number, base: number): number | null {
 if (!base) return null;
 return Math.round(((current - base) / base) * 1000) / 10;
}
