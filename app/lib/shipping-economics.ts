import { SHIPPING_TIERS, MIN_MARGIN_CENTS, assignTier, type TierId, type ParcelDims } from "./shipping-tiers.ts";

// What shipping actually costs, and what it has to be priced at not to lose money.
//
// Everything here is arithmetic over SHIPPING_TIERS and measured carrier rates. It exists because
// three different people need an answer the tier table alone does not give:
//
//   · VYA, when the buyer pays the flat tier: are we clearing a margin, or eating one?
//   · the store, when IT pays (free shipping): what is this actually going to cost me?
//   · both, for expedited: what would a faster service have to be priced at to break even?
//
// THE ZONE IS THE MISSING VARIABLE. The flat tiers are one price per size, nationwide, but a
// carrier charges by distance: a 90oz parcel is roughly twice the price to the far coast as it is
// across town. A tier priced off a near-zone label looks healthy and loses money long-haul.
// Measured on Shippo (cheapest available service, a 12oz / 40oz / 90oz parcel in each tier's box):
//
//            near (zone 1)   far (zone 8)   buyer pays   margin near   margin far
//   small         $6.00          $6.95          $8.00       +$2.00        +$1.05
//   medium        $5.68         $10.05         $14.00       +$8.32        +$3.95
//   large        $14.02         $31.07         $24.00       +$9.98        −$7.07
//
// Large loses money to the far coast, and small is under the $2.50 target there. Those are the two
// numbers to argue with; this module is how anything in the app can show them rather than guess.

/** How far a parcel is going, in the only two buckets worth pricing against. */
export type Zone = "near" | "far";

/**
 * Measured cheapest-available carrier cost per tier, in cents, near and far.
 *
 * Not a guess: sampled from live rate calls. Re-sample and update when carriers re-price. Every
 * number that depends on real postage reads from here, so there is one place to correct.
 */
export const MEASURED_COST_CENTS: Record<TierId, Record<Zone, number>> = {
  small: { near: 600, far: 695 },
  medium: { near: 568, far: 1005 },
  large: { near: 1402, far: 3107 },
};

/**
 * Expedited (1–3 day) cost per tier, as a multiple of the cheapest ground service.
 *
 * Measured in the same sample: Priority Mail ran about 1.4–1.6× Ground Advantage near and far, and
 * UPS 3 Day Select about 1.7–1.8× Ground Saver. 1.6 is the honest middle. Expressed as a ratio
 * rather than a table because it holds across zones far better than an absolute number does.
 */
export const EXPEDITED_MULTIPLIER = 1.6;

export type TierEconomics = {
  tierId: TierId;
  label: string;
  buyerPaysCents: number;
  costNearCents: number;
  costFarCents: number;
  marginNearCents: number;
  marginFarCents: number;
  /** True when the far-zone label costs MORE than the buyer paid. Money out of the door. */
  losesMoneyFar: boolean;
  /** True when even the far-zone margin clears the target. */
  healthy: boolean;
  /** What the buyer would have to pay for the far zone to clear MIN_MARGIN_CENTS. */
  breakEvenPriceCents: number;
};

/** The full picture for one tier. */
export function tierEconomics(tierId: TierId): TierEconomics {
  const tier = SHIPPING_TIERS.find((t) => t.id === tierId)!;
  const costNearCents = MEASURED_COST_CENTS[tierId].near;
  const costFarCents = MEASURED_COST_CENTS[tierId].far;
  const marginNearCents = tier.priceCents - costNearCents;
  const marginFarCents = tier.priceCents - costFarCents;
  return {
    tierId,
    label: tier.label,
    buyerPaysCents: tier.priceCents,
    costNearCents,
    costFarCents,
    marginNearCents,
    marginFarCents,
    losesMoneyFar: marginFarCents < 0,
    healthy: marginFarCents >= MIN_MARGIN_CENTS,
    breakEvenPriceCents: breakEvenPriceCents(costFarCents),
  };
}

export const allTierEconomics = (): TierEconomics[] => SHIPPING_TIERS.map((t) => tierEconomics(t.id));

/**
 * What to charge for a label that costs this much, to clear the target margin.
 *
 * Rounded UP to the nearest dollar. A price ending in .37 reads as a carrier passthrough, which
 * is exactly what the flat tier is trying not to be.
 */
export function breakEvenPriceCents(costCents: number, minMarginCents: number = MIN_MARGIN_CENTS): number {
  return Math.ceil((costCents + minMarginCents) / 100) * 100;
}

/** The expedited cost for a tier and zone, from the ground cost. */
export function expeditedCostCents(tierId: TierId, zone: Zone): number {
  return Math.round(MEASURED_COST_CENTS[tierId][zone] * EXPEDITED_MULTIPLIER);
}

/**
 * What expedited should be priced at per tier: break-even on the FAR zone.
 *
 * Priced off the far zone, not an average, and this is the whole lesson of the table above. One
 * flat national price has to survive its worst case or the long-haul orders quietly fund
 * themselves out of the short-haul ones, which is exactly how Large ended up losing $7.
 */
export function expeditedPriceCents(tierId: TierId): number {
  return breakEvenPriceCents(expeditedCostCents(tierId, "far"));
}

/**
 * What a STORE should expect to pay when it absorbs shipping.
 *
 * It is charged the real label, no VYA margin on top, so this is the carrier cost, and it is a
 * RANGE because the store cannot know where the buyer is when it decides to offer free shipping.
 * Showing one number here would be a promise we cannot keep.
 */
export function storeCostRangeCents(tierId: TierId): { lowCents: number; highCents: number } {
  return { lowCents: MEASURED_COST_CENTS[tierId].near, highCents: MEASURED_COST_CENTS[tierId].far };
}

/** The same, for whatever parcel a piece actually is. */
export function storeCostForParcel(p?: ParcelDims | null): { tierId: TierId; lowCents: number; highCents: number } {
  const tier = assignTier(p);
  return { tierId: tier.id, ...storeCostRangeCents(tier.id) };
}

/**
 * The sentence a store reads before choosing to pay for shipping.
 *
 * Named amounts, both ends, and who is charged. A store switching on free shipping without ever
 * being shown a number is agreeing to an unknown cost on every order it takes.
 */
export function storeCostLine(tierId: TierId, currency: string = "USD"): string {
  const { lowCents, highCents } = storeCostRangeCents(tierId);
  const tier = SHIPPING_TIERS.find((t) => t.id === tierId)!;
  const s = currency.toUpperCase() === "GBP" ? "£" : currency.toUpperCase() === "EUR" ? "€" : "$";
  const m = (c: number) => `${s}${(c / 100).toFixed(2)}`;
  return `${tier.label}: ${m(lowCents)}–${m(highCents)} depending how far it goes.`;
}
