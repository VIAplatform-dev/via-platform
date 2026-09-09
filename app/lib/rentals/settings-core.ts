// ───────────────────────────────────────────────────────────────────────────
// Rental settings — the store's house rules, and how an item overrides them.
//
// Pure and unit-tested, no I/O. Every number a rental shop might argue about is
// here with a default; nothing about how rentals work is hardcoded elsewhere.
// Two layers resolve in one direction: ITEM overrides beat STORE settings beat
// DEFAULTS. Same precedence store_policies already uses for returns.
// ───────────────────────────────────────────────────────────────────────────

export type BookingMode = "open" | "request" | "both";
export type Security = "none" | "deposit" | "waiver";
export type Fulfilment = "ship" | "pickup" | "both";

export type RentalSettings = {
 enabled: boolean;
 /** Who may book: straight through, by application, or the item decides. */
 bookingMode: BookingMode;
 /** Does an unanswered application hold the dates? The store's call, not ours. */
 requestHoldsDates: boolean;
 /** How long that hold survives before the sweeper releases it. */
 requestHoldHours: number;

 minDays: number;
 maxDays: number;
 /** How far ahead the calendar opens. */
 horizonDays: number;
 /** Minimum notice before a rental may start. 0 allows same-day. */
 leadDays: number;

 // The three bands that make a rental occupy more days than it bills for. Each
 // is the store's own measurement — "two days to ship, three to clean" — and
 // each can be 0 for a shop that hands pieces over in person and doesn't clean.
 shipOutDays: number;
 shipBackDays: number;
 turnaroundDays: number;

 dryCleaning: boolean;
 prepaidLabel: boolean;

 lateFees: boolean;
 lateFeeCentsPerDay: number;

 security: Security;
 depositCents: number | null;
 waiverPct: number;

 showMarketValue: boolean;
 fulfilment: Fulfilment;
 appointments: boolean;
 termsText: string | null;

 // The words on the storefront. A vintage archive and a bridal showroom describe the same
 // transaction very differently, and "NYC Pickup" is a real answer a store wants to give where
 // "Local pickup" is not.
 rentLabel: string;
 pickupLabel: string;
 deliverLabel: string;
 /** "Will this fit?" links here when set — a size guide, a measurements page, whatever they have. */
 fitGuideUrl: string | null;
 /** Replaces the assembled sentence under the button when a store would rather write its own. */
 highlightsText: string | null;
};

/** What a store gets if it touches nothing: a sensible rental business. */
export const DEFAULT_SETTINGS: RentalSettings = {
 enabled: false,
 bookingMode: "open",
 requestHoldsDates: true,
 requestHoldHours: 48,
 minDays: 4,
 maxDays: 28,
 horizonDays: 90,
 leadDays: 2,
 shipOutDays: 1,
 shipBackDays: 2,
 turnaroundDays: 2,
 dryCleaning: true,
 prepaidLabel: true,
 lateFees: true,
 lateFeeCentsPerDay: 5000,
 security: "waiver",
 depositCents: null,
 waiverPct: 10,
 showMarketValue: true,
 fulfilment: "ship",
 appointments: false,
 termsText: null,
 rentLabel: "Rent now",
 pickupLabel: "Local pickup",
 deliverLabel: "Deliver",
 fitGuideUrl: null,
 highlightsText: null,
};

const MODES: BookingMode[] = ["open", "request", "both"];
const SECURITIES: Security[] = ["none", "deposit", "waiver"];
const FULFILMENTS: Fulfilment[] = ["ship", "pickup", "both"];

function bool(v: unknown, fallback: boolean): boolean {
 return typeof v === "boolean" ? v : fallback;
}
/** Whole days/cents only, never negative, and never silently NaN. */
function count(v: unknown, fallback: number, max = 3650): number {
 const n = typeof v === "number" ? v : Number(v);
 if (!Number.isFinite(n)) return fallback;
 return Math.min(Math.max(Math.round(n), 0), max);
}
/** A label a store typed. Blank falls back to ours — an empty button is never what they meant. */
function text(v: unknown, fallback: string, max: number): string {
 return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
}
function oneOf<T extends string>(v: unknown, allowed: T[], fallback: T): T {
 return typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Fold store settings and item overrides onto the defaults. Unknown keys are
 * ignored and bad values fall back rather than throw — an override blob is
 * seller-entered JSON, and one bad field must never take a listing down.
 */
export function resolveSettings(
 store?: Partial<RentalSettings> | null,
 overrides?: Partial<RentalSettings> | null,
): RentalSettings {
 const s = { ...DEFAULT_SETTINGS, ...(store || {}), ...(overrides || {}) } as Record<string, unknown>;
 const d = DEFAULT_SETTINGS;
 const out: RentalSettings = {
  enabled: bool(s.enabled, d.enabled),
  bookingMode: oneOf(s.bookingMode, MODES, d.bookingMode),
  requestHoldsDates: bool(s.requestHoldsDates, d.requestHoldsDates),
  requestHoldHours: count(s.requestHoldHours, d.requestHoldHours, 24 * 30),
  minDays: Math.max(1, count(s.minDays, d.minDays)),
  maxDays: Math.max(1, count(s.maxDays, d.maxDays)),
  horizonDays: Math.max(1, count(s.horizonDays, d.horizonDays)),
  leadDays: count(s.leadDays, d.leadDays),
  shipOutDays: count(s.shipOutDays, d.shipOutDays, 60),
  shipBackDays: count(s.shipBackDays, d.shipBackDays, 60),
  turnaroundDays: count(s.turnaroundDays, d.turnaroundDays, 60),
  dryCleaning: bool(s.dryCleaning, d.dryCleaning),
  prepaidLabel: bool(s.prepaidLabel, d.prepaidLabel),
  lateFees: bool(s.lateFees, d.lateFees),
  lateFeeCentsPerDay: count(s.lateFeeCentsPerDay, d.lateFeeCentsPerDay, 100_000_00),
  security: oneOf(s.security, SECURITIES, d.security),
  depositCents: s.depositCents == null ? null : count(s.depositCents, 0, 100_000_00),
  waiverPct: Math.min(count(s.waiverPct, d.waiverPct, 100), 100),
  showMarketValue: bool(s.showMarketValue, d.showMarketValue),
  fulfilment: oneOf(s.fulfilment, FULFILMENTS, d.fulfilment),
  appointments: bool(s.appointments, d.appointments),
  termsText: typeof s.termsText === "string" && s.termsText.trim() ? s.termsText : d.termsText,
  rentLabel: text(s.rentLabel, d.rentLabel, 40),
  pickupLabel: text(s.pickupLabel, d.pickupLabel, 40),
  deliverLabel: text(s.deliverLabel, d.deliverLabel, 40),
  fitGuideUrl: typeof s.fitGuideUrl === "string" && /^https?:\/\//i.test(s.fitGuideUrl.trim()) ? s.fitGuideUrl.trim().slice(0, 500) : null,
  highlightsText: typeof s.highlightsText === "string" && s.highlightsText.trim() ? s.highlightsText.trim().slice(0, 400) : null,
 };
 // A max below the min is unbookable rather than wrong-but-usable, so widen it.
 if (out.maxDays < out.minDays) out.maxDays = out.minDays;
 return out;
}

export type SettingsWarning =
 | "deposit-outlives-authorisation"
 | "pickup-with-prepaid-label"
 | "late-fee-without-late-fees"
 | "deposit-without-amount"
;

/**
 * Combinations that are legal but will misbehave. Surfaced on the settings
 * screen rather than discovered downstream — with this many toggles, the ugly
 * bugs live in the odd pairings, not in any single field.
 */
export function settingsWarnings(s: RentalSettings): SettingsWarning[] {
 const w: SettingsWarning[] = [];
 // Card authorisations lapse around 7 days; a longer rental outlives the hold.
 if (s.security === "deposit" && s.maxDays > 7) w.push("deposit-outlives-authorisation");
 if (s.security === "deposit" && !s.depositCents) w.push("deposit-without-amount");
 if (s.fulfilment === "pickup" && s.prepaidLabel) w.push("pickup-with-prepaid-label");
 if (!s.lateFees && s.lateFeeCentsPerDay > 0) w.push("late-fee-without-late-fees");
 return w;
}
