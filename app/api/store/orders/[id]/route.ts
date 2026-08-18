import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getOrderDetail, updateOrderStatus, markOrderRefunded, reversePayoutForOrder, setOrderLabel, markOrderShipped, markTrackingEmailSent, type OrderStatus } from "@/app/lib/db/orders";
import { relistItem } from "@/app/lib/db/inventory";
import { reverseConsignedSale } from "@/app/lib/consignment-db";
import { voidOrderLabel, generateReturnLabel, generateShipBackLabel } from "@/app/lib/order-label";
import { getReturnLabelInfo, setReturnRejected } from "@/app/lib/db/orders";
import { getRefundPolicy } from "@/app/lib/store-policy-db";
import { sendReturnLabelEmail, sendReturnRejectedEmail } from "@/app/lib/email";
import { recordLabelTransaction } from "@/app/lib/shippo-labels-db";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { getShippingSettings, hasShipFrom } from "@/app/lib/store-shipping-db";
import { stripePost, stripeGet } from "@/app/lib/stripe";
import { getRates, buyLabel, isShipConfigured, getOrCreateShipAccount } from "@/app/lib/ship-provider";
import { shippingMarginCents } from "@/app/lib/shipping-tiers";
import { logError } from "@/app/lib/error-log";
import { sendBuyerTrackingEmail } from "@/app/lib/email";

export const dynamic = "force-dynamic";

// Resolve the acting store + confirm the order is theirs (never expose another
// store's data, never let them act on another store's orders).
async function authed(request: NextRequest, id: string) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return { err: "Unauthorized", code: 401 as const };
 const seller = await getSellerBySlug(slug);
 if (!seller) return { err: "No store", code: 404 as const };
 const order = await getOrderDetail(id);
 if (!order || order.sellerId !== seller.id) return { err: "Not found", code: 404 as const };
 return { order, slug, seller };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const r = await authed(request, id);
 if ("err" in r) return NextResponse.json({ error: r.err }, { status: r.code });
 // Pull the REAL Stripe processing fee for this charge (from the connected
 // account's balance transaction) so the seller sees exactly where money went.
 let stripeFeeCents = 0;
 const pay = await getSellerPayments(r.slug);
 if (r.order.stripePaymentIntent && pay?.stripeAccountId) {
 try {
 const pi = await stripeGet(`payment_intents/${r.order.stripePaymentIntent}?expand[]=latest_charge.balance_transaction`, undefined, pay.stripeAccountId) as { latest_charge?: { balance_transaction?: { fee?: number; fee_details?: { type: string; amount: number }[] } } };
 const bt = pi?.latest_charge?.balance_transaction;
 // balance_transaction.fee BUNDLES VYA's application fee with Stripe's processing
 // fee — take only the stripe_fee line so we don't double-count our own cut.
 const stripeOnly = (bt?.fee_details || []).filter((f) => f.type === "stripe_fee").reduce((s, f) => s + (f.amount || 0), 0);
 stripeFeeCents = stripeOnly || bt?.fee || 0;
 } catch { /* fee just won't show */ }
 }
 return NextResponse.json({ order: r.order, stripeFeeCents });
}

// PATCH { status } — lifecycle. "refunded" performs the REAL refund (#9): refund
// the buyer on the connected account, reverse VYA's 1% application fee, relist the
// one-of-one. Other statuses just record the step.
const STATUSES: OrderStatus[] = ["paid", "shipped", "delivered", "refunded"];
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const r = await authed(request, id);
 if ("err" in r) return NextResponse.json({ error: r.err }, { status: r.code });
 const body = await request.json().catch(() => null);
 const status = body?.status as OrderStatus;
 if (!STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

 if (status === "refunded") {
 // Idempotency: a double-click / retry must not re-refund, re-relist, or double-reverse.
 if (r.order.status === "refunded") return NextResponse.json({ ok: true, status: "refunded", alreadyRefunded: true });

 // Restocking fee: a % of the ITEM price the store keeps. The buyer is refunded the full charge
 // (item + shipping they paid) MINUS that fee. `?fee=0` overrides the store default (e.g. to waive
 // it as a goodwill exception); otherwise the store's returns policy applies.
 const feeOverride = new URL(request.url).searchParams.get("fee");
 const policy = await getRefundPolicy(r.slug).catch(() => null);
 const feePct = feeOverride != null ? Math.max(0, Math.min(50, Number(feeOverride) || 0)) : (policy?.restockingFeePct ?? 0);
 const fullCharge = r.order.amountCents + (r.order.shippingPaidCents || 0);
 const restockingFeeCents = Math.round((r.order.amountCents * feePct) / 100);
 // If the store's policy is buyer-pays-return-shipping AND a return label was bought, the buyer
 // covers it — deduct that label cost from their refund too.
 const rlabel = await getReturnLabelInfo(id).catch(() => ({ costCents: null }));
 const returnShipDeduction = policy?.returnShippingPaidBy !== "store" && rlabel.costCents ? rlabel.costCents : 0;
 const totalDeduction = restockingFeeCents + returnShipDeduction;
 const refundAmountCents = Math.max(0, fullCharge - totalDeduction);

 const pay = await getSellerPayments(r.slug);
 if (r.order.stripePaymentIntent && pay?.stripeAccountId) {
 const acct = pay.stripeAccountId;
 const pi = r.order.stripePaymentIntent;
 const feeCents = r.order.feeCents || 0;
 // RECOUP: when the buyer paid return shipping, VYA keeps that label cost out of the fee it hands
 // back to the seller — so the money for the label VYA bought lands with VYA, not the seller. This
 // needs the platform application-fee id; if we can't get it, fall back to the standard refund
 // (buyer still refunded correctly, VYA just doesn't recoup — no worse than before).
 let feeId: string | null = null;
 if (returnShipDeduction > 0 && feeCents > 0) {
 try {
 const piData = await stripeGet(`payment_intents/${pi}?expand[]=latest_charge`, undefined, acct) as { latest_charge?: { application_fee?: string | { id: string } } };
 const af = piData?.latest_charge?.application_fee;
 feeId = typeof af === "string" ? af : (af?.id ?? null);
 } catch { feeId = null; }
 }
 try {
 if (feeId) {
 // 1) Refund the buyer the net amount. 2) Return the seller's share of VYA's fee — the whole fee
 // MINUS the return-label cost VYA keeps. (Fee refunds are a platform op → no connected-account.)
 await stripePost("refunds", { payment_intent: pi, amount: String(refundAmountCents) }, acct);
 const feeRefund = Math.max(0, feeCents - returnShipDeduction);
 if (feeRefund > 0) await stripePost(`application_fees/${feeId}/refunds`, { amount: String(feeRefund) }, undefined);
 } else {
 // Standard: partial refund when a deduction applies, else full; fee returned proportionally.
 await stripePost("refunds", {
 payment_intent: pi,
 refund_application_fee: "true",
 ...(totalDeduction > 0 ? { amount: String(refundAmountCents) } : {}),
 }, acct);
 }
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Refund failed at Stripe." }, { status: 502 });
 }
 }
 await relistItem(r.order.itemId); // default: the one-of-one is available again
 // If this was a consigned piece, undo the consignor's credit too — otherwise a refunded sale
 // still gets paid out at the next payout run. Reverts the item to available + debits the ledger.
 await reverseConsignedSale({ productId: r.order.itemId, orderId: id }).catch(() => {});
 // Reverse the seller-payout ledger row too, so seller-net reporting doesn't count a returned sale.
 await reversePayoutForOrder(id).catch(() => {});
 // Void the shipping label if it hasn't shipped — recover the label cost VYA fronted.
 await voidOrderLabel(id).catch(() => {});
 // Record the refund (status + when + how much was actually returned to the buyer).
 await markOrderRefunded(id, refundAmountCents);
 return NextResponse.json({ ok: true, status: "refunded", relisted: true, refundAmountCents, restockingFeeCents, returnShipDeduction });
 }

 await updateOrderStatus(id, status);
 return NextResponse.json({ ok: true, status });
}

// POST — label actions (#7): { action: "label_quote" } shows the cost before buying;
// { action: "buy_label", rateId } purchases the label + recovers the cost.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const r = await authed(request, id);
 if ("err" in r) return NextResponse.json({ error: r.err }, { status: r.code });
 const { order, slug, seller } = r;
 const body = await request.json().catch(() => null);

 // Return label — buy a prepaid label (buyer → store) and email it to the buyer. Who ultimately
 // pays is the store's returns policy: buyer-pays → the cost is deducted from their eventual refund.
 if (body?.action === "return_label") {
 const res = await generateReturnLabel(id);
 if (!res.ok) return NextResponse.json({ error: `Couldn’t create a return label (${res.reason}).` }, { status: 400 });
 const policy = await getRefundPolicy(slug).catch(() => null);
 const paidBy = policy?.returnShippingPaidBy === "store" ? "store" : "buyer";
 if (order.buyerEmail && res.labelUrl) {
 await sendReturnLabelEmail({ storeSlug: slug, buyerEmail: order.buyerEmail, storeName: seller.name, itemTitle: order.itemTitle || "your item", returnLabelUrl: res.labelUrl, paidBy }).catch((e) => logError("return-label-email", e, { context: { orderId: id } }));
 }
 return NextResponse.json({ ok: true, returnLabelUrl: res.labelUrl, trackingNumber: res.trackingNumber, costCents: res.costCents, paidBy });
 }

 // Reject a return — the item came back but the store won't accept it. Records the reason + evidence
 // photos (kept for a possible chargeback), does NOT refund, and optionally ships the item back.
 if (body?.action === "reject_return") {
 const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : null;
 const evidence = Array.isArray(body?.evidence) ? body.evidence.filter((u: unknown) => typeof u === "string").slice(0, 12) : [];
 await setReturnRejected(id, note, evidence);
 let shipBackUrl: string | undefined;
 if (body?.shipBack) {
 const sb = await generateShipBackLabel(id).catch(() => null);
 if (sb?.ok) shipBackUrl = sb.labelUrl;
 }
 if (order.buyerEmail) {
 await sendReturnRejectedEmail({ storeSlug: slug, buyerEmail: order.buyerEmail, storeName: seller.name, itemTitle: order.itemTitle || "your item", note, shipBack: !!shipBackUrl }).catch((e) => logError("return-rejected-email", e, { context: { orderId: id } }));
 }
 return NextResponse.json({ ok: true, returnStatus: "rejected", shipBackUrl: shipBackUrl ?? null });
 }

 // Mark shipped — the label is already generated (auto or manual); this confirms drop-off and emails
 // the buyer their tracking. Handled before the Shippo/rate checks since it needs neither.
 if (body?.action === "mark_shipped") {
 await markOrderShipped(id);
 // Email the buyer their tracking if we have a label's tracking number (skip if they shipped their own way).
 if (order.buyerEmail && order.trackingNumber) {
 try {
 await sendBuyerTrackingEmail({ storeSlug: slug, buyerEmail: order.buyerEmail, storeName: seller.name, itemTitle: order.itemTitle || "your item", trackingNumber: order.trackingNumber, trackingUrl: order.trackingUrl, orderId: id, replyTo: seller.email });
 await markTrackingEmailSent(id);
 } catch (e) { await logError("tracking-email", e, { context: { orderId: id } }); }
 }
 return NextResponse.json({ ok: true, status: "shipped" });
 }

 if (!isShipConfigured()) return NextResponse.json({ error: "Shipping labels aren’t enabled yet." }, { status: 503 });
 const shipping = await getShippingSettings(slug);
 if (!hasShipFrom(shipping)) return NextResponse.json({ error: "Add your ship-from address in Settings → Shipping first." }, { status: 400 });
 if (!order.shipLine1 || !order.shipCity) return NextResponse.json({ error: "This order has no shipping address." }, { status: 400 });

 const f = shipping.shipFrom!;
 // USPS requires a sender email or phone — fall back to the seller's email.
 const from = { name: f.name || seller.name, street1: f.street1!, street2: f.street2, city: f.city!, state: f.state!, zip: f.zip!, country: f.country || "US", phone: f.phone, email: seller.email };
 const to = { name: order.buyerName, street1: order.shipLine1, street2: order.shipLine2, city: order.shipCity, state: order.shipState || "", zip: order.shipPostal || "", country: order.shipCountry || "US", phone: order.buyerPhone, email: order.buyerEmail };
 const parcel = { weightOz: order.itemWeightOz || 16, lengthIn: order.itemLengthIn || 12, widthIn: order.itemWidthIn || 9, heightIn: order.itemHeightIn || 3 };

 const shipAcct = await getOrCreateShipAccount(slug, seller.name); // null today (Shippo/platform account); the store's sub-account once Forge is on
 const rates = await getRates(from, to, parcel, shipAcct);
 if (!rates.length) return NextResponse.json({ error: "No shipping rates available for this address." }, { status: 502 });
 const cheapest = rates[0];

 // Cost recovery: if the buyer funded shipping at checkout, the label is covered;
 // otherwise the store absorbs it and VYA charges the seller (don't let VYA eat it).
 const sellerPays = !(order.shippingPaidCents && order.shippingPaidCents > 0);

 if (body?.action === "label_quote") {
 // The buyer paid a flat tier at checkout; the real label costs less — the difference is VYA's margin.
 const buyerPaidCents = order.shippingPaidCents || 0;
 const marginCents = buyerPaidCents > 0 ? shippingMarginCents(buyerPaidCents, cheapest.amountCents) : 0;
 return NextResponse.json({ rate: { provider: cheapest.provider, service: cheapest.service, costCents: cheapest.amountCents, estDays: cheapest.estDays, rateId: cheapest.rateId }, sellerPays, buyerPaidCents, marginCents });
 }

 if (body?.action === "buy_label") {
 const rateId = String(body?.rateId || cheapest.rateId);
 // Free-shipping labels are billed to the seller — require a card up front.
 if (sellerPays && !seller.stripeCustomerId) return NextResponse.json({ error: "Add a payment method to cover free-shipping labels first." }, { status: 400 });
 // Buy the label FIRST: if Shippo fails, the seller is never left charged for a label they didn't get.
 const label = await buyLabel(rateId, shipAcct);
 if (!label) return NextResponse.json({ error: "Label purchase failed — try again." }, { status: 502 });
 // Then recover the cost from the seller. Idempotency key stops a double-click double-charge; and if
 // billing fails the order still ships — we don't strand the buyer over a seller-card problem, just log it.
 if (sellerPays) {
 await stripePost("payment_intents", { amount: String(label.costCents || cheapest.amountCents), currency: (order.currency || "usd").toLowerCase(), customer: seller.stripeCustomerId, confirm: "true", off_session: "true", description: `VYA shipping label — order ${id}` }, undefined, `ship-label-${id}`).catch((e) => logError("label-seller-charge", e, { context: { orderId: id, slug, costCents: label.costCents } }));
 }
 // Store the label WITHOUT marking shipped — the seller prints it, then hits "Mark shipped" when they
 // actually drop it off (which is what emails the buyer their tracking).
 await setOrderLabel(id, { labelUrl: label.labelUrl, trackingNumber: label.trackingNumber, trackingUrl: label.trackingUrl, labelCostCents: label.costCents });
 await recordLabelTransaction(id, label.transactionId); // so it can be voided if the order is refunded
 return NextResponse.json({ ok: true, labelUrl: label.labelUrl, trackingNumber: label.trackingNumber, trackingUrl: label.trackingUrl });
 }

 return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
