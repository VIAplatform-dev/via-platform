import { NextRequest, NextResponse } from "next/server";
import { getItem, reserveItem, releaseReservation, sweepExpiredReservations } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { payableAccountId } from "@/app/lib/stripe-mode";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { requestBagSellerId } from "@/app/lib/storefront-cart-scope";
import { applicationFeeCents } from "@/app/lib/payments-config";
import { consignorCutToHold } from "@/app/lib/consignment-db";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { flatRateCents } from "@/app/lib/shipping-tiers";
import { resolveDelivery, deliveryMetadata } from "@/app/lib/checkout-delivery.ts";
import { getCheckoutMethods } from "@/app/lib/store-checkout-db";
import { emptyBagMessage } from "@/app/lib/storefront-cart-core";

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
 // This store's bag — see storefront-cart-scope.
 const ids = await getCartItemIds(token, await requestBagSellerId(request, token));
 if (!ids.length) return NextResponse.json({ error: "Your bag is empty." }, { status: 400 });

 const body = await request.json().catch(() => null);
 const buyer = body?.buyer || {};
 const ship = body?.ship || {};
 const buyerEmail = typeof buyer.email === "string" ? buyer.email.trim() : "";
 if (!buyerEmail) return NextResponse.json({ error: "Email is required." }, { status: 400 });
 // What the browser SAYS she chose. Checked against the store's own settings below before a cent
 // comes off — and a collection needs no address, so that check waits until we know which it is.
 const claimedDelivery = typeof body?.delivery === "string" ? body.delivery : null;
 const hasShipAddress = !!(ship.line1 && ship.city && ship.state && ship.zip);
 if (!hasShipAddress && claimedDelivery !== "pickup") return NextResponse.json({ error: "A full shipping address is required." }, { status: 400 });

 // Reclaim the buyer's own reserved items, then load the still-available bag.
 await sweepExpiredReservations().catch(() => {});
 const avail = [];
 const sellerIds = new Set<string>();
 let sellerId = "";
 const gone: string[] = [];
 for (const id of ids) {
 let it = await getItem(id);
 if (it && it.status === "reserved") { await releaseReservation(id).catch(() => {}); it = await getItem(id); }
 if (it && it.status === "active") { avail.push(it); sellerId = it.sellerId; sellerIds.add(it.sellerId); }
 else if (it) gone.push(it.title);
 }
 if (!avail.length) return NextResponse.json({ error: emptyBagMessage(ids.length, gone) }, { status: 409 });
 // One PaymentIntent = one seller's connected account. A mixed-store bag would charge everything to
 // one seller and misattribute the rest — reject it and let the buyer check out per store.
 if (sellerIds.size > 1) return NextResponse.json({ error: "Your bag has items from more than one store — please check out one store at a time." }, { status: 409 });
 const seller = await getSellerById(sellerId);
 if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });
 const pay = await getSellerPayments(seller.slug);
 // payableAccountId, not acctId: an account from the OTHER Stripe mode is treated as
 // no account at all, so a sandbox can never charge (or refund) a live seller. See stripe-mode.ts.
 const acctId = payableAccountId(pay);
 if (!acctId) return NextResponse.json({ error: "This store can’t take payments yet." }, { status: 400 });

 const reserved = [];
 for (const it of avail) { const r = await reserveItem(it.id, token); if (r) reserved.push(it); }
 if (!reserved.length) return NextResponse.json({ error: "Your bag items are no longer available." }, { status: 409 });

 // Server-authoritative shipping — NEVER trust a client-supplied amount (a buyer could POST 0 and
 // dodge the label). Re-derive the flat tier from the bag's combined parcel + the store's mode,
 // the same way /cart-shipping does, so the charge and the app fee are always correct. The same is
 // true of the DELIVERY METHOD: "pickup" is a claim, and resolveDelivery only honours it at a store
 // that actually offers collection — otherwise this is a delivery and the postage stands.
 const subtotalForShip = reserved.reduce((s, it) => s + it.priceCents, 0);
 const shipSettings = await getShippingSettings(seller.slug);
 // Flat-rate by size (Depop/Poshmark-style): the buyer pays one clean, consistent tier price for the
 // bag's combined parcel — same number every time, no per-order variation. VYA buys the real discounted
 // label at fulfillment and keeps the spread; margin is baked into the tier + kept safe by round-up dims.
 const parcelShipCents = flatRateCents({
 weightOz: reserved.reduce((s, it) => s + (it.weightOz || 16), 0),
 lengthIn: Math.max(...reserved.map((it) => it.lengthIn || 12)),
 widthIn: Math.max(...reserved.map((it) => it.widthIn || 9)),
 heightIn: reserved.reduce((s, it) => s + (it.heightIn || 3), 0),
 });
 const delivery = resolveDelivery({ claimed: claimedDelivery, subtotalCents: subtotalForShip, parcelShipCents, settings: shipSettings });
 const shippingCostCents = delivery.shippingCents;
 // She asked to collect from a store that isn't offering it — so this is a delivery, and it needs
 // somewhere to go. Release the holds we just took rather than leaving her bag locked.
 if (delivery.needsAddress && !hasShipAddress) {
 for (const it of reserved) await releaseReservation(it.id).catch(() => {});
 return NextResponse.json({ error: "This store isn’t offering collection — a full shipping address is required." }, { status: 400 });
 }

 try {
 const subtotal = reserved.reduce((s, it) => s + it.priceCents, 0);
 const amount = subtotal + shippingCostCents;
 // Consignment: route each consignor's cut into VYA's balance ONLY when they're paid by Stripe
 // direct-deposit. Cash / store-credit stores keep the full proceeds and settle with the
 // consignor themselves — VYA holds nothing.
 let consignTotal = 0;
 for (const it of reserved) consignTotal += await consignorCutToHold(it.id, it.priceCents).catch(() => 0);
 const appFee = applicationFeeCents(subtotal) + shippingCostCents + consignTotal;
 const cur = (reserved[0].currency || "usd").toLowerCase();
 const meta: Record<string, string> = {
 itemIds: reserved.map((it) => it.id).join(","), sellerId: seller.id,
 // buyer_name, not ship_name: a collection has no shipping block, and the seller still needs to
 // know who is walking in to collect.
 buyer_name: String(buyer.name || ""), buyer_phone: String(buyer.phone || ""), buyer_email: buyerEmail, shipping_paid_cents: String(shippingCostCents),
 // The method the SERVER decided, stamped on the payment so the webhook records it on the order.
 ...deliveryMetadata(delivery),
 };
 // A collection has no address to post to — don't invent one on the order or the confirmation.
 if (delivery.method === "ship") {
 Object.assign(meta, {
 ship_name: String(buyer.name || ""), ship_line1: String(ship.line1), ship_line2: String(ship.line2 || ""),
 ship_city: String(ship.city), ship_state: String(ship.state), ship_zip: String(ship.zip), ship_country: String(ship.country || "US"),
 });
 }
 // Per-store methods: card (→ Apple Pay / Google Pay / Link) plus the store's opted-in extras.
 const methods = await getCheckoutMethods(seller.slug);
 // Stripe's form-encoder wants an indexed object (payment_method_types[0]=card), not a JS array.
 const intentBody = (pmts: string[]) => ({
 amount, currency: cur,
 payment_method_types: Object.fromEntries(pmts.map((m, i) => [i, m])),
 receipt_email: buyerEmail,
 ...(appFee > 0 ? { application_fee_amount: appFee } : {}),
 // Nothing is being shipped on a collection, so the PaymentIntent carries no shipping address.
 ...(delivery.method === "ship"
 ? { shipping: { name: String(buyer.name || buyerEmail), phone: String(buyer.phone || ""), address: { line1: String(ship.line1), line2: String(ship.line2 || ""), city: String(ship.city), state: String(ship.state), postal_code: String(ship.zip), country: String(ship.country || "US") } } }
 : {}),
 metadata: meta,
 });
 // Fall back to card-only if a store enabled a method its account hasn't activated.
 let intent;
 try {
 intent = await stripePost("payment_intents", intentBody(methods), acctId);
 } catch (e) {
 if (methods.length <= 1) throw e;
 intent = await stripePost("payment_intents", intentBody(["card"]), acctId);
 }
 return NextResponse.json({
 clientSecret: intent.client_secret,
 publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim(),
 stripeAccount: acctId,
 amountCents: amount, currency: cur,
 // What the server actually decided — so the summary shows the total that's really being charged,
 // even if the shopper's choice was stale (seller switched collection off) or forged.
 delivery: delivery.method, shippingCents: delivery.shippingCents,
 collectFrom: delivery.collectFrom, collectInstructions: delivery.instructions,
 });
 } catch (e) {
 for (const it of reserved) await releaseReservation(it.id);
 return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed." }, { status: 502 });
 }
}
