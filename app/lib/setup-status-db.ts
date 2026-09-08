import { getStorefrontBySlug } from "./storefront-db";
import { getShippingSettings, hasShipFrom, hasShippingRow } from "./store-shipping-db";
import { servedZones } from "./shipping-zones";
import { getSellerPayments } from "./seller-payments-db";
import { hasRefundPolicy } from "./store-policy-db";
import { getSetupSkipped } from "./store-profile-db";
import { getSellerBySlug } from "./db/sellers";
import { countAvailableItems } from "./db/inventory";
import { setupSteps, type SetupInput, type SetupStepId } from "./setup-core";

// The flags "Set up your store" is computed from, gathered once per store. Shared by the seller's
// own onboarding-status route and the owner's setup funnel, so both see the same checklist.
//
// Payments reads the CACHED Stripe flags (seller_payments, kept current by the Connect webhook) —
// never a live Stripe call from a screen that opens forty times a day, nor forty-five of them from
// the funnel. Live listings are a COUNT, not the rows: a 1,400-piece store must cost the funnel the
// same as an empty one. Every read degrades to "not done" on error rather than failing the status.
export type SetupStatusInput = SetupInput & {
 /** The storefront is published — half of the older "has this store set up yet?" bit. */
 storefrontEnabled: boolean;
};

const OPTIONAL: SetupStepId[] = setupSteps({ shipFromSet: false, paymentsConnected: false, chargesEnabled: false, shippingConfigured: false, servedZoneCount: 0, liveListings: 0, policySet: false, customDomain: null })
 .filter((s) => s.optional).map((s) => s.id);

/** Is this an optional step id — the only kind that can be skipped. */
export function isSkippableStep(id: unknown): id is SetupStepId {
 return typeof id === "string" && (OPTIONAL as string[]).includes(id);
}

export async function setupInputFor(slug: string): Promise<SetupStatusInput> {
 const [sf, shipping, shippingRow, payments, policySet, seller, skipped] = await Promise.all([
  getStorefrontBySlug(slug).catch(() => null),
  getShippingSettings(slug).catch(() => null),
  hasShippingRow(slug).catch(() => false),
  getSellerPayments(slug).catch(() => null),
  hasRefundPolicy(slug).catch(() => false),
  getSellerBySlug(slug).catch(() => null),
  getSetupSkipped(slug).catch(() => [] as string[]),
 ]);
 const liveListings = seller ? await countAvailableItems(seller.id).catch(() => 0) : 0;
 return {
  shipFromSet: shipping ? hasShipFrom(shipping) : false,
  paymentsConnected: Boolean(payments?.stripeAccountId),
  chargesEnabled: Boolean(payments?.chargesEnabled),
  shippingConfigured: shippingRow,
  servedZoneCount: shipping ? servedZones(shipping.zones).length : 0,
  liveListings,
  policySet,
  customDomain: sf?.customDomain ?? null,
  skipped: skipped.filter(isSkippableStep),
  storefrontEnabled: Boolean(sf?.enabled),
 };
}
