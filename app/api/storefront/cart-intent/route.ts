import { NextRequest, NextResponse } from "next/server";
import { getItem, reserveItem, releaseReservation, sweepExpiredReservations } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { applicationFeeCents } from "@/app/lib/payments-config";
import { getConsignmentItemByProduct } from "@/app/lib/consignment-db";
import { consignorCutCents } from "@/app/lib/consignment-logic";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { flatRateCents } from "@/app/lib/shipping-tiers";

export const dynamic = "force-dynamic";
const COOKIE = "via_cart";

// POST { buyer:{email,name,phone}, ship:{line1,line2,city,state,zip,country}, shippingCostCents }
// Creates a PaymentIntent on the seller's connected account (direct charge) for the
// whole bag — so the buyer can pay inline with the embedded Payment Element (Apple
// Pay / Google Pay / card). The address + live shipping rate are already chosen on
// the VYA checkout page; the items are held for the duration. VYA's application fee
// = 1% of items + any shipping (held to fund the label). The PaymentIntent metadata
// carries itemIds + shipping so the webhook can fulfill on payment_intent.succeeded.
export async function POST(request: NextRequest) {
 if (!stripeConfigured()) return NextResponse.json({ error: "Checkout isn’t available yet." }, { status: 503 });
 const token = request.cookies.get(COOKIE)?.value;
 if (!token) return NextResponse.json({ error: "Your bag is empty." }, { status: 400 });
 const ids = await getCartItemIds(token);
 if (!ids.length) return NextResponse.json({ error: "Your bag is empty." }, { status: 400 });

 const body = await request.json().catch(() => null);
 const buyer = body?.buyer || {};
 const ship = body?.ship || {};
 const buyerEmail = typeof buyer.email === "string" ? buyer.email.trim() : "";
 if (!buyerEmail) return NextResponse.json({ error: "Email is required." }, { status: 400 });
 if (!ship.line1 || !ship.city || !ship.state || !ship.zip) return NextResponse.json({ error: "A full shipping address is required." }, { status: 400 });

 // Reclaim the buyer's own reserved items, then load the still-available bag.
 await sweepExpiredReservations().catch(() => {});
 const avail = [];
 const sellerIds = new Set<string>();
 let sellerId = "";
 for (const id of ids) {
 let it = await getItem(id);
 if (it && it.status === "reserved") { await releaseReservation(id).catch(() => {}); it = await getItem(id); }
 if (it && it.status === "active") { avail.push(it); sellerId = it.sellerId; sellerIds.add(it.sellerId); }
 }
 if (!avail.length) return NextResponse.json({ error: "Your bag items are no longer available." }, { status: 409 });
 // One PaymentIntent = one seller's connected account. A mixed-store bag would charge everything to
 // one seller and misattribute the rest — reject it and let the buyer check out per store.
 if (sellerIds.size > 1) return NextResponse.json({ error: "Your bag has items from more than one store — please check out one store at a time." }, { status: 409 });
 const seller = await getSellerById(sellerId);
 if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });
 const pay = await getSellerPayments(seller.slug);
 if (!pay?.stripeAccountId || !pay.chargesEnabled) return NextResponse.json({ error: "This store can’t take payments yet." }, { status: 400 });

 const reserved = [];
 for (const it of avail) { const r = await reserveItem(it.id, token); if (r) reserved.push(it); }
 if (!reserved.length) return NextResponse.json({ error: "Your bag items are no longer available." }, { status: 409 });

 // Server-authoritative shipping — NEVER trust a client-supplied amount (a buyer could POST 0 and
 // dodge the label). Re-derive the flat tier from the bag's combined parcel + the store's mode,
 // the same way /cart-shipping does, so the charge and the app fee are always correct.
 const subtotalForShip = reserved.reduce((s, it) => s + it.priceCents, 0);
 const shipSettings = await getShippingSettings(seller.slug);
 const shipFree = shipSettings.mode === "store_pays" || (shipSettings.mode === "free_over" && shipSettings.freeThresholdCents != null && subtotalForShip >= shipSettings.freeThresholdCents);
 // Flat-rate by size (Depop/Poshmark-style): the buyer pays one clean, consistent tier price for the
 // bag's combined parcel — same number every time, no per-order variation. VYA buys the real discounted
 // label at fulfillment and keeps the spread; margin is baked into the tier + kept safe by round-up dims.
 const shippingCostCents = shipFree ? 0 : flatRateCents({
 weightOz: reserved.reduce((s, it) => s + (it.weightOz || 16), 0),
 lengthIn: Math.max(...reserved.map((it) => it.lengthIn || 12)),
 widthIn: Math.max(...reserved.map((it) => it.widthIn || 9)),
 heightIn: reserved.reduce((s, it) => s + (it.heightIn || 3), 0),
 });

 try {
 const subtotal = reserved.reduce((s, it) => s + it.priceCents, 0);
 const amount = subtotal + shippingCostCents;
 // Consignment (Model A): route consignor cuts into VYA's balance on top of the platform fee.
 let consignTotal = 0;
 for (const it of reserved) {
 const ci = await getConsignmentItemByProduct(it.id).catch(() => null);
 if (ci && ci.status === "active") consignTotal += consignorCutCents(it.priceCents, ci.splitPct);
 }
 const appFee = applicationFeeCents(subtotal) + shippingCostCents + consignTotal;
 const cur = (reserved[0].currency || "usd").toLowerCase();
 const meta: Record<string, string> = {
 itemIds: reserved.map((it) => it.id).join(","), sellerId: seller.id,
 ship_name: String(buyer.name || ""), ship_line1: String(ship.line1), ship_line2: String(ship.line2 || ""),
 ship_city: String(ship.city), ship_state: String(ship.state), ship_zip: String(ship.zip), ship_country: String(ship.country || "US"),
 buyer_phone: String(buyer.phone || ""), buyer_email: buyerEmail, shipping_paid_cents: String(shippingCostCents),
 };
 const intent = await stripePost(
 "payment_intents",
 {
 amount, currency: cur,
 automatic_payment_methods: { enabled: true },
 receipt_email: buyerEmail,
 ...(appFee > 0 ? { application_fee_amount: appFee } : {}),
 shipping: { name: String(buyer.name || buyerEmail), phone: String(buyer.phone || ""), address: { line1: String(ship.line1), line2: String(ship.line2 || ""), city: String(ship.city), state: String(ship.state), postal_code: String(ship.zip), country: String(ship.country || "US") } },
 metadata: meta,
 },
 pay.stripeAccountId, // direct charge on the seller's connected account
 );
 return NextResponse.json({
 clientSecret: intent.client_secret,
 publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim(),
 stripeAccount: pay.stripeAccountId,
 amountCents: amount, currency: cur,
 });
 } catch (e) {
 for (const it of reserved) await releaseReservation(it.id);
 return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed." }, { status: 502 });
 }
}
