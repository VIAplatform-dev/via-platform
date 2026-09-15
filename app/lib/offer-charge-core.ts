// What a binding offer is allowed to charge, decided without touching Stripe or the database.
//
// The part that matters is the part that can be tested: whether an offer may be charged at all, and
// exactly what the PaymentIntent carries. The metadata is the whole point of this file. It is the
// contract with the Stripe webhook, which reads these keys to build the order, mark the piece sold,
// credit the consignor and send the label. A key spelled differently here is a sale that takes the
// buyer's money and never ships.
//
// Lives apart from offer-charge.ts because that file imports `server-only` and the Stripe client,
// so no test can load it. See tax-reversal-core.ts for the same split.

export type ShipTo = {
 name?: string | null; line1?: string | null; line2?: string | null; city?: string | null;
 state?: string | null; zip?: string | null; country?: string | null; phone?: string | null;
};

export type ChargeableOffer = {
 binding?: boolean | null;
 itemId?: string | null;
 token: string;
 amountCents: number;
 buyerName?: string | null;
 buyerEmail?: string | null;
 stripeCustomerId?: string | null;
 stripePaymentMethodId?: string | null;
 shipTo?: ShipTo | null;
 consumedAt?: string | null;
};

export type ChargeBlock = "not-binding" | "no-card" | "already-sold";

/** An offer with everything the charge needs, proven present rather than hoped for. */
export type ReadyOffer = ChargeableOffer & {
 itemId: string; stripeCustomerId: string; stripePaymentMethodId: string; shipTo: ShipTo;
};

export type ChargePlan = { ok: false; reason: ChargeBlock } | { ok: true; offer: ReadyOffer };

/**
 * Whether this offer may be charged, and if so with what.
 *
 * It answers in a shape the type checker understands, so the caller cannot reach for a card that
 * was never saved: on the way out, `plan.offer.stripePaymentMethodId` is a string, not a maybe.
 *
 * `already-sold` is the case worth spelling out: an offer the webhook has already redeemed has a
 * sale behind it, and Accept pressed a second time must not reach for the card again. Stripe's
 * idempotency key catches the same thing a moment later, but only inside its 24-hour window.
 */
export function planOfferCharge(offer: ChargeableOffer): ChargePlan {
 if (!offer.binding) return { ok: false, reason: "not-binding" };
 if (offer.consumedAt) return { ok: false, reason: "already-sold" };
 if (!offer.stripePaymentMethodId || !offer.stripeCustomerId || !offer.shipTo || !offer.itemId) {
  // A binding offer made before the card was collected, or one where the buyer never finished.
  return { ok: false, reason: "no-card" };
 }
 return { ok: true, offer: offer as ReadyOffer };
}

/**
 * The PaymentIntent metadata, in the exact shape the storefront's own checkout sends.
 *
 * `shipping_paid_cents` is "0" on purpose. A binding offer is agreed on the piece alone: the buyer
 * gave an address so it can be sent, and charging her a postage figure she never saw at offer time
 * would be a number nobody agreed to.
 */
export function offerChargeMetadata(offer: ChargeableOffer, sellerId: string): Record<string, string> {
 const ship = offer.shipTo || {};
 return {
  itemId: String(offer.itemId || ""),
  sellerId,
  ship_name: String(ship.name || offer.buyerName || ""),
  ship_line1: String(ship.line1 || ""),
  ship_line2: String(ship.line2 || ""),
  ship_city: String(ship.city || ""),
  ship_state: String(ship.state || ""),
  ship_zip: String(ship.zip || ""),
  ship_country: String(ship.country || "US"),
  buyer_phone: String(ship.phone || ""),
  buyer_email: String(offer.buyerEmail || ""),
  shipping_paid_cents: "0",
  sale_price_cents: String(offer.amountCents),
  // The webhook marks the offer redeemed off this, so an accepted offer can never be spent twice.
  offer_token: offer.token,
 };
}

/** One charge per offer, however many times Accept is pressed. */
export function offerIdempotencyKey(token: string): string {
 return `offer-accept-${token}`;
}
