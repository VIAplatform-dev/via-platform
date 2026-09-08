// Holds on the phone — the words for a piece kept back for someone. Mirrors app/lib/holds-core.ts.

const DAY = 86_400_000;

export type HoldRow = { itemId: string; name: string; expiresAt: string; title: string | null; image?: string | null };

export const HOLD_LENGTHS = [
  { days: 1, label: "Tonight" },
  { days: 3, label: "3 days" },
  { days: 7, label: "A week" },
  { days: 14, label: "2 weeks" },
] as const;

function endOfToday(now: Date) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

export function describeHold(h: { name: string; expiresAt: string }, now = new Date()): string {
  const who = h.name ? `Held for ${h.name}` : "On hold";
  const t = Date.parse(h.expiresAt);
  const left = t - now.getTime();
  const eod = endOfToday(now);
  let when: string;
  if (left <= 0) when = "lapsed";
  else if (t < eod) when = "until tonight";
  else if (t < eod + DAY) when = "until tomorrow";
  else {
    const days = Math.round(left / DAY);
    when = `${days} day${days === 1 ? "" : "s"} left`;
  }
  return `${who} · ${when}`;
}

/** The "Needs you" line for a hold that lapses today; null for any other hold. */
export function holdLapseRow(h: { name: string; title: string | null; expiresAt: string }, now = new Date()): string | null {
  const t = Date.parse(h.expiresAt);
  if (!Number.isFinite(t) || t >= endOfToday(now)) return null;
  const piece = h.title || "a piece";
  return h.name ? `${h.name}'s hold on ${piece} lapses tonight` : `The hold on ${piece} lapses tonight`;
}
