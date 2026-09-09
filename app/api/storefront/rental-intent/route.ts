import { NextRequest, NextResponse } from "next/server";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { payableAccountId } from "@/app/lib/stripe-mode";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";
import { applicationFeeCents } from "@/app/lib/payments-config";
import { getCheckoutMethods } from "@/app/lib/store-checkout-db";
import { getBooking, rentalContext, ownerOfItem } from "@/app/lib/rentals/rentals-db";

export const dynamic = "force-dynamic";

// POST { rentalId, buyer:{email,name,phone}, ship:{…}, shippingCostCents } — pay for a rental.
//
// Deliberately its own route rather than a branch inside item-intent. A rental doesn't reserve the
// item, doesn't sell it, and doesn't route a consignment cut; sharing that code path would mean
// threading "but not when it's a rental" through every step of a sale.
//
// The card is saved (setup_future_usage) whatever the store's cover model is — late fees and damage
// are charged off-session weeks later, long after a card authorisation would have lapsed, and that
// is the only mechanism that works past the ~7-day hold window.
export async function POST(request: NextRequest) {
 if (!stripeConfigured()) return NextResponse.json({ error: "Checkout isn’t available yet." }, { status: 503 });

 const body = await request.json().catch(() => null);
 const rentalId = body?.rentalId ? String(body.rentalId) : "";
 if (!rentalId) return NextResponse.json({ error: "rentalId required" }, { status: 400 });

 const buyer = body?.buyer || {};
 const ship = body?.ship || {};
 const buyerEmail = typeof buyer.email === "string" ? buyer.email.trim() : "";
 if (!buyerEmail) return NextResponse.json({ error: "Email is required." }, { status: 400 });

 const booking = await getBooking(rentalId);
 if (!booking) return NextResponse.json({ error: "This booking has expired." }, { status: 409 });
 if (booking.status !== "held" && booking.status !== "requested") {
  return NextResponse.json({ error: "This booking can no longer be paid for." }, { status: 409 });
 }
 if (booking.expiresAt && Date.parse(booking.expiresAt) < Date.now()) {
  return NextResponse.json({ error: "Those dates were released. Pick them again." }, { status: 409 });
 }

 const [item, owner] = await Promise.all([getItem(booking.itemId), ownerOfItem(booking.itemId)]);
 if (!item || !owner) return NextResponse.json({ error: "This piece is no longer available." }, { status: 409 });

 const { settings } = await rentalContext(booking.itemId, owner.storeSlug);
 // Posting it out needs somewhere to post it to; collecting in person does not.
 const collecting = settings.fulfilment === "pickup" || body?.delivery === "pickup";
 if (!collecting && (!ship.line1 || !ship.city || !ship.state || !ship.zip)) {
  return NextResponse.json({ error: "A full delivery address is required." }, { status: 400 });
 }

 const seller = await getSellerById(item.sellerId);
 if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });
 const acctId = payableAccountId(await getSellerPayments(seller.slug));
 if (!acctId) return NextResponse.json({ error: "This store can’t take payments yet." }, { status: 400 });

 const rentCents = booking.priceCents ?? 0;
 if (rentCents <= 0) return NextResponse.json({ error: "This rental has no price." }, { status: 400 });
 const waiverCents = settings.security === "waiver" ? Math.round((rentCents * settings.waiverPct) / 100) : 0;
 const shippingCostCents = collecting ? 0 : Math.max(0, Math.round(Number(body?.shippingCostCents) || 0));
 const amount = rentCents + waiverCents + shippingCostCents;

 try {
  const currency = (item.currency || "usd").toLowerCase();
  const appFee = applicationFeeCents(rentCents + waiverCents) + shippingCostCents;

  const meta: Record<string, string> = {
   rentalBookingId: booking.id,
   itemId: booking.itemId,
   sellerId: seller.id,
   rental_start: booking.rented?.start ?? "",
   rental_end: booking.rented?.end ?? "",
   rent_cents: String(rentCents),
   waiver_cents: String(waiverCents),
   shipping_paid_cents: String(shippingCostCents),
   delivery: collecting ? "pickup" : "ship",
   buyer_email: buyerEmail,
   ship_name: String(buyer.name || ""),
   ship_line1: String(ship.line1 || ""),
   ship_line2: String(ship.line2 || ""),
   ship_city: String(ship.city || ""),
   ship_state: String(ship.state || ""),
   ship_zip: String(ship.zip || ""),
   ship_country: String(ship.country || "US"),
   buyer_phone: String(buyer.phone || ""),
  };

  const methods = await getCheckoutMethods(seller.slug);
  const intentBody = (pmts: string[]) => ({
   amount, currency,
   payment_method_types: Object.fromEntries(pmts.map((m, i) => [i, m])),
   receipt_email: buyerEmail,
   // Keep the card on file: this is what late fees and damage are charged against.
   setup_future_usage: "off_session",
   ...(appFee > 0 ? { application_fee_amount: appFee } : {}),
   ...(collecting ? {} : {
    shipping: {
     name: String(buyer.name || buyerEmail), phone: String(buyer.phone || ""),
     address: { line1: String(ship.line1), line2: String(ship.line2 || ""), city: String(ship.city), state: String(ship.state), postal_code: String(ship.zip), country: String(ship.country || "US") },
    },
   }),
   metadata: meta,
  });

  let intent;
  try {
   intent = await stripePost("payment_intents", intentBody(methods), acctId);
  } catch (e) {
   // A method the store enabled but Stripe hasn't activated shouldn't break checkout.
   if (methods.length <= 1) throw e;
   intent = await stripePost("payment_intents", intentBody(["card"]), acctId);
  }

  return NextResponse.json({
   clientSecret: intent.client_secret,
   publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim(),
   stripeAccount: acctId,
   amountCents: amount, currency,
  });
 } catch (e) {
  // The dates stay held — the hold has its own expiry, so a failed payment simply lets it lapse
  // rather than releasing dates a buyer may be about to retry.
  return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed." }, { status: 502 });
 }
}
