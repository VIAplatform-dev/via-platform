// Holds — a piece kept back for a named customer.
//
// A hold IS a reservation: same table, same "not for sale while it stands" semantics, same sweep
// that releases it when it lapses. The only thing that makes it a hold is the owner tag, so nothing
// here touches the database — just the tag, the arithmetic and the words.

export const HOLD_PREFIX = "hold:";
export const MAX_HOLD_DAYS = 30;

/** The four lengths a hold is offered at — the same chips on the web and the phone. */
export const HOLD_LENGTHS = [
 { days: 1, label: "Tonight" },
 { days: 3, label: "3 days" },
 { days: 7, label: "A week" },
 { days: 14, label: "2 weeks" },
] as const;
const DAY = 86_400;

export function holdRef(name: string): string {
 return HOLD_PREFIX + name.trim();
}

export function parseHoldRef(ref: string | null | undefined): { name: string } | null {
 if (!ref || !ref.startsWith(HOLD_PREFIX)) return null;
 return { name: ref.slice(HOLD_PREFIX.length) };
}

/** Seconds from `now` until the hold lapses. Throws on the past or anything past a month. */
export function holdUntil(input: { days?: number; until?: string }, now = new Date()): number {
 let seconds: number;
 if (input.until) {
  const t = Date.parse(input.until);
  if (!Number.isFinite(t)) throw new Error("Hold end must be a date");
  seconds = Math.round((t - now.getTime()) / 1000);
 } else {
  seconds = Math.round((input.days ?? 0) * DAY);
 }
 if (seconds <= 0) throw new Error("Hold end must be in the future");
 if (seconds > MAX_HOLD_DAYS * DAY) throw new Error(`A hold can last at most ${MAX_HOLD_DAYS} days`);
 return seconds;
}

export type HoldSummary = { itemId: string; name: string; expiresAt: string };

/** Holds that lapse before the end of today (UTC) and before the end of the week after that. */
export function holdsDueSoon<T extends { expiresAt: string }>(holds: T[], now = new Date()): { today: T[]; thisWeek: T[] } {
 const endOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
 const endOfWeek = endOfToday + 7 * DAY * 1000;
 const today: T[] = [];
 const thisWeek: T[] = [];
 for (const h of holds) {
  const t = Date.parse(h.expiresAt);
  if (!Number.isFinite(t)) continue;
  if (t < endOfToday) today.push(h);
  else if (t < endOfWeek) thisWeek.push(h);
 }
 return { today, thisWeek };
}

/** "until tonight" · "until tomorrow" · "3 days left" · "lapsed" — the clock half of every hold line. */
export function holdTiming(h: { expiresAt: string }, now = new Date()): string {
 const left = Date.parse(h.expiresAt) - now.getTime();
 const endOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
 const endOfTomorrow = endOfToday + DAY * 1000;
 const t = Date.parse(h.expiresAt);
 if (left <= 0) return "lapsed";
 if (t < endOfToday) return "until tonight";
 if (t < endOfTomorrow) return "until tomorrow";
 const days = Math.round(left / (DAY * 1000));
 return `${days} day${days === 1 ? "" : "s"} left`;
}

/** The sentence on a piece: "Held for Ana · 3 days left", or "On hold · until tonight" with no name. */
export function describeHold(h: { name: string; expiresAt: string }, now = new Date()): string {
 const who = h.name ? `Held for ${h.name}` : "On hold";
 return `${who} · ${holdTiming(h, now)}`;
}

/**
 * The status pill: "On hold · Ana · 3 days left". Starts with the state so it reads in the same
 * column as "Live" and "Sold", then who, then how long — and a piece a BUYER is mid-checkout on is
 * not a hold at all: that pill stays "Reserved", which is what `hold === null` means here.
 */
export function holdPill(h: { name: string; expiresAt: string } | null | undefined, now = new Date()): string {
 if (!h) return "Reserved";
 return ["On hold", h.name || null, holdTiming(h, now)].filter(Boolean).join(" · ");
}
