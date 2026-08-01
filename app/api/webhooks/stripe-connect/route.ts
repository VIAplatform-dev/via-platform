import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { markSold, releaseReservation, relistItem } from "@/app/lib/db/inventory";
import { creditConsignedSale, reverseConsignedSale } from "@/app/lib/consignment-db";
import { syncOrderToKlaviyo } from "@/app/lib/klaviyo";
import { createPaidOrder, recordPayout, orderExistsForPaymentIntent, claimOrdersForConfirmation, resetConfirmationSent, getOrdersByPaymentIntent, updateOrderStatus } from "@/app/lib/db/orders";
import { recordDiscountRedemption } from "@/app/lib/store-discounts-db";
import { logError } from "@/app/lib/error-log";
import { generateOrderLabel, voidOrderLabel } from "@/app/lib/order-label";
import { applicationFeeCents } from "@/app/lib/payments-config";
import { sendBuyerOrderConfirmation, sendSellerSaleNotification } from "@/app/lib/email";
import { fireAutomationTrigger } from "@/app/lib/automation-engine";
import { markCheckoutRecovered } from "@/app/lib/checkout-attempts-db";
import { delistEverywhere } from "@/app/lib/cross-listing-db";
import { markOfferConsumed } from "@/app/lib/offers-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lazily construct the Stripe SDK client. Constructing it at module load with an
// empty key throws ("Neither apiKey nor config.authenticator provided") and crashes
// the Vercel build during "Collecting page data" (Preview env has no secrets). We
// only need the SDK at request time to verify webhook signatures.
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
 if (!_stripe) {
 const key = process.env.STRIPE_SECRET_KEY;
 if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
 _stripe = new Stripe(key);
 }
 return _stripe;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

type ShipAddr = { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal?: string | null; country?: string | null } | null;

// Shared fulfillment for a confirmed payment — used by both the Checkout Session
// flow (Buy-now / hosted) and the Payment Element flow (embedded card + wallets).
// Idempotent on the PaymentIntent, so a session payment that also fires
// payment_intent.succeeded never records twice.
async function fulfill(o: { itemIds: string[]; sellerId: string; pi: string | null; buyerEmail: string | null; buyerName: string | null; buyerPhone: string | null; ship: ShipAddr; shippingPaidCents: number; currency: string; salePriceCents?: number | null; offerToken?: string | null }) {
 if (!o.pi || !(await orderExistsForPaymentIntent(o.pi))) {
 let idx = 0;
 for (const itemId of o.itemIds) {
 const sold = await markSold(itemId);
 if (!sold) { idx++; continue; }
 // On a binding-offer checkout the buyer paid the AGREED price, not the list price — record the
 // order, seller payout, and consignor credit at what was actually charged. Offers are single-item,
 // so the override applies to the first (only) item.
 const salePriceCents = idx === 0 && o.salePriceCents != null ? o.salePriceCents : sold.priceCents;
 const fee = applicationFeeCents(salePriceCents);
 const order = await createPaidOrder({
 itemId, sellerId: o.sellerId, buyerEmail: o.buyerEmail, buyerName: o.buyerName, buyerPhone: o.buyerPhone, ship: o.ship,
 amountCents: salePriceCents, feeCents: fee,
 shippingPaidCents: idx === 0 ? o.shippingPaidCents : 0,
 currency: (sold.currency || o.currency || "usd").toUpperCase(),
 stripePaymentIntent: o.pi,
 });
 await recordPayout({ orderId: order.id, sellerId: o.sellerId, amountCents: order.amountCents - fee, currency: order.currency });
 // Consignment: if this piece was taken on consignment, credit the consignor their split.
 creditConsignedSale({ productId: itemId, orderId: String(order.id), soldPriceCents: salePriceCents }).catch(() => {});
 // Binding offer redeemed → mark it used so the link can't buy the piece twice.
 if (idx === 0 && o.offerToken) markOfferConsumed(o.offerToken, String(order.id)).catch(() => {});
 markCheckoutRecovered(itemId).catch(() => {}); // sold → stop any abandoned-cart nudge
 delistEverywhere(itemId, "vya").catch(() => {}); // sold on VYA → pull from other marketplaces
 // Buyer prepaid shipping → auto-generate the label now so the seller just prints it (VYA
 // covers it from the collected shipping). Best-effort: awaited so it completes before the
 // function freezes, but a failure (no ship-from / Shippo off) just leaves the manual button.
 if (idx === 0 && o.shippingPaidCents > 0) {
 const r = await generateOrderLabel(order.id).catch((e) => { logError("auto-generate-label", e, { context: { orderId: order.id } }); return { ok: false, reason: "threw" }; });
 if (!r.ok && r.reason && r.reason !== "already-labeled") console.log(`[auto-label] order ${order.id}: ${r.reason}`);
 }
 idx++;
 }
 }
 if (o.pi) {
 // Atomic claim — when checkout.session.completed and payment_intent.succeeded fire together,
 // only ONE wins each order, so the buyer never gets a duplicate confirmation.
 const claimed = await claimOrdersForConfirmation(o.pi);
 for (const ord of claimed) {
 const img = Array.isArray(ord.itemImages) ? (ord.itemImages[0] as string) : null;
 const ship = { line1: ord.shipLine1, line2: ord.shipLine2, city: ord.shipCity, state: ord.shipState, postal: ord.shipPostal, country: ord.shipCountry };
 try {
 if (ord.buyerEmail) await sendBuyerOrderConfirmation({ buyerEmail: ord.buyerEmail, orderId: ord.id, itemTitle: ord.itemTitle || "your item", imageUrl: img, subtotalCents: ord.amountCents, shippingCents: ord.shippingPaidCents || 0, currency: ord.currency, storeName: ord.sellerName || "the store", ship, replyTo: ord.sellerEmail });
 if (ord.sellerEmail) await sendSellerSaleNotification({ sellerEmail: ord.sellerEmail, storeName: ord.sellerName || "your store", itemTitle: ord.itemTitle || "your item", amountCents: ord.amountCents, currency: ord.currency, buyerName: ord.buyerName, ship, orderId: ord.id });
 } catch (e) {
 // Email failed — un-claim so a later event retries it (no duplicate, no silent miss).
 await resetConfirmationSent(ord.id).catch(() => {});
 await logError("order-confirmation-email", e, { context: { orderId: ord.id } });
 }
 // Fire any "after an order" custom automations (a thank-you, a review ask…).
 if (ord.buyerEmail && ord.sellerSlug) fireAutomationTrigger(ord.sellerSlug, "order_placed", { email: ord.buyerEmail, name: ord.buyerName }, { item: ord.itemTitle || "your order" }).catch(() => {});
 // Push the order into the store's Klaviyo, if they've connected one (post-purchase flows, LTV).
 if (ord.buyerEmail && ord.sellerSlug) syncOrderToKlaviyo(ord.sellerSlug, { email: ord.buyerEmail, name: ord.buyerName, orderId: ord.id, valueCents: ord.amountCents, itemTitle: ord.itemTitle, currency: ord.currency }).catch(() => {});
 }
 }
}
// Unwind a sale when money is clawed back — a LOST dispute/chargeback or an out-of-band Stripe
// refund. Relists each one-of-one, reverses any consignor credit so a reversed sale is never paid
// out, and marks the order refunded. Idempotent (an already-refunded order is skipped) — so it's
// safe even when it double-fires with our own refund button. NOT run on dispute.created (which may
// still be won); only on a definite loss/refund.
async function unwindByPaymentIntent(pi: string | null, reason: string) {
 if (!pi) return;
 const ords = await getOrdersByPaymentIntent(pi).catch(() => []);
 for (const o of ords) {
 if (o.status === "refunded" || o.status === "removed") continue;
 await relistItem(o.itemId).catch(() => {});
 await reverseConsignedSale({ productId: o.itemId, orderId: o.id }).catch(() => {});
 await voidOrderLabel(o.id).catch(() => {}); // recover the label cost if it hadn't shipped
 await updateOrderStatus(o.id, "refunded").catch(() => {});
 console.error(`[connect-webhook] unwound order ${o.id} (item ${o.itemId}) — ${reason}`);
 }
}

// Stripe Connect webhook for buyer checkouts. On a confirmed payment we mark each
// one-of-one item sold, record the order (with buyer + shipping) + the seller's
// payout, then send confirmation emails to both sides — idempotently.
export async function POST(request: NextRequest) {
 const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
 if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

 const sig = request.headers.get("stripe-signature") || "";
 const raw = await request.text();
 let event: Stripe.Event;
 try {
 event = getStripe().webhooks.constructEvent(raw, sig, secret);
 } catch {
 return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
 }

 try {
 if (event.type === "checkout.session.completed") {
 const s = event.data.object as Stripe.Checkout.Session;
 const itemIds = (s.metadata?.itemIds || s.metadata?.itemId || "").split(",").map((t) => t.trim()).filter(Boolean);
 const sellerId = s.metadata?.sellerId;

 if (itemIds.length && sellerId && s.payment_status === "paid") {
 const pi = typeof s.payment_intent === "string" ? s.payment_intent : null;

 // Buyer + shipping address. Our buyer-pays checkout collects the address
 // itself (in metadata) so it can quote a rate first; the cart flow lets
 // Stripe collect it. Prefer metadata, fall back to Stripe-collected.
 const md = (s.metadata || {}) as Record<string, string>;
 const cust = s.customer_details;
 let ship: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal?: string | null; country?: string | null } | null;
 let buyerName: string | null;
 let buyerPhone: string | null;
 if (md.ship_line1) {
 ship = { line1: md.ship_line1, line2: md.ship_line2 || null, city: md.ship_city || null, state: md.ship_state || null, postal: md.ship_zip || null, country: md.ship_country || "US" };
 buyerName = md.ship_name || cust?.name || null;
 buyerPhone = md.buyer_phone || cust?.phone || null;
 } else {
 const shipping: any = (s as any).shipping_details || (s as any).collected_information?.shipping_details || null;
 const addr: any = shipping?.address || null;
 ship = addr ? { line1: addr.line1, line2: addr.line2, city: addr.city, state: addr.state, postal: addr.postal_code, country: addr.country } : null;
 buyerName = (shipping?.name as string) || cust?.name || null;
 buyerPhone = cust?.phone || null;
 }
 const buyerEmail = cust?.email ?? null;
 const shippingPaidCents = md.shipping_paid_cents ? parseInt(md.shipping_paid_cents, 10) || 0 : 0;
 await fulfill({ itemIds, sellerId, pi, buyerEmail, buyerName, buyerPhone, ship, shippingPaidCents, currency: s.currency || "usd", salePriceCents: md.sale_price_cents ? parseInt(md.sale_price_cents, 10) || null : null, offerToken: md.offer_token || null });
 // Per-store discount redemption (idempotent per store+code+order via the unique index).
 if (md.discount_code && md.discount_store) {
 recordDiscountRedemption({
 storeSlug: md.discount_store,
 code: md.discount_code,
 discountId: md.discount_id ? parseInt(md.discount_id, 10) || null : null,
 orderRef: pi || s.id,
 amountOffCents: md.discount_off_cents ? parseInt(md.discount_off_cents, 10) || 0 : 0,
 buyerEmail,
 }).catch(() => {});
 }
}
} else if (event.type === "payment_intent.succeeded") {
// Embedded Payment Element pays a PaymentIntent directly (no session). itemIds +
// shipping live in the intent metadata; fulfill is idempotent on the intent.
const p = event.data.object as Stripe.PaymentIntent;
const md2 = (p.metadata || {}) as Record<string, string>;
const piItemIds = (md2.itemIds || md2.itemId || "").split(",").map((t) => t.trim()).filter(Boolean);
const piSellerId = md2.sellerId;
if (piItemIds.length && piSellerId && p.status === "succeeded") {
 const sh: any = p.shipping || null;
 const addr2: any = sh?.address || null;
 const ship2: ShipAddr = md2.ship_line1
  ? { line1: md2.ship_line1, line2: md2.ship_line2 || null, city: md2.ship_city || null, state: md2.ship_state || null, postal: md2.ship_zip || null, country: md2.ship_country || "US" }
  : addr2 ? { line1: addr2.line1, line2: addr2.line2, city: addr2.city, state: addr2.state, postal: addr2.postal_code, country: addr2.country } : null;
 await fulfill({ itemIds: piItemIds, sellerId: piSellerId, pi: p.id, buyerEmail: p.receipt_email || md2.buyer_email || null, buyerName: md2.ship_name || sh?.name || null, buyerPhone: md2.buyer_phone || sh?.phone || null, ship: ship2, shippingPaidCents: md2.shipping_paid_cents ? parseInt(md2.shipping_paid_cents, 10) || 0 : 0, currency: p.currency || "usd", salePriceCents: md2.sale_price_cents ? parseInt(md2.sale_price_cents, 10) || null : null, offerToken: md2.offer_token || null });
}
 } else if (event.type === "checkout.session.expired") {
 const s = event.data.object as Stripe.Checkout.Session;
 const itemIds = (s.metadata?.itemIds || s.metadata?.itemId || "").split(",").map((t) => t.trim()).filter(Boolean);
 for (const itemId of itemIds) await releaseReservation(itemId);
 } else if (event.type === "charge.refunded") {
 // Refund issued directly in Stripe (not via our order button) — unwind the sale so records + ledger stay true.
 const c = event.data.object as Stripe.Charge;
 await unwindByPaymentIntent(typeof c.payment_intent === "string" ? c.payment_intent : null, "charge.refunded");
 } else if (event.type === "charge.dispute.closed") {
 // Chargeback resolved. Only unwind if the seller LOST (funds actually clawed back); a won dispute keeps the sale.
 const d = event.data.object as Stripe.Dispute;
 if (d.status === "lost") await unwindByPaymentIntent(typeof d.payment_intent === "string" ? d.payment_intent : null, "dispute lost");
 }
 } catch (e) {
 console.error("stripe-connect webhook handler error:", e);
 return NextResponse.json({ error: "Handler error" }, { status: 500 });
 }

 return NextResponse.json({ received: true });
}
