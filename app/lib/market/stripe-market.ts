import "server-only";
import { stripePost, stripeGet } from "@/app/lib/stripe";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { getSellerById } from "@/app/lib/db/sellers";
import { calculateSalesTax } from "@/app/lib/sales-tax";
import { getBaseUrl } from "@/app/lib/base-url";
import { applicationFeeCents } from "@/app/lib/payments-config";
import { accountUsableHere } from "@/app/lib/stripe-mode";
import { marketSessionParams, marketIntentParams, type CheckoutLike, type StripeView } from "./stripe-market-core";

// Stripe calls for a market checkout. All direct charges on the seller's Connect account, every
// create idempotent on the checkout id so a retried request can never make a second Session/PI.

export async function sellerAccount(slug: string): Promise<{ acct: string; chargesEnabled: boolean } | null> {
 const pay = await getSellerPayments(slug).catch(() => null);
 if (!pay?.stripeAccountId) return null;
 // An account belonging to the OTHER Stripe mode is no account at all here. A sandbox must not be
 // able to take an in-person payment on a live seller's behalf. See stripe-mode.ts. The readiness
 // check upstream turns this into "payments aren't set up", the same as a store that never onboarded.
 if (!accountUsableHere(pay.stripeMode)) return null;
 return { acct: pay.stripeAccountId, chargesEnabled: Boolean(pay.chargesEnabled) };
}


/**
 * Sales tax on a sale made across a table.
 *
 * THE POINT OF SALE IS WHERE SHE IS STANDING, not where a parcel is going, because nothing is
 * going anywhere: the buyer takes it with them. In-person sales are sourced to the seller's own
 * location, so her ship-from address is what decides the rate, and the calculation is made with
 * `billing` as the address source rather than `shipping`.
 *
 * A KNOWN LIMITATION, stated rather than hidden. A market session records a NAME and no address,
 * so a seller trading at a fair two states away is taxed as though she sold at home. That is the
 * best available answer until a session can carry its own address, and it is right for the common
 * case, a local market near the studio. It is not right for a travelling seller.
 *
 * Returns zero tax on any failure. A stall cannot wait on Stripe, and losing the sale is worse
 * than collecting no tax on it.
 */
async function marketTax(o: { sellerId: string; acct: string; checkout: CheckoutLike; items?: { title: string; saleCents: number }[] }): Promise<{ taxCents: number; calculationId: string | null }> {
 const none = { taxCents: 0, calculationId: null };
 // The tax settings and the ship-from are keyed on the slug; a checkout only carries the seller id.
 const slug = (await getSellerById(o.sellerId).catch(() => null))?.slug;
 if (!slug) return none;
 const shipping = await getShippingSettings(slug).catch(() => null);
 const at = shipping?.shipFrom;
 // No address, no jurisdiction. Stripe cannot source a sale from nowhere and guessing a state
 // would charge her buyer a tax nobody owes.
 if (!at?.city || !at.country) return none;
 const lines = (o.items?.length ? o.items : [{ title: "Piece", saleCents: o.checkout.amountCents }])
  .map((l, i) => ({ amountCents: l.saleCents, reference: `line-${i}`, title: l.title, category: null }));
 const calc = await calculateSalesTax({
  slug,
  acctId: o.acct,
  currency: o.checkout.currency,
  addressSource: "billing",
  ship: { line1: at.street1, line2: at.street2, city: at.city, state: at.state, zip: at.zip, country: at.country },
  lines,
  shippingCents: 0,
 }).catch(() => null);
 return calc ? { taxCents: calc.addCents, calculationId: calc.calculationId } : none;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function createMarketSession(o: { checkout: CheckoutLike; item: { title: string; image: string | null }; items?: { title: string; image: string | null; saleCents: number }[]; acct: string }): Promise<{ id: string; url: string; paymentIntent: string | null }> {
 const tax = await marketTax({ sellerId: o.checkout.sellerId, acct: o.acct, checkout: o.checkout, items: o.items });
 const params = marketSessionParams({ taxCents: tax.taxCents, taxCalculationId: tax.calculationId, checkout: o.checkout, item: o.item, items: o.items, base: getBaseUrl(), feeCents: applicationFeeCents(o.checkout.amountCents), now: new Date() });
 const s: any = await stripePost("checkout/sessions", params, o.acct, `market-cs-${o.checkout.id}`);
 return { id: String(s.id), url: String(s.url), paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : null };
}

export async function createMarketIntent(o: { checkout: CheckoutLike; acct: string }): Promise<{ id: string; clientSecret: string }> {
 const tax = await marketTax({ sellerId: o.checkout.sellerId, acct: o.acct, checkout: o.checkout });
 const params = marketIntentParams({ checkout: o.checkout, feeCents: applicationFeeCents(o.checkout.amountCents), taxCents: tax.taxCents, taxCalculationId: tax.calculationId });
 const pi: any = await stripePost("payment_intents", params, o.acct, `market-pi-${o.checkout.id}`);
 return { id: String(pi.id), clientSecret: String(pi.client_secret) };
}

/** What Stripe currently says about this checkout's payment. Session first (QR), else the PI (keyed). */
export async function stripeView(o: { session: string | null; paymentIntent: string | null; acct: string }): Promise<StripeView> {
 if (o.session) {
 const s: any = await stripeGet(`checkout/sessions/${o.session}`, undefined, o.acct);
 const pi = typeof s.payment_intent === "string" ? s.payment_intent : null;
 const email: string | null = s.customer_details?.email || s.customer_email || null;
 if (s.payment_status === "paid") return { paid: true, paymentIntent: pi, email };
 // A keyed PI may exist alongside an (abandoned) Session: check it too.
 if (!o.paymentIntent) return { paid: false, paymentIntent: pi };
 }
 if (o.paymentIntent) {
 const p: any = await stripeGet(`payment_intents/${o.paymentIntent}`, undefined, o.acct);
 return { paid: p.status === "succeeded", paymentIntent: String(p.id), email: p.receipt_email || null };
 }
 return null;
}

/** Best-effort: stop the customer-facing page from accepting money after we've given up. */
export async function expireMarketPayment(o: { session: string | null; paymentIntent: string | null; acct: string }): Promise<void> {
 if (o.session) await stripePost(`checkout/sessions/${o.session}/expire`, {}, o.acct).catch(() => {});
 if (o.paymentIntent) await stripePost(`payment_intents/${o.paymentIntent}/cancel`, {}, o.acct).catch(() => {});
}

/** Refund a payment that landed for an item we could no longer sell. Idempotent per PI. */
export async function refundMarketPayment(o: { paymentIntent: string; acct: string; amountCents?: number }): Promise<void> {
 await stripePost("refunds", { payment_intent: o.paymentIntent, refund_application_fee: "true", ...(o.amountCents ? { amount: String(o.amountCents) } : {}) }, o.acct, `market-refund-${o.paymentIntent}-${o.amountCents ?? "full"}`);
}

export function publishableKey(): string | null {
 return (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || "").trim() || null;
}
