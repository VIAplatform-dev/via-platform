// Does this store have a way for VYA to bill it?
//
// WHY IT GATES SHIPPING. Two of the three shipping modes bill the STORE: "Free shipping. You
// absorb it" and "Free over a threshold" both mean the buyer is charged nothing (or less than the
// label costs) and the label goes on the store's own card when it prints. A store that picks one
// of those without a card on file has promised its buyers free postage it has no way to pay for,
// and nobody finds out until the first order is packed and the label won't print, which is the
// worst possible moment to discover it.
//
// So the choice is refused up front, in the settings form and in the route behind it. The form is
// where the promise is made; it is also the only place where changing your mind is free.

import { getStorePlan, setStorePlan } from "./store-plans-db";
import { stripeGet, stripePost, stripeConfigured } from "./stripe";

/**
 * True when Stripe holds a usable payment method for this store.
 *
 * Reads the billing customer's default first, that is what a subscription charge uses, and falls
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

/**
 * The Stripe customer VYA bills this store through, creating one if it has none.
 *
 * WHY THIS EXISTS. Both routes that add a card refused outright without a customer: the web portal
 * answered "No subscription to manage yet" and the phone's card sheet answered "No billing account
 * yet. Start a plan first." A customer only appeared when a store subscribed, so a store on the
 * free trial could not add a card at all. That is exactly the store that needs one: shipping's two
 * absorb-the-postage modes are gated on storeHasCardOnFile above, and the settings link sent her to
 * a page whose only control answered 400.
 *
 * A customer with no subscription is free and inert. It is the same record a later subscription
 * attaches to, so nothing is duplicated when she does subscribe.
 *
 * WRITTEN DOWN BEFORE IT IS USED. A customer created and then not persisted would be made again on
 * her next attempt, and the card she adds would sit on whichever one Stripe happened to see last,
 * while storeHasCardOnFile read the other and went on saying she had none.
 *
 * Returns null when Stripe is unconfigured or refuses. Callers must treat that as "not now", never
 * as "she has no card".
 */
export async function ensureBillingCustomer(storeSlug: string): Promise<string | null> {
 if (!stripeConfigured()) return null;
 const plan = await getStorePlan(storeSlug).catch(() => null);
 if (plan?.stripeCustomerId) return plan.stripeCustomerId;

 const created = await stripePost("customers", {
  name: storeSlug,
  "metadata[store_slug]": storeSlug,
  "metadata[created_for]": "card_on_file",
 }).catch(() => null);
 const id = typeof created?.id === "string" ? created.id : null;
 if (!id) return null;

 await setStorePlan(storeSlug, { stripeCustomerId: id }).catch(() => {});
 return id;
}
