/**
 * Collect in store.
 *
 * A vintage seller with a shop wants the option a marketplace cannot give them: the buyer walks in.
 * It saves the postage, it gets the piece to them today, and it brings someone through the door.
 *
 * Two rules run through this file, and both exist because money is involved:
 *
 *  • The choice is never trusted from the browser. A shopper who edits the request must not be able
 *    to select "collect" at a store that does not offer it and skip the postage.
 *  • A store with the toggle on and no address does not offer collection. Somewhere to collect FROM
 *    is what makes the offer real, and a half-filled setting is the likeliest way this breaks.
 */

export type PickupAddress = {
 street1?: string | null;
 street2?: string | null;
 city?: string | null;
 state?: string | null;
 zip?: string | null;
 country?: string | null;
};

export type PickupSettings = {
 enabled: boolean;
 address: PickupAddress | null;
 /** When to come and what to ask for, in the seller's own words. */
 instructions?: string | null;
};

export type DeliveryMethod = "ship" | "pickup";

export type Delivery = {
 method: DeliveryMethod;
 shippingCents: number;
 /** Delivery needs somewhere to send it to; collection does not. */
 needsAddress: boolean;
 /** Where to go, for the confirmation and the order. Null for a delivery. */
 collectFrom: string | null;
 instructions: string | null;
};

/** Enough of an address for a shopper to actually find the place. */
function usable(a: PickupAddress | null | undefined): boolean {
 return !!a && !!(a.street1 || "").trim() && !!(a.city || "").trim();
}

export function pickupOffered(p: PickupSettings | null | undefined): boolean {
 return !!p && p.enabled === true && usable(p.address);
}

/** The address on one line, as a shopper would read it. */
export function formatPickupAddress(a: PickupAddress): string {
 return [a.street1, a.street2, a.city, a.state, a.zip].map((x) => (x || "").trim()).filter(Boolean).join(", ");
}

/**
 * What this order is: delivered or collected, what postage is owed, and whether we need to ask for
 * an address. Falls back to delivery for anything it cannot honour, so a bad or hostile request can
 * only ever cost the shopper postage they were already going to pay — never the seller.
 */
export function deliveryChoice(
 chosen: DeliveryMethod | string | undefined | null,
 ctx: { shippingCents: number; pickup: PickupSettings | null | undefined },
): Delivery {
 const ship: Delivery = { method: "ship", shippingCents: ctx.shippingCents, needsAddress: true, collectFrom: null, instructions: null };
 if (chosen !== "pickup") return ship;
 if (!pickupOffered(ctx.pickup)) return ship;
 const p = ctx.pickup as PickupSettings;
 return {
  method: "pickup",
  shippingCents: 0,
  needsAddress: false,
  collectFrom: formatPickupAddress(p.address as PickupAddress),
  instructions: (p.instructions || "").trim() || null,
 };
}
