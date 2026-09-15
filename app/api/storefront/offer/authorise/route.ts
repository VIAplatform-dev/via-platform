import { NextRequest, NextResponse } from "next/server";
import { getOfferByToken, attachOfferPayment } from "@/app/lib/offers-db";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { payableAccountId } from "@/app/lib/stripe-mode";
import { stripeGet } from "@/app/lib/stripe";
import { sendNewOfferToStore } from "@/app/lib/email";
import { pushSellerOffer } from "@/app/lib/seller-push";

export const dynamic = "force-dynamic";

// The second half of making a BINDING offer: the card is authorised, so the offer becomes real.
//
// WHY THE SELLER IS ONLY TOLD HERE. On a binding shop, accepting takes the money. An offer sitting
// in her inbox that has no card behind it is one she can accept and that then fails to charge, so
// nothing reaches her until the buyer has finished. A buyer who abandons the card step leaves a
// row nobody ever sees, which is the correct outcome.
//
// THE SETUP INTENT IS RE-READ FROM STRIPE, never trusted from the browser. The client posts an id;
// this asks Stripe what actually happened, on the seller's own account, and takes the payment
// method off THAT. Otherwise anybody could post a token and a made-up id and put a binding offer in
// a shop's inbox with no card behind it, which is exactly the thing binding is supposed to prevent.

export async function POST(request: NextRequest) {
 const b = await request.json().catch(() => null);
 const token = String(b?.token || "").trim();
 const setupIntentId = String(b?.setupIntentId || "").trim();
 const ship = (b?.shipTo && typeof b.shipTo === "object" ? b.shipTo : null) as Record<string, string> | null;

 if (!token || !setupIntentId) return NextResponse.json({ error: "Missing offer details." }, { status: 400 });
 if (!ship?.line1 || !ship.city || !ship.country) {
  return NextResponse.json({ error: "Add the address this should be sent to." }, { status: 400 });
 }

 const offer = await getOfferByToken(token).catch(() => null);
 if (!offer) return NextResponse.json({ error: "That offer has expired." }, { status: 404 });
 if (!offer.binding) return NextResponse.json({ error: "That offer doesn’t need a card." }, { status: 400 });
 // Already authorised. A double-submit must not email the seller twice.
 if (offer.stripePaymentMethodId) return NextResponse.json({ ok: true, alreadyDone: true });

 const acct = payableAccountId(await getSellerPayments(offer.storeSlug).catch(() => null));
 if (!acct) return NextResponse.json({ error: "This store can’t take offers right now." }, { status: 400 });

 /* eslint-disable @typescript-eslint/no-explicit-any */
 const si: any = await stripeGet(`setup_intents/${setupIntentId}`, undefined, acct).catch(() => null);
 if (!si || si.status !== "succeeded") {
  return NextResponse.json({ error: "That card wasn’t saved. Try again." }, { status: 400 });
 }
 // It has to be the SetupIntent we made for THIS offer, on this account.
 if (String(si.metadata?.offer_token || "") !== token) {
  return NextResponse.json({ error: "That card doesn’t belong to this offer." }, { status: 403 });
 }
 const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
 const customer = typeof si.customer === "string" ? si.customer : si.customer?.id;
 if (!pm || !customer) return NextResponse.json({ error: "That card wasn’t saved. Try again." }, { status: 400 });

 const clean = (k: string, max = 200) => String(ship[k] ?? "").trim().slice(0, max);
 await attachOfferPayment(token, {
  stripeCustomerId: customer,
  stripePaymentMethodId: pm,
  shipTo: {
   name: clean("name"), line1: clean("line1"), line2: clean("line2"), city: clean("city"),
   state: clean("state"), zip: clean("zip"), country: clean("country", 2).toUpperCase(), phone: clean("phone", 40),
  },
 });

 // NOW she hears about it, with a card behind it.
 const ready = await getOfferByToken(token).catch(() => offer);
 await sendNewOfferToStore(ready ?? offer).catch(() => {});
 void pushSellerOffer(offer.storeSlug, {
  buyerName: offer.buyerName, itemTitle: offer.itemTitle,
  amountCents: offer.amountCents, currency: "usd", offerId: offer.id,
 });

 return NextResponse.json({ ok: true });
}
