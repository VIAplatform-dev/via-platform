/**
 * What a hosted-store checkout actually charges for getting the piece to the buyer.
 *
 * This is the ONE place that answers "how much postage is owed, and is this a collection?" — for the
 * quote the shopper sees, for the PaymentIntent that charges her, and for the Checkout Session. The
 * three used to each re-derive it inline, which is exactly how one of them ends up trusting the
 * browser.
 *
 * The rule the whole feature rests on: the shopper's choice is a CLAIM, not an instruction. It is
 * checked against what the seller actually offers (see pickup-core) before a cent comes off. A
 * request that says "pickup" at a store with no collection address is priced as a delivery, postage
 * and all — the worst a tampered request can do is make the shopper pay what she already owed.
 */

import { deliveryChoice, pickupOffered, type Delivery, type DeliveryMethod, type PickupSettings } from "./pickup-core.ts";

/** The shipping half of a store's settings. Structurally what store-shipping-db returns. */
export type ShipPolicy = {
 mode: "buyer_pays" | "store_pays" | "free_over";
 freeThresholdCents: number | null;
 pickup: PickupSettings | null;
};

export type CheckoutDelivery = Delivery & {
 /** May checkout offer collection at all? False also when the toggle is on but the address is not. */
 pickupAvailable: boolean;
 /** The store covers postage for this bag regardless of how it leaves the shop. */
 freeShipping: boolean;
};

/** Does the store absorb postage for a bag this size? */
export function freeShippingFor(settings: ShipPolicy, subtotalCents: number): boolean {
 if (settings.mode === "store_pays") return true;
 return settings.mode === "free_over" && settings.freeThresholdCents != null && subtotalCents >= settings.freeThresholdCents;
}

/**
 * Price this bag's delivery, server-side.
 *
 * `claimed` is whatever the browser said ("pickup", "ship", nonsense, nothing). `parcelShipCents` is
 * the flat tier already computed from the bag's real weight and dimensions — never a number the
 * client sent.
 */
export function resolveDelivery(args: {
 claimed?: string | null;
 subtotalCents: number;
 parcelShipCents: number;
 settings: ShipPolicy;
}): CheckoutDelivery {
 const freeShipping = freeShippingFor(args.settings, args.subtotalCents);
 const shippingCents = freeShipping ? 0 : Math.max(0, Math.round(args.parcelShipCents || 0));
 // deliveryChoice is the gate: it only returns "pickup" for a store that genuinely offers it.
 const d = deliveryChoice(args.claimed as DeliveryMethod | string | undefined, { shippingCents, pickup: args.settings.pickup });
 return { ...d, pickupAvailable: pickupOffered(args.settings.pickup), freeShipping };
}

/**
 * The delivery stamped onto the payment, so the webhook can record it on the order.
 *
 * Takes a RESOLVED Delivery, never a raw string — so nothing a shopper typed can become an order's
 * delivery method without passing resolveDelivery first.
 */
export function deliveryMetadata(d: Delivery): Record<string, string> {
 const md: Record<string, string> = { delivery: d.method };
 if (d.method === "pickup") {
  // Stripe rejects a metadata value over 500 characters and would fail the whole PaymentIntent.
  // A truncated address is a cosmetic loss; a refused payment is a lost sale.
  if (d.collectFrom) md.collect_from = d.collectFrom.slice(0, 480);
  if (d.instructions) md.collect_instructions = d.instructions.slice(0, 480);
 }
 return md;
}

/**
 * Read that stamp back off a Stripe object. Safe to trust: we wrote it. An order with no stamp — any
 * order placed before collection existed — is a delivery.
 */
export function deliveryFromMetadata(md: Record<string, string | undefined> | null | undefined): {
 method: DeliveryMethod;
 collectFrom: string | null;
 instructions: string | null;
} {
 const m = md || {};
 if (m.delivery !== "pickup") return { method: "ship", collectFrom: null, instructions: null };
 return {
  method: "pickup",
  collectFrom: (m.collect_from || "").trim() || null,
  instructions: (m.collect_instructions || "").trim() || null,
 };
}

/**
 * What the buyer actually paid — the item plus whatever postage was collected. A collected order
 * charged no postage, so a refund of one hands back the item price and nothing more.
 */
export function chargedTotalCents(o: { amountCents: number; shippingPaidCents?: number | null }): number {
 return o.amountCents + (o.shippingPaidCents || 0);
}
