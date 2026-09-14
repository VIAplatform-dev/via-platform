// Does this store have a way for VYA to bill it?
//
// WHY IT GATES SHIPPING. Two of the three shipping modes bill the STORE: "Free shipping — you
// absorb it" and "Free over a threshold" both mean the buyer is charged nothing (or less than the
// label costs) and the label goes on the store's own card when it prints. A store that picks one
// of those without a card on file has promised its buyers free postage it has no way to pay for —
// and nobody finds out until the first order is packed and the label won't print, which is the
// worst possible moment to discover it.
//
// So the choice is refused up front, in the settings form and in the route behind it. The form is
// where the promise is made; it is also the only place where changing your mind is free.

import { getStorePlan } from "./store-plans-db";
import { stripeGet, stripeConfigured } from "./stripe";

/**
 * True when Stripe holds a usable payment method for this store.
 *
 * Reads the billing customer's default first — that is what a subscription charge uses — and falls
 * back to "any card attached", because a store that added a card but never subscribed has one
 * without a default being set.
 *
 * Degrades to FALSE on any error, and the caller must treat false as "we can't confirm one" rather
 * than "there definitely isn't one": the cost of a wrong false is a seller told to add a card she
 * already has, which is recoverable. A wrong true is a label that cannot be paid for.
 */
export async function storeHasCardOnFile(storeSlug: string): Promise<boolean> {
 if (!stripeConfigured()) return false;
 try {
  const plan = await getStorePlan(storeSlug);
  const customer = plan?.stripeCustomerId;
  if (!customer) return false;

  const c = await stripeGet(`customers/${customer}`).catch(() => null);
  const dflt = c?.invoice_settings?.default_payment_method;
  if (dflt) return true;

  const methods = await stripeGet(`customers/${customer}/payment_methods`, { type: "card", limit: 1 }).catch(() => null);
  return Array.isArray(methods?.data) && methods.data.length > 0;
 } catch {
  return false;
 }
}

/** The two shipping modes that bill the store rather than the buyer. */
export const STORE_BILLED_SHIP_MODES = ["store_pays", "free_over"] as const;

export const billsTheStore = (mode: unknown): boolean =>
 (STORE_BILLED_SHIP_MODES as readonly string[]).includes(String(mode));
