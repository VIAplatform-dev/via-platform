import "server-only";
import { stripePost } from "./stripe";
import { getSellerPayments } from "./seller-payments-db";
import { payableAccountId } from "./stripe-mode";
import { applicationFeeCents } from "./payments-config";
import { consignorCutToHold } from "./consignment-db";
import { getSellerBySlug } from "./db/sellers";
import { storeCurrency } from "./store-currency-db";
import type { Offer } from "./offers-db";
import { planOfferCharge, offerChargeMetadata, offerIdempotencyKey } from "./offer-charge-core";

// Taking the money the moment a binding offer is accepted.
//
// WHAT "BINDING" MEANS NOW. The buyer authorised a card and gave an address when she made the
// offer, so accepting is not a promise to sell, it IS the sale. Before this, accepting reserved the
// piece and emailed her a link, and the shop still had to wait to find out whether she came back.
//
// IT DOES NOT CREATE THE ORDER. It creates a PaymentIntent carrying exactly the metadata the
// storefront's own checkout uses, on the same connected account, so the existing Stripe webhook
// does all the rest: the order row, the sold status, the consignor credit, the delisting, the
// emails, the label. One path, so a sale made this way can never drift from a sale made the normal
// way. See app/api/webhooks/stripe-connect.
//
// A DECLINE IS NOT A FAILURE OF THE ACCEPT. Cards expire and funds run out, and the seller has
// already said yes. When the charge cannot be taken the caller falls back to what binding used to
// do: hold the piece and email a link. Better a second step than a sale that silently didn't happen.

export type OfferChargeResult =
 | { ok: true; paymentIntent: string }
 | { ok: false; reason: "not-binding" | "no-card" | "already-sold" | "no-account" | "declined"; detail?: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function chargeAcceptedOffer(offer: Offer): Promise<OfferChargeResult> {
 // Whether it may be charged at all, and with what. See offer-charge-core.ts.
 const plan = planOfferCharge(offer);
 if (!plan.ok) return { ok: false, reason: plan.reason };
 const ready = plan.offer;

 const pay = await getSellerPayments(offer.storeSlug).catch(() => null);
 const acct = payableAccountId(pay);
 if (!acct) return { ok: false, reason: "no-account" };
 // The webhook keys the order on the seller's id, and an offer only carries the slug.
 const seller = await getSellerBySlug(offer.storeSlug).catch(() => null);
 if (!seller) return { ok: false, reason: "no-account" };

 const amount = offer.amountCents;
 // The consignor's cut is held the same way checkout holds it, so a consigned piece sold through an
 // offer pays its consignor identically to one sold at full price.
 const consignCents = await consignorCutToHold(ready.itemId, amount).catch(() => 0);
 // IN HER OWN MONEY. A London shop prices in GBP, and the offer is a number in that window. Sending
 // it as USD would take a different amount of money than either side agreed to.
 const currency = (await storeCurrency(offer.storeSlug).catch(() => "usd") || "usd").toLowerCase();
 const appFee = applicationFeeCents(amount) + consignCents;

 // Postage is NOT added here. A binding offer is agreed on the piece; the buyer gave an address so
 // it can be sent, and the shop's own postage setting decides the rest at fulfilment. Charging a
 // postage figure she never saw at offer time would be a number nobody agreed.
 const meta = offerChargeMetadata(ready, seller.id);

 try {
  const pi: any = await stripePost("payment_intents", {
   amount,
   currency,
   customer: ready.stripeCustomerId,
   payment_method: ready.stripePaymentMethodId,
   // Off-session: she is not at her keyboard. She agreed to this when she made the offer.
   off_session: "true",
   confirm: "true",
   ...(appFee > 0 ? { application_fee_amount: appFee } : {}),
   metadata: meta,
  }, acct, offerIdempotencyKey(offer.token));

  if (pi?.status !== "succeeded" && pi?.status !== "processing") {
   return { ok: false, reason: "declined", detail: String(pi?.status || "unknown") };
  }
  return { ok: true, paymentIntent: String(pi.id) };
 } catch (e) {
  // A decline arrives as an exception from Stripe, not a status. Either way the seller has said
  // yes and the caller has to fall back rather than lose the sale.
  return { ok: false, reason: "declined", detail: e instanceof Error ? e.message : "charge failed" };
 }
}
