import { NextRequest, NextResponse } from "next/server";
import { createOffer } from "@/app/lib/offers-db";
import { pushSellerOffer } from "@/app/lib/seller-push";
import { getInboxSettings } from "@/app/lib/storefront-settings-db";
import { sendNewOfferToStore } from "@/app/lib/email";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { overRateLimit, clientIp } from "@/app/lib/rate-limit-db";
import { stripePost } from "@/app/lib/stripe";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { payableAccountId } from "@/app/lib/stripe-mode";

export const dynamic = "force-dynamic";

// GET ?slug= public: whether this store takes offers (so the storefront can show/hide the button).
export async function GET(request: NextRequest) {
 const slug = new URL(request.url).searchParams.get("slug") || "";
 if (!slug) return NextResponse.json({ offersEnabled: false });
 const s = await getInboxSettings(slug);
 // The floor travels with the answer. The POST has always refused an offer below it, but only
 // AFTER the shopper wrote a number, her name and her email, which is a rejection she could have
 // been spared. Public on purpose: it is a rule she is subject to, not a secret about the store.
 return NextResponse.json({ offersEnabled: s.offersEnabled, minOfferPct: s.offersEnabled ? s.minOfferPct : 0 });
}

// Public: a shopper makes a price offer on a piece.
// { storeSlug, itemId?, itemTitle?, listPriceCents, amountCents, name?, email }
export async function POST(request: NextRequest) {
 const ip = clientIp(request.headers);
 if (await overRateLimit({ bucket: "storefront-offer", ip, max: 10, windowMinutes: 15 })) {
 return NextResponse.json({ error: "Too many offers submitted. Please try again in a few minutes." }, { status: 429 });
 }
 const b = await request.json().catch(() => null);
 const storeSlug = b?.storeSlug ? String(b.storeSlug).trim() : "";
 const amountCents = Math.round(Number(b?.amountCents) || 0);
 const email = b?.email ? String(b.email).trim().slice(0, 200) : "";
 const itemId = b?.itemId ? String(b.itemId) : null;
 if (!storeSlug || amountCents <= 0) return NextResponse.json({ error: "Missing offer details." }, { status: 400 });
 if (!email) return NextResponse.json({ error: "Enter your email so the seller can respond." }, { status: 400 });

 // Authoritative list price comes from the REAL item, read server-side, never the buyer-supplied
 // listPriceCents. Otherwise the min-offer floor (computed against it) is trivially bypassed by
 // sending an inflated list price. Verify the item belongs to this store, too.
 let listPriceCents = Math.round(Number(b?.listPriceCents) || 0);
 let itemTitle = b?.itemTitle ? String(b.itemTitle).slice(0, 300) : null;
 if (itemId) {
 const [item, seller] = await Promise.all([getItem(itemId).catch(() => null), getSellerBySlug(storeSlug).catch(() => null)]);
 if (!item || !seller || item.sellerId !== seller.id || item.status === "removed") {
 return NextResponse.json({ error: "That item isn’t available." }, { status: 404 });
 }
 listPriceCents = item.priceCents;
 itemTitle = item.title || itemTitle;
 }
 if (listPriceCents <= 0) return NextResponse.json({ error: "Missing offer details." }, { status: 400 });
 if (amountCents >= listPriceCents) return NextResponse.json({ error: "Your offer is at or above the asking price, just buy it directly." }, { status: 400 });

 const settings = await getInboxSettings(storeSlug);
 if (!settings.offersEnabled) return NextResponse.json({ error: "This store isn’t accepting offers." }, { status: 403 });
 if (settings.minOfferPct > 0 && amountCents < Math.round((listPriceCents * settings.minOfferPct) / 100)) {
 return NextResponse.json({ error: `This seller only considers offers of at least ${settings.minOfferPct}% of the asking price.` }, { status: 422 });
 }

 const offer = await createOffer({
 storeSlug,
 itemId,
 itemTitle,
 buyerName: b?.name ? String(b.name).slice(0, 200) : null,
 buyerEmail: email,
 listPriceCents,
 amountCents,
 binding: settings.offersBinding,
 });
 // A BINDING OFFER IS NOT SENT TO THE SELLER YET.
 //
 // On a binding shop, accepting takes the money, so the offer is only real once the buyer has
 // authorised a card and said where it goes. Telling the seller now would put an offer in her inbox
 // that she could accept and that would then fail to charge. The client takes the SetupIntent
 // below, confirms it, and calls /api/storefront/offer/authorise, which is what emails her.
 if (settings.offersBinding) {
  const seller = await getSellerBySlug(storeSlug).catch(() => null);
  const acct = payableAccountId(await getSellerPayments(storeSlug).catch(() => null));
  if (!seller || !acct) {
   return NextResponse.json({ error: "This store can’t take offers right now." }, { status: 400 });
  }
  // The customer is created on the SELLER's account, because that is where the charge happens.
  // A payment method saved to VYA's platform account could never be used for a direct charge.
  const customer = await stripePost("customers", { email, name: b?.name ? String(b.name).slice(0, 200) : "" }, acct).catch(() => null);
  const si = customer?.id
   ? await stripePost("setup_intents", { customer: customer.id, usage: "off_session", "automatic_payment_methods[enabled]": "true", "metadata[offer_token]": offer.token }, acct).catch(() => null)
   : null;
  if (!si?.client_secret) {
   return NextResponse.json({ error: "Couldn’t start that offer. Try again." }, { status: 502 });
  }
  return NextResponse.json({
   ok: true, token: offer.token, binding: true,
   clientSecret: si.client_secret, customerId: customer.id, stripeAccount: acct,
   publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim() || null,
  });
 }

 await sendNewOfferToStore(offer).catch(() => {});
 // The phone, as well as the email. "An offer comes in" has been a switch in Notifications with
 // nothing behind it: this is the sender it was always missing.
 void pushSellerOffer(storeSlug, {
 buyerName: offer.buyerName, itemTitle: offer.itemTitle,
 amountCents: offer.amountCents, currency: "usd", offerId: offer.id,
 });
 return NextResponse.json({ ok: true, token: offer.token, binding: false });
}
