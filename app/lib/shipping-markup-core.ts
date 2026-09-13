// What the buyer pays for shipping: the real label, plus a markup.
//
// WHY THIS REPLACES THE FLAT TIERS. VYA charged one national price per parcel size — $8 / $14 /
// $24 — and bought the real label afterwards. Carriers charge by DISTANCE, so one national price
// is wrong at both ends of the country at once:
//
//   · A large coat across town costs $14.02 and the buyer was charged $24. Ten dollars of postage
//     markup on an order is the kind of number that loses the sale, and the store's customer.
//   · The same coat coast-to-coast costs $31.07 and the buyer was still charged $24, so VYA ate
//     $7.07 — every time.
//
// The tiers were also a fiction in a way nobody expected: measured on USPS Ground Advantage, a
// 12oz parcel costs $6.00 and a 40oz parcel costs $5.68 over the same route. Heavier is CHEAPER,
// because under a pound is priced in ounce bands and at/over a pound switches to the commercial
// pound table. No size ladder we invent can track that. The real rate can.
//
// So: quote the actual rate for this parcel, this route, and add a margin. Nearer buyers pay less,
// far buyers pay what it costs, and there is no route on which VYA loses money.

/** The house policy. One place, so a change is one diff. */
export type MarkupPolicy = {
  /** Proportional markup, e.g. 0.15 for 15%. */
  pct: number;
  /**
   * The least VYA will make on any label, in cents.
   *
   * A percentage alone collapses on cheap postage: 10% of a $6 label is 60¢, and the card fee on
   * that same $6 is about 47¢, so the "markup" is four pence. The floor is what makes a small
   * parcel worth carrying.
   */
  minMarginCents: number;
};

export const DEFAULT_MARKUP: MarkupPolicy = { pct: 0.15, minMarginCents: 150 };

/**
 * The buyer's shipping price for a real label cost.
 *
 * Rounded UP to the whole unit. Up, not nearest: rounding $13.20 down to $13 gives away part of
 * the margin the policy just calculated, and a shipping line reading $13 rather than $13.20 is
 * worth the few cents either way. Whole numbers only — postage quoted to the penny reads as a
 * carrier passthrough, and invites the question of why it isn't exactly the carrier's price.
 */
export function buyerShippingCents(realCostCents: number, policy: MarkupPolicy = DEFAULT_MARKUP): number {
  const cost = Math.max(0, Math.round(realCostCents));
  if (cost === 0) return 0;
  const byPct = cost * (1 + policy.pct);
  const byFloor = cost + policy.minMarginCents;
  return Math.ceil(Math.max(byPct, byFloor) / 100) * 100;
}

/** What VYA clears on that quote. Never negative by construction — that is the point. */
export function markupMarginCents(realCostCents: number, policy: MarkupPolicy = DEFAULT_MARKUP): number {
  return buyerShippingCents(realCostCents, policy) - Math.max(0, Math.round(realCostCents));
}

/**
 * Which rule bound this quote — the percentage or the floor.
 *
 * Worth being able to see: if the floor binds on nearly every order, the percentage is decoration
 * and the policy is really a flat fee, which is a different conversation about pricing.
 */
export function bindingRule(realCostCents: number, policy: MarkupPolicy = DEFAULT_MARKUP): "pct" | "floor" {
  const cost = Math.max(0, Math.round(realCostCents));
  return cost * policy.pct >= policy.minMarginCents ? "pct" : "floor";
}

/**
 * The quote, with everything a caller might want to show or log.
 *
 * `estDays` and `service` ride along because a buyer choosing between $9 in 5 days and $14 in 2 is
 * making a real decision, and the flat tier could never offer it.
 */
export type ShippingQuote = {
  buyerPaysCents: number;
  realCostCents: number;
  marginCents: number;
  service: string;
  estDays: number | null;
};

export function quoteFromRate(
  rate: { amountCents: number; provider?: string; service?: string; estDays?: number | null },
  policy: MarkupPolicy = DEFAULT_MARKUP,
): ShippingQuote {
  const realCostCents = Math.max(0, Math.round(rate.amountCents));
  const buyerPaysCents = buyerShippingCents(realCostCents, policy);
  return {
    buyerPaysCents,
    realCostCents,
    marginCents: buyerPaysCents - realCostCents,
    // The CARRIER's name is deliberately not shown to the buyer. "VYA Standard" is a promise VYA
    // keeps; "USPS Ground Advantage" is one USPS keeps, and the buyer did not buy from USPS.
    service: (rate.estDays != null && rate.estDays <= 3) ? "Express" : "Standard",
    estDays: rate.estDays ?? null,
  };
}
