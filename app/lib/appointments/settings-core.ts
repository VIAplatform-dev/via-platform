// ───────────────────────────────────────────────────────────────────────────
// Appointment settings — a shop's diary rules.
//
// Deliberately NOT part of rentals. A store that only sells still takes fittings, sourcing chats
// and collections, and it should never have to switch on renting to open its diary. These lived
// under rental settings while appointments were being built; they don't belong there.
//
// Pure and dependency-free, so the settings form and the scheduler share one definition.
// ───────────────────────────────────────────────────────────────────────────

/** day: 0 = Sunday … 6 = Saturday. Times are "HH:MM" in the store's own clock. */
export type OpeningWindow = { day: number; start: string; end: string };

export type AppointmentSettings = {
 enabled: boolean;
 /** Opening windows, per weekday — how a shop actually thinks about its week. */
 openingHours: OpeningWindow[];
 blackoutDates: string[];
 slotMinutes: number;
 /** How many people the shop can see at once. */
 slotCapacity: number;
 types: string[];
 /** Minimum notice, in hours. 0 allows someone to book the next free slot today. */
 leadHours: number;
 horizonDays: number;
 /** Off = a booking is confirmed the moment it's made. On = the store says yes first. */
 requireApproval: boolean;
 /** Charged to hold the slot. 0 = free to book. */
 depositCents: number;
 /** Does the deposit come off a purchase later, or is it simply a booking fee? */
 depositCredits: boolean;
 /** A Calendly / Cal.com link. Set, and the store's own diary is bypassed entirely. */
 bookingUrl: string | null;
 /** Show that link's real schedule in the page, rather than a button that leaves the site. */
 embedBooking: boolean;
 /** Shown above the picker — what an appointment with this shop actually is. */
 intro: string | null;
 /** Email the store when someone books. Off for a shop that lives in its diary, not its inbox. */
 notifyOnBooking: boolean;
 /** Where those alerts go, if not the address the store already sends from. */
 notifyEmail: string | null;
 /** Remind the customer this many hours before. 0 = never. 24 = the day before. */
 reminderHours: number;
};

export const DEFAULT_APPOINTMENT_SETTINGS: AppointmentSettings = {
 enabled: false,
 openingHours: [],
 blackoutDates: [],
 slotMinutes: 45,
 slotCapacity: 1,
 types: ["Try-on", "Pickup", "Return"],
 leadHours: 12,
 horizonDays: 60,
 requireApproval: true,
 depositCents: 0,
 depositCredits: true,
 bookingUrl: null,
 embedBooking: true,
 intro: null,
 notifyOnBooking: true,
 notifyEmail: null,
 reminderHours: 24,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function bool(v: unknown, fallback: boolean): boolean {
 return typeof v === "boolean" ? v : fallback;
}
function count(v: unknown, fallback: number, max: number): number {
 const n = typeof v === "number" ? v : Number(v);
 if (!Number.isFinite(n)) return fallback;
 return Math.min(Math.max(Math.round(n), 0), max);
}

/** Drop anything that isn't a real weekday window — one malformed row must not break the diary. */
export function windows(v: unknown): OpeningWindow[] {
 if (!Array.isArray(v)) return [];
 return v
  .filter((w): w is OpeningWindow =>
   Boolean(w) && typeof w === "object"
   && Number.isInteger((w as OpeningWindow).day) && (w as OpeningWindow).day >= 0 && (w as OpeningWindow).day <= 6
   && TIME.test(String((w as OpeningWindow).start)) && TIME.test(String((w as OpeningWindow).end))
   && String((w as OpeningWindow).start) < String((w as OpeningWindow).end))
  .map((w) => ({ day: w.day, start: w.start, end: w.end }))
  .slice(0, 40);
}

/** Fold a stored blob onto the defaults. Bad values fall back rather than throw. */
export function resolveAppointmentSettings(stored?: Partial<AppointmentSettings> | null): AppointmentSettings {
 const s = { ...DEFAULT_APPOINTMENT_SETTINGS, ...(stored || {}) } as Record<string, unknown>;
 const d = DEFAULT_APPOINTMENT_SETTINGS;
 return {
  enabled: bool(s.enabled, d.enabled),
  openingHours: windows(s.openingHours),
  blackoutDates: Array.isArray(s.blackoutDates)
   ? s.blackoutDates.filter((x) => typeof x === "string" && DAY.test(x)).slice(0, 366)
   : d.blackoutDates,
  slotMinutes: Math.min(Math.max(count(s.slotMinutes, d.slotMinutes, 480), 5), 480),
  slotCapacity: Math.min(Math.max(count(s.slotCapacity, d.slotCapacity, 50), 1), 50),
  types: Array.isArray(s.types)
   ? (s.types.filter((t) => typeof t === "string" && t.trim()).map((t) => String(t).trim().slice(0, 40)).slice(0, 8) || d.types)
   : d.types,
  leadHours: count(s.leadHours, d.leadHours, 24 * 90),
  horizonDays: Math.max(1, count(s.horizonDays, d.horizonDays, 730)),
  requireApproval: bool(s.requireApproval, d.requireApproval),
  depositCents: count(s.depositCents, d.depositCents, 100_000_00),
  depositCredits: bool(s.depositCredits, d.depositCredits),
  bookingUrl: typeof s.bookingUrl === "string" && /^https?:\/\//i.test(s.bookingUrl.trim()) ? s.bookingUrl.trim().slice(0, 500) : null,
  embedBooking: bool(s.embedBooking, d.embedBooking),
  intro: typeof s.intro === "string" && s.intro.trim() ? s.intro.trim().slice(0, 600) : null,
  notifyOnBooking: bool(s.notifyOnBooking, d.notifyOnBooking),
  notifyEmail: typeof s.notifyEmail === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.notifyEmail.trim())
   ? s.notifyEmail.trim().slice(0, 200) : null,
  // Capped at four weeks: past that it isn't a reminder, it's a second confirmation.
  reminderHours: count(s.reminderHours, d.reminderHours, 24 * 28),
 };
}

export type AppointmentWarning = "no-hours" | "deposit-without-payments" | "external-link-hides-diary";

/** Combinations that are legal but will confuse — surfaced on the form, not discovered later. */
export function appointmentWarnings(s: AppointmentSettings, opts?: { paymentsReady?: boolean }): AppointmentWarning[] {
 const w: AppointmentWarning[] = [];
 if (s.enabled && !s.bookingUrl && s.openingHours.length === 0) w.push("no-hours");
 if (s.depositCents > 0 && opts?.paymentsReady === false) w.push("deposit-without-payments");
 if (s.bookingUrl && s.openingHours.length > 0) w.push("external-link-hides-diary");
 return w;
}
