// Splitting one payment across several pieces. Pure — no I/O.
//
// "These 20 cost £340" is how she actually buys; a per-piece cost is something she works out later,
// if ever. Writing a cost onto every piece is what lets the margin report count them, and the split
// has to add up to the penny — anything else is a number she can't reconcile with her bank
// statement. The phone mirrors this in mobile/lib/seller/cost-split.ts.
//
// This is all that remains of lot-core.ts. Lots — a batch's source, its acquired date and the lot id
// tying it together — were removed; the arithmetic stayed, because bulk cost entry ("these 20 cost
// £340, divide it") is a separate feature from recording where they came from.

/**
 * Split `totalCents` across `ids`. With `weights` (usually list prices in cents), each piece
 * carries its share of the total in proportion; any piece whose weight is missing or zero makes
 * the split fall back to equal, so no piece is starved. Remainder pennies go to the first pieces.
 */
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
