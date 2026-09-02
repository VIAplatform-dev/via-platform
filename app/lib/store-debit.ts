// Pulling money OUT of a store's bank, so a consignor can be paid for a sale that never touched VYA.
//
// THE SITUATION. A consigned piece is cross-listed and sells on eBay. eBay pays the store directly.
// VYA is holding nothing, but the consignor is owed her split — and she has no relationship with
// eBay, only with the store, and (through the portal) with VYA. Before this, the payouts screen
// simply told the store "pay her yourself and record it", which works until a store has forty
// consignors and stops doing it.
//
// THE FLOW. The store signs one mandate authorising VYA to debit its bank. From then on, paying an
// off-platform balance is: debit the store (ACH) → wait for it to clear → transfer to the consignor.
//
// WHY THE WAIT IS NOT NEGOTIABLE. ACH is slow and reversible. It takes days to settle and can bounce
// afterwards — insufficient funds, a closed account, a consumer dispute up to 60 days later. If VYA
// forwarded the money on click, a bounce leaves VYA out of pocket, chasing a store for cash it has
// already handed to somebody else. The state machine in consignment-payout-core.ts encodes that;
// this file is only the Stripe half.
//
// WHOSE ACCOUNT. The Customer and the saved bank live on VYA's PLATFORM account, not the store's
// connected account. Everywhere else in the codebase `Stripe-Account` is set because the store is
// the merchant of record; here VYA is charging the store, so it must not be.

import { stripePost, stripeGet } from "./stripe";
import { getStoreDebitMandate, saveDebitCustomer, saveDebitMandate, debitReady, type StoreDebitMandate } from "./seller-payments-db";
import { BASE_URL } from "./base-url";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The store's platform Customer, created once and reused. */
export async function ensureDebitCustomer(storeSlug: string, opts: { email?: string | null; name?: string | null } = {}): Promise<string> {
 const existing = await getStoreDebitMandate(storeSlug);
 if (existing?.customerId) return existing.customerId;
 const customer = await stripePost("customers", {
  ...(opts.email ? { email: opts.email } : {}),
  name: opts.name || storeSlug,
  metadata: { store_slug: storeSlug, purpose: "consignment_debit" },
 // Idempotent on the slug: a double-click during onboarding must not leave two Customers, only one
 // of which ever gets the bank attached.
 }, undefined, `debit-customer-${storeSlug}`);
 await saveDebitCustomer(storeSlug, customer.id as string);
 return customer.id as string;
}

/**
 * A Stripe-hosted page where the store connects its bank and signs the debit mandate.
 *
 * Checkout in `setup` mode rather than a client-side SetupIntent: the rest of this codebase talks
 * raw REST with no Stripe.js on the page, and bank collection needs Financial Connections, which
 * Stripe will host for us. `usage: off_session` is what makes the resulting mandate reusable —
 * without it every payout would need the store present to re-authorise.
 */
export async function bankMandateUrl(storeSlug: string, opts: { email?: string | null; name?: string | null; returnPath?: string } = {}): Promise<string> {
 const customerId = await ensureDebitCustomer(storeSlug, opts);
 const back = `${BASE_URL}${opts.returnPath || "/infrastructure/admin/consignment/payouts"}`;
 const session = await stripePost("checkout/sessions", {
  mode: "setup",
  customer: customerId,
  "payment_method_types[0]": "us_bank_account",
  "payment_method_options[us_bank_account][financial_connections][permissions][0]": "payment_method",
  "payment_method_options[us_bank_account][verification_method]": "instant",
  "setup_intent_data[usage]": "off_session",
  "setup_intent_data[metadata][type]": "store_bank_mandate",
  "setup_intent_data[metadata][store_slug]": storeSlug,
  metadata: { type: "store_bank_mandate", store_slug: storeSlug },
  success_url: `${back}?bank=connected`,
  cancel_url: `${back}?bank=cancelled`,
 });
 return session.url as string;
}

/**
 * Save the mandate once the store finishes the hosted flow.
 *
 * Called from the webhook on `checkout.session.completed` (mode=setup). The bank's name and last4
 * are fetched here so the payouts screen can say "Chase ••4321" rather than a payment method id —
 * a store about to authorise a debit should be able to see which account it comes from.
 */
export async function saveMandateFromSetupIntent(storeSlug: string, setupIntentId: string): Promise<boolean> {
 const si = await stripeGet(`setup_intents/${setupIntentId}`);
 const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
 const customer = typeof si.customer === "string" ? si.customer : si.customer?.id;
 if (!pm || !customer) return false;
 /* allow-swallow: the bank's display name is cosmetic — failing to fetch it must not cost us the
    mandate itself, which is the part that took the store real effort to sign. */
 const method = await stripeGet(`payment_methods/${pm}`).catch(() => null);
 await saveDebitMandate(storeSlug, {
  customerId: customer,
  paymentMethodId: pm,
  bankLast4: method?.us_bank_account?.last4 ?? null,
  bankName: method?.us_bank_account?.bank_name ?? null,
 });
 return true;
}

export type DebitStart = { ok: true; paymentIntentId: string; status: string } | { ok: false; reason: string };

/**
 * Start the ACH debit. Does NOT pay the consignor — that happens when the webhook says it cleared.
 *
 * `idempotencyKey` must be stable for the logical payout: Stripe then returns the SAME
 * PaymentIntent on a retry or a double-click instead of debiting the store twice for one sale.
 */
export async function startBankDebit(o: {
 storeSlug: string;
 amountCents: number;
 consignorId: number;
 payoutDescription: string;
 idempotencyKey: string;
}): Promise<DebitStart> {
 const mandate = await getStoreDebitMandate(o.storeSlug);
 if (!debitReady(mandate)) return { ok: false, reason: "This store hasn’t authorised bank debits yet." };
 try {
  const pi = await stripePost("payment_intents", {
   amount: o.amountCents,
   currency: "usd",
   customer: mandate!.customerId,
   payment_method: mandate!.paymentMethodId,
   "payment_method_types[0]": "us_bank_account",
   confirm: "true",
   off_session: "true",
   description: o.payoutDescription,
   metadata: { type: "consignment_debit", store_slug: o.storeSlug, consignor_id: String(o.consignorId) },
  }, undefined, o.idempotencyKey);
  return { ok: true, paymentIntentId: pi.id as string, status: pi.status as string };
 } catch (e) {
  return { ok: false, reason: e instanceof Error ? e.message : "The bank debit couldn’t be started." };
 }
}

/** What the payouts screen shows about the store's mandate. */
export async function debitMandateSummary(storeSlug: string): Promise<{ ready: boolean; bank: string | null; since: string | null }> {
 const m: StoreDebitMandate | null = await getStoreDebitMandate(storeSlug);
 return {
  ready: debitReady(m),
  bank: m?.bankLast4 ? `${m.bankName || "Bank"} ••${m.bankLast4}` : null,
  since: m?.mandateAt ?? null,
 };
}
