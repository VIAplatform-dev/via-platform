// ───────────────────────────────────────────────────────────────────────────
// Sending at a fixed EASTERN hour from a UTC-only scheduler.
//
// Vercel cron expressions have no timezone — the docs are explicit that "the timezone is always
// UTC". So a single expression cannot mean "5 PM in New York": 5 PM Eastern is 21:00 UTC while
// daylight time is in effect and 22:00 UTC the rest of the year. Pick one and the email arrives an
// hour early or an hour late for roughly half of every year.
//
// So both slots are registered, and this decides which one is genuinely 5 PM today. The other
// returns without sending.
//
// It FAILS OPEN by design: the check only applies when the request carries one of our own
// schedules. A manual trigger, or a schedule still registered on Vercel from an older deployment,
// sends exactly as it would have before rather than being silently suppressed — a guard that can
// accidentally cancel the weekly email is worse than one that occasionally lets it through early.
// ───────────────────────────────────────────────────────────────────────────

/** The two UTC slots that are 5 PM Eastern — one for daylight time, one for standard time. */
export const FIVE_PM_EASTERN_SLOTS = ["0 21 * * 2", "0 22 * * 2"];

const TARGET_HOUR = 17; // 5 PM

/** The hour (0–23) it currently is in New York, whatever the server's own clock is set to. */
export function easternHour(now: Date): number {
 return Number(
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(now),
 );
}

/**
 * Should this invocation go ahead?
 *
 * @param schedule the `x-vercel-cron-schedule` header, or null for a manual/unknown caller
 * @param now      the moment the request arrived
 */
export function shouldSendAtFivePmEastern(schedule: string | null | undefined, now: Date): boolean {
 if (!schedule || !FIVE_PM_EASTERN_SLOTS.includes(schedule)) return true; // not ours → don't interfere
 return easternHour(now) === TARGET_HOUR;
}
