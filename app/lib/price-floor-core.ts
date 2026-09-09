// Which pieces are priced below what the seller decided she must make on them.
//
// Her floor is cost plus her minimum markup. On the one-at-a-time form the floor is known while she
// is still typing, so it simply holds the price up. Bulk cannot work that way: she buys a lot ("these
// twenty cost £340") and the cost is split across the pieces IN PROPORTION TO THEIR PRICES, so the
// per-piece cost does not exist until after they are priced. There is no earlier moment to check.
//
// So the check happens the instant the cost lands, and this is the arithmetic for it. Pure — no I/O —
// so the rule can be tested without a database.

export type FloorMiss = { id: string; priceCents: number; costCents: number; floorCents: number; shortCents: number };

/** Cost plus the markup, in cents. `bps` is basis points: 3000 = 30%. */
export function floorFor(costCents: number, minMarkupBps: number): number {
 return Math.round(costCents * (1 + minMarkupBps / 10000));
}

/**
 * The pieces whose price sits under their own floor, worst shortfall first.
 *
 * A piece with no cost, or no price, is not a miss — a floor over an unknown cost is not a floor, and
 * an unpriced draft has not been priced wrongly yet. Both are skipped rather than reported, so the
 * warning only ever names pieces she can actually act on.
 */
export function findBelowFloor(
 ids: string[],
 prices: Record<string, number | null | undefined>,
 costs: Record<string, number | null | undefined>,
 minMarkupBps: number,
): FloorMiss[] {
 const out: FloorMiss[] = [];
 for (const id of ids) {
  const priceCents = Math.round(Number(prices[id]) || 0);
  const costCents = Math.round(Number(costs[id]) || 0);
  if (priceCents <= 0 || costCents <= 0) continue;
  const floorCents = floorFor(costCents, minMarkupBps);
  if (priceCents >= floorCents) continue;
  out.push({ id, priceCents, costCents, floorCents, shortCents: floorCents - priceCents });
 }
 return out.sort((a, b) => b.shortCents - a.shortCents);
}

/** How to say it, in her words rather than basis points. */
export function describeBelowFloor(misses: FloorMiss[], minMarkupBps: number): string {
 if (!misses.length) return "";
 const pct = Math.round(minMarkupBps / 100);
 const n = misses.length;
 return n === 1
  ? `1 piece is priced below your ${pct}% minimum over what you paid.`
  : `${n} pieces are priced below your ${pct}% minimum over what you paid.`;
}
