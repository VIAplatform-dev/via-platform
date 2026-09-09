// Splitting one payment across several pieces, and the line that describes it. Mirrors
// app/lib/cost-split.ts — the phone and the web must divide a batch the same way to the penny.
//
// All that remains of lot.ts: lots (a batch’s source, acquired date and lot id) were removed;
// dividing what a batch cost is a separate feature and stayed.

// Pennies matter on a per-piece cost (£33.34, not £33), so this formats its own — Home's
// formatMoney rounds to whole units on purpose.
const SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };
function pennies(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  const symbol = SYMBOLS[code] ?? `${code} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function splitCostAcross(totalCents: number, ids: string[], weights?: Record<string, number | null | undefined>): Record<string, number> {
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

/** "£33.34 each, give or take a penny" — or nothing when there is nothing to say. */
export function batchCostLine(count: number, totalCents: number, currency: string): string | null {
  if (!(count > 0) || !(totalCents > 0)) return null;
  return `${pennies(Math.round(totalCents / count), currency)} each, give or take a penny`;
}
