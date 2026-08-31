import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getCheckout, attachStripe } from "@/app/lib/market/checkout-db";
import { sellerAccount, createMarketIntent, publishableKey, stripeView, expireMarketPayment } from "@/app/lib/market/stripe-market";
import { stripeGet } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";

// POST — switch an open checkout to keyed entry: mint (or reuse) its PaymentIntent and hand the
// client secret to the seller's Payment Element. Idempotent on the checkout id.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const c = await getCheckout(id);
 if (!c || c.sellerId !== acting.seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
 if (c.status !== "awaiting_payment") return NextResponse.json({ error: `This checkout is ${c.status}.` }, { status: 409 });
 const acct = await sellerAccount(acting.slug);
 if (!acct?.chargesEnabled) return NextResponse.json({ error: "Card payments are off.", code: "payments_disabled" }, { status: 409 });
 // Already paid via the QR in the meantime? Don't open a second way to pay.
 const view = await stripeView({ session: c.stripeCheckoutSession, paymentIntent: c.stripePaymentIntent, acct: acct.acct }).catch(() => null);
 if (view?.paid) return NextResponse.json({ error: "This checkout was just paid.", code: "already_paid" }, { status: 409 });
 try {
 // A Session's own PI can't be confirmed from a Payment Element, so keyed entry gets a PI of its own
 // (idempotent on the checkout). The unused Session simply expires; both carry the same checkout id.
 /* eslint-disable @typescript-eslint/no-explicit-any */
 let clientSecret: string;
 let piId: string;
 if (c.stripePaymentIntent && !c.stripeCheckoutSession) {
 const p: any = await stripeGet(`payment_intents/${c.stripePaymentIntent}`, undefined, acct.acct);
 clientSecret = String(p.client_secret); piId = String(p.id);
 } else {
 const pi = await createMarketIntent({ checkout: { ...c, tender: "keyed" }, acct: acct.acct });
 clientSecret = pi.clientSecret; piId = pi.id;
 await attachStripe(c.id, { paymentIntent: pi.id });
 // Close the QR page so the customer can't ALSO pay there (a duplicate would be auto-refunded, but
 // better never to take it). The Session is not forgotten: a payment that squeaked through is still
 // matched by checkout id in the webhook.
 if (c.stripeCheckoutSession) await expireMarketPayment({ session: c.stripeCheckoutSession, paymentIntent: null, acct: acct.acct });
 }
 return NextResponse.json({ ok: true, clientSecret, paymentIntent: piId, publishableKey: publishableKey(), stripeAccount: acct.acct });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't start keyed payment." }, { status: 502 });
 }
}
