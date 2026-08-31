import { NextRequest, NextResponse } from "next/server";
import { getItem, reserveItem, releaseReservation, sweepExpiredReservations } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { payableAccountId } from "@/app/lib/stripe-mode";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { requestBagSellerId } from "@/app/lib/storefront-cart-scope";
import { applicationFeeCents } from "@/app/lib/payments-config";
import { getConsignmentItemByProduct } from "@/app/lib/consignment-db";
import { consignorCutCents } from "@/app/lib/consignment-logic";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { flatRateCents } from "@/app/lib/shipping-tiers";
import { validateDiscount, computeDiscount, distributeDiscount } from "@/app/lib/store-discounts-db";
import { recordEvent } from "@/app/lib/analytics-events-db";
import type { Item } from "@/app/lib/db/schema";

export const dynamic = "force-dynamic";
const COOKIE = "via_cart";

function baseUrl(request: NextRequest) {
 const host = request.headers.get("host") || "vyaplatform.com";
 const proto = host.startsWith("localhost") ? "http" : "https";
 return `${proto}://${host}`;
}

// POST — check out the cart. Each seller has their own connected Stripe account,
// so a direct charge can only cover one seller — we group the cart by seller and
// open one Stripe Checkout Session per seller (direct charge + VYA application
// fee). Returns a session per seller; a single-seller cart is the common case.
export async function POST(request: NextRequest) {
 if (!stripeConfigured()) return NextResponse.json({ error: "Checkout isn’t available yet." }, { status: 503 });

 const token = request.cookies.get(COOKIE)?.value;
 if (!token) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
 // This store's bag — see storefront-cart-scope.
 const ids = await getCartItemIds(token, await requestBagSellerId(request, token));
 if (!ids.length) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });

 // We collect the address on VYA (so we can quote a live shipping rate first), then
 // open the Stripe session — same pattern as the single-item Buy-now checkout.
 const body = await request.json().catch(() => null);
 const buyer = body?.buyer || {};
 const ship = body?.ship || {};
 const buyerEmail = typeof buyer.email === "string" ? buyer.email.trim() : "";
 if (!buyerEmail) return NextResponse.json({ error: "Email is required." }, { status: 400 });
 if (!ship.line1 || !ship.city || !ship.state || !ship.zip) return NextResponse.json({ error: "A full shipping address is required." }, { status: 400 });

 // Free expired reservations first, then reclaim any items still reserved in THIS
 // buyer's own cart (e.g. a checkout they opened and backed out of) so they aren't
 // locked out of their own bag. The atomic markSold at payment is the real guard.
 await sweepExpiredReservations().catch(() => {});
 const bySeller = new Map<string, Item[]>();
 for (const id of ids) {
 let item = await getItem(id);
 if (item && item.status === "reserved") { await releaseReservation(id).catch(() => {}); item = await getItem(id); }
 if (item && item.status === "active") {
 const arr = bySeller.get(item.sellerId) ?? [];
 arr.push(item);
 bySeller.set(item.sellerId, arr);
 }
 }
 if (!bySeller.size) return NextResponse.json({ error: "Your cart items are no longer available." }, { status: 409 });

 const base = baseUrl(request);
 const sessions: { sellerSlug: string; url: string; itemIds: string[] }[] = [];
 const reservedAll: string[] = [];

 try {
 for (const [sellerId, sellerItems] of bySeller) {
 const seller = await getSellerById(sellerId);
 if (!seller) continue;
 const pay = await getSellerPayments(seller.slug);
 // Also skips an account from the other Stripe mode — see stripe-mode.ts.
 const acctId = payableAccountId(pay);
 if (!acctId) continue; // store can't take payment yet

 // Hold each of this seller's items (TTL lock). Skip any that lost the race.
 const reserved: Item[] = [];
 for (const item of sellerItems) {
 const r = await reserveItem(item.id, token);
 if (r) { reserved.push(item); reservedAll.push(item.id); }
 }
 if (!reserved.length) continue;

 const amounts = reserved.map((it) => it.priceCents);
 const subtotal = amounts.reduce((s, a) => s + a, 0);
 // Per-store discount code — ONLY this seller's own code applies. validateDiscount is scoped by
 // seller.slug, so a code created by another store in the cart can never touch this store's items.
 let off = 0; let freeShip = false; let applied: { id: number; code: string } | null = null;
 const discountCode = typeof body?.discountCode === "string" ? body.discountCode : "";
 if (discountCode) {
 const d = await validateDiscount(seller.slug, discountCode);
 if (d) { const c = computeDiscount(d, subtotal); off = c.offCents; freeShip = c.freeShipping; applied = { id: d.id, code: d.code }; }
 }
 const discounted = distributeDiscount(amounts, off); // per-item cents after discount
 const discountedSubtotal = discounted.reduce((s, a) => s + a, 0);

 const lineItems: Record<number, unknown> = {};
 reserved.forEach((item, i) => {
 lineItems[i] = {
 quantity: 1,
 price_data: {
 currency: (item.currency || "usd").toLowerCase(),
 unit_amount: discounted[i],
 product_data: { name: item.title, ...(item.images?.[0] ? { images: { 0: item.images[0] } } : {}) },
 },
 };
 });
 // Server-authoritative shipping, PER SELLER — each store ships its own parcel, so each session
 // charges that store's own flat tier. Never a client-supplied value, and not "only the first seller"
 // (which used to leave sellers 2..N charged for a label the buyer never paid for).
 const shipSettings = await getShippingSettings(seller.slug);
 const shipFree = shipSettings.mode === "store_pays" || (shipSettings.mode === "free_over" && shipSettings.freeThresholdCents != null && subtotal >= shipSettings.freeThresholdCents);
 // Flat-rate by size (Depop/Poshmark-style), PER SELLER — the buyer pays one clean, consistent tier
 // price for this store's parcel, same number every time. VYA buys the real discounted label at
 // fulfillment and keeps the spread; margin is baked into the tier + kept safe by round-up dims.
 const shipHere = shipFree ? 0 : flatRateCents({
 weightOz: reserved.reduce((s, it) => s + (it.weightOz || 16), 0),
 lengthIn: Math.max(...reserved.map((it) => it.lengthIn || 12)),
 widthIn: Math.max(...reserved.map((it) => it.widthIn || 9)),
 heightIn: reserved.reduce((s, it) => s + (it.heightIn || 3), 0),
 });
 const effShip = freeShip ? 0 : shipHere; // a free-shipping code waives the buyer's shipping charge
 const cur = (reserved[0].currency || "usd").toLowerCase();
 if (effShip > 0) lineItems[reserved.length] = { quantity: 1, price_data: { currency: cur, unit_amount: effShip, product_data: { name: "Shipping" } } };
 // Consignment (Model A): route each consigned item's consignor cut into VYA's balance, on top
 // of the platform fee — so we hold it and pay the consignor out (Stripe won't let the store
 // transfer to them directly). Computed on the DISCOUNTED per-item price.
 let consignTotal = 0;
 for (let i = 0; i < reserved.length; i++) {
 const ci = await getConsignmentItemByProduct(reserved[i].id).catch(() => null);
 if (ci && ci.status === "active") consignTotal += consignorCutCents(discounted[i], ci.splitPct);
 }
 const feeAmount = applicationFeeCents(discountedSubtotal) + effShip + consignTotal;
 const itemIds = reserved.map((it) => it.id);
 const idCsv = itemIds.join(",");
 const meta: Record<string, string> = {
 itemIds: idCsv, sellerId,
 ship_name: String(buyer.name || ""), ship_line1: String(ship.line1), ship_line2: String(ship.line2 || ""),
 ship_city: String(ship.city), ship_state: String(ship.state), ship_zip: String(ship.zip), ship_country: String(ship.country || "US"),
 buyer_phone: String(buyer.phone || ""), shipping_paid_cents: String(effShip),
 sale_subtotal_cents: String(discountedSubtotal),
 };
 if (applied && (off > 0 || freeShip)) {
 meta.discount_code = applied.code;
 meta.discount_off_cents = String(subtotal - discountedSubtotal + (freeShip ? shipHere : 0));
 meta.discount_id = String(applied.id);
 meta.discount_store = seller.slug;
 }

 const session = await stripePost(
 "checkout/sessions",
 {
 mode: "payment",
 customer_email: buyerEmail,
 success_url: `${base}/checkout/success`,
 cancel_url: `${base}/checkout/cancel`,
 line_items: lineItems,
 metadata: meta,
 payment_intent_data: {
 ...(feeAmount > 0 ? { application_fee_amount: feeAmount } : {}),
 metadata: meta,
 },
 },
 acctId, // direct charge on the seller's connected account
 );
 sessions.push({ sellerSlug: seller.slug, url: session.url as string, itemIds });
 // Clean event stream: each item entering checkout, at the price actually charged.
 for (let i = 0; i < itemIds.length; i++) {
 await recordEvent({ type: "checkout_start", storeSlug: seller.slug, itemId: itemIds[i], priceCents: discounted[i], surface: "storefront" });
 }
 }

 if (!sessions.length) {
 for (const id of reservedAll) await releaseReservation(id);
 return NextResponse.json({ error: "None of your cart’s stores can take payment yet." }, { status: 400 });
 }
 // Single-seller cart → one session (the common case). Multi-seller → the buyer
 // completes each in turn; the UI sends them through the sessions in order.
 return NextResponse.json({ ok: true, sessions, multiSeller: sessions.length > 1, url: sessions[0].url });
 } catch (e) {
 for (const id of reservedAll) await releaseReservation(id);
 return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed." }, { status: 502 });
 }
}
