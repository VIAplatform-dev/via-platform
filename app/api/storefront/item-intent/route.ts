import { NextRequest, NextResponse } from "next/server";
import { getItem, reserveItem, releaseReservation, currentReservationRef } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";
import { applicationFeeCents } from "@/app/lib/payments-config";
import { recordCheckoutAttempt } from "@/app/lib/checkout-attempts-db";
import { getRedeemableBindingOffer } from "@/app/lib/offers-db";
import { consignorCutToHold } from "@/app/lib/consignment-db";
import { validateDiscount, computeDiscount } from "@/app/lib/store-discounts-db";
import { getCheckoutMethods } from "@/app/lib/store-checkout-db";

export const dynamic = "force-dynamic";

// POST { itemId, offer?, discountCode?, buyer:{email,name,phone}, ship:{…}, shippingCostCents }
// SINGLE-ITEM equivalent of cart-intent: creates a PaymentIntent (direct charge on the seller's
// account) so the buyer pays inline with the embedded Payment Element — no redirect to Stripe-hosted
// Checkout. Same offer/discount/app-fee/metadata as /api/checkout, but the intent's metadata carries
// `itemId` so the EXISTING webhook payment_intent.succeeded handler fulfills it identically.
const RESERVE_REF = "checkout";

export async function POST(request: NextRequest) {
 if (!stripeConfigured()) return NextResponse.json({ error: "Checkout isn’t available yet." }, { status: 503 });

 const body = await request.json().catch(() => null);
 const itemId = body?.itemId ? String(body.itemId) : "";
 if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

 const buyer = body?.buyer || {};
 const ship = body?.ship || {};
 const buyerEmail = typeof buyer.email === "string" ? buyer.email.trim() : "";
 if (!buyerEmail) return NextResponse.json({ error: "Email is required." }, { status: 400 });
 if (!ship.line1 || !ship.city || !ship.state || !ship.zip) return NextResponse.json({ error: "A full shipping address is required." }, { status: 400 });
 const shippingCostCents = Math.max(0, Math.round(Number(body?.shippingCostCents) || 0));
 const offerToken = body?.offer ? String(body.offer) : "";

 const item = await getItem(itemId);
 if (!item) return NextResponse.json({ error: "This piece is no longer available." }, { status: 409 });

 // Binding-offer checkout: charge the AGREED price and let this buyer past the acceptance hold.
 let effPriceCents = item.priceCents;
 if (offerToken) {
 const offer = await getRedeemableBindingOffer(offerToken, itemId);
 if (!offer) return NextResponse.json({ error: "This offer is no longer available." }, { status: 409 });
 effPriceCents = offer.amountCents;
 }
 // Available, or already reserved by an ongoing checkout / this buyer's offer → allow.
 if (item.status !== "active") {
 const ref = await currentReservationRef(itemId);
 const heldByThisOffer = !!offerToken && item.status === "reserved" && ref === `offer-${offerToken}`;
 const heldByCheckout = item.status === "reserved" && ref === RESERVE_REF; // buyer re-preparing on address edit
 if (!heldByThisOffer && !heldByCheckout) return NextResponse.json({ error: "This piece is no longer available." }, { status: 409 });
 if (heldByThisOffer) await releaseReservation(itemId); // swap the offer hold for a checkout hold
 }

 const seller = await getSellerById(item.sellerId);
 if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });
 const pay = await getSellerPayments(seller.slug);
 if (!pay?.stripeAccountId || !pay.chargesEnabled) return NextResponse.json({ error: "This store can’t take payments yet." }, { status: 400 });

 // Per-store discount (scoped by seller.slug). Skipped on binding offers (price already final).
 let salePriceCents = effPriceCents;
 let effShippingCents = shippingCostCents;
 let appliedDiscount: { id: number; code: string; offCents: number } | null = null;
 const discountCode = !offerToken && typeof body?.discountCode === "string" ? body.discountCode : "";
 if (discountCode) {
 const d = await validateDiscount(seller.slug, discountCode);
 if (d) {
 const c = computeDiscount(d, effPriceCents);
 salePriceCents = Math.max(0, effPriceCents - c.offCents);
 if (c.freeShipping) effShippingCents = 0;
 appliedDiscount = { id: d.id, code: d.code, offCents: c.offCents + (c.freeShipping ? shippingCostCents : 0) };
 }
 }

 // Reserve for this checkout (idempotent when this buyer is already holding it under RESERVE_REF).
 if ((await currentReservationRef(itemId)) !== RESERVE_REF) {
 const reservation = await reserveItem(itemId, RESERVE_REF);
 if (!reservation) return NextResponse.json({ error: "This piece was just reserved by someone else." }, { status: 409 });
 }

 try {
 const currency = (item.currency || "usd").toLowerCase();
 const amount = salePriceCents + effShippingCents;
 // Consignment: route the consignor's cut into VYA's balance ONLY when they're paid by Stripe
 // direct-deposit. Cash / store-credit stores keep the full proceeds and pay the consignor
 // themselves — VYA holds nothing (0 here).
 const consignCents = await consignorCutToHold(itemId, salePriceCents).catch(() => 0);
 const appFee = applicationFeeCents(salePriceCents) + effShippingCents + consignCents;

 const meta: Record<string, string> = {
 itemId,
 sellerId: seller.id,
 ship_name: String(buyer.name || ""),
 ship_line1: String(ship.line1),
 ship_line2: String(ship.line2 || ""),
 ship_city: String(ship.city),
 ship_state: String(ship.state),
 ship_zip: String(ship.zip),
 ship_country: String(ship.country || "US"),
 buyer_phone: String(buyer.phone || ""),
 buyer_email: buyerEmail,
 shipping_paid_cents: String(effShippingCents),
 sale_price_cents: String(salePriceCents),
 };
 if (offerToken) meta.offer_token = offerToken;
 if (appliedDiscount) {
 meta.discount_code = appliedDiscount.code;
 meta.discount_off_cents = String(appliedDiscount.offCents);
 meta.discount_id = String(appliedDiscount.id);
 meta.discount_store = seller.slug;
 }

 // Per-store methods: card (→ Apple Pay / Google Pay / Link) plus the store's opted-in extras.
 const methods = await getCheckoutMethods(seller.slug);
 // Stripe's form-encoder wants an indexed object (payment_method_types[0]=card), not a JS array.
 const intentBody = (pmts: string[]) => ({
 amount, currency,
 payment_method_types: Object.fromEntries(pmts.map((m, i) => [i, m])),
 receipt_email: buyerEmail,
 ...(appFee > 0 ? { application_fee_amount: appFee } : {}),
 shipping: { name: String(buyer.name || buyerEmail), phone: String(buyer.phone || ""), address: { line1: String(ship.line1), line2: String(ship.line2 || ""), city: String(ship.city), state: String(ship.state), postal_code: String(ship.zip), country: String(ship.country || "US") } },
 metadata: meta,
 });
 // If a store enabled a method its account hasn't activated, Stripe rejects the intent — fall back
 // to card-only (which always works) rather than breaking checkout.
 let intent;
 try {
 intent = await stripePost("payment_intents", intentBody(methods), pay.stripeAccountId);
 } catch (e) {
 if (methods.length <= 1) throw e;
 intent = await stripePost("payment_intents", intentBody(["card"]), pay.stripeAccountId);
 }

 recordCheckoutAttempt({ storeSlug: seller.slug, email: buyerEmail, name: String(buyer.name || "") || null, itemId, itemTitle: item.title, itemImage: item.images?.[0] || null }).catch(() => {});
 return NextResponse.json({
 clientSecret: intent.client_secret,
 publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim(),
 stripeAccount: pay.stripeAccountId,
 amountCents: amount, currency,
 });
 } catch (e) {
 if ((await currentReservationRef(itemId)) === RESERVE_REF) await releaseReservation(itemId).catch(() => {});
 return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed." }, { status: 502 });
 }
}
