// Whether this piece is priced under what she decided she must make on it.
//
// Mirrors app/lib/price-floor-core.ts — the phone and the web must put the floor at the same penny,
// and the raise lands on that same `floorCents` rather than a tidied-up number, so a piece raised
// here ends up exactly where the web's "Raise them to my floor" would have put it.
//
// WHY THE PHONE NEEDS THIS AT ALL. On the web's one-at-a-time form the cost is typed before the
// price, so the floor simply holds the price up as she goes and there is nothing to warn about. The
// phone cannot work that way: `priceListing` runs on the Loading screen, before Review, and the cost
// is typed on Review — so the price is decided while the cost is still unknown. That is the same
// ordering problem bulk upload has, and it gets the same answer: check the instant the cost lands,
// say what is wrong, and offer to fix it. Never rewrite silently — a price she has seen is a
// decision, and this only exists to undo a price set before the cost was known.
//
// Pure — no I/O, no React — so the rule is testable without a device.

import { formatMoney } from "./home.ts";

export type FloorMiss = { priceCents: number; costCents: number; floorCents: number; shortCents: number };

/** Cost plus the markup, in cents. `bps` is basis points: 3000 = 30%. */
export function floorFor(costCents: number, minMarkupBps: number): number {
  return Math.round(costCents * (1 + minMarkupBps / 10000));
}

/**
 * The miss, or null when there isn't one.
 *
 * No cost, or no price, is not a miss — a floor over an unknown cost is not a floor, and an unpriced
 * draft has not been priced wrongly yet. Both stay silent, which is the same rule the web's
 * `findBelowFloor` applies, so the two never disagree about whether a piece is in trouble.
 */
export function floorMissFor(
  priceCents: number | null | undefined,
  costCents: number | null | undefined,
  minMarkupBps: number | null | undefined,
): FloorMiss | null {
  const price = Math.round(Number(priceCents) || 0);
  const cost = Math.round(Number(costCents) || 0);
  if (price <= 0 || cost <= 0) return null;
  // A markup nobody has answered with yet is not a floor of zero — an absent number and a deliberate
  // 0% mean opposite things here, so `null` has to be turned away before Number() flattens it to 0.
  if (minMarkupBps == null) return null;
  const bps = Number(minMarkupBps);
  if (!Number.isFinite(bps) || bps < 0) return null;
  const floorCents = floorFor(cost, bps);
  if (price >= floorCents) return null;
  return { priceCents: price, costCents: cost, floorCents, shortCents: floorCents - price };
}

/** How to say it, in her words rather than basis points — the wording the web's pricer uses. */
export function describeFloorMiss(miss: FloorMiss, minMarkupBps: number, currency: string): string {
  const pct = Math.round(minMarkupBps / 100);
  return `Below your pricing floor — your ${pct}% minimum over the ${formatMoney(miss.costCents, currency)} you paid works out at ${formatMoney(miss.floorCents, currency)}.`;
}
