// A lot on the phone: "these 12 cost £340 total". Mirrors app/lib/lot-core.ts on the server —
// same remainder rule, so the numbers she sees before saving are the numbers that get saved.

// Pennies matter on a per-piece cost (£33.34, not £33), so this formats its own — Home's
// formatMoney rounds to whole units on purpose.
const SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };
function pennies(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  const symbol = SYMBOLS[code] ?? `${code} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function splitLotCost(totalCents: number, ids: string[], weights?: Record<string, number | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!ids.length) return out;
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const w = ids.map((id) => Math.max(0, Math.round(Number(weights?.[id]) || 0)));
  const proportional = weights != null && w.every((x) => x > 0);
  const sumW = proportional ? w.reduce((s, x) => s + x, 0) : ids.length;
  let allotted = 0;
  ids.forEach((id, i) => {
    const share = Math.floor((total * (proportional ? w[i] : 1)) / sumW);
    out[id] = share;
    allotted += share;
  });
  let rest = total - allotted;
  for (const id of ids) {
    if (rest <= 0) break;
    out[id] += 1;
    rest -= 1;
  }
  return out;
}

/** A short random id that ties a batch together — same shape as the server's (app/lib/lot-core.ts
 *  newLotId), so a lot minted on the phone reads like one minted on the web. One per batch. */
export function newLotId(random: () => number = Math.random): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += alphabet[Math.floor(random() * alphabet.length)];
  return `lot_${s}`;
}

/** Today as the plain date the server's acquired_at column takes. */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** "£33.34 each, give or take a penny" — or nothing when there is nothing to say. */
export function lotLine(count: number, totalCents: number, currency: string): string | null {
  if (!(count > 0) || !(totalCents > 0)) return null;
  return `${pennies(Math.round(totalCents / count), currency)} each, give or take a penny`;
}
