import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getOpenSession } from "@/app/lib/market/sessions-db";
import { getCheckout } from "@/app/lib/market/checkout-db";
import { getMarketOrder, claimOrderRefund, revertOrderRefundClaim, markOrderRefunded, reversePayoutForOrder, getOrdersByPaymentIntent } from "@/app/lib/db/orders";
import { relistItem } from "@/app/lib/db/inventory";
import { reverseConsignedSale } from "@/app/lib/consignment-db";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { refundOrderPayment } from "@/app/lib/order-refund";
import { voidEligibility } from "@/app/lib/market/void-core";
import { logError } from "@/app/lib/error-log";

export const dynamic = "force-dynamic";

// POST — void a sale at the stall. Cash: the amount comes off the tin (the order is refunded, so
// every total that already skips refunded sales drops it). Card: the SAME Stripe refund the Orders
// page performs, on the seller's connected account; if Stripe says no, nothing changes. Either way
// the piece goes back to the status it had before the sale (a quick-listed draft stays a draft).
// Only the acting seller's own market sales, only in the open session or the last 24 hours.
// Idempotent: voiding twice answers 200 with alreadyVoided.
export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { orderId } = await params;
 const order = await getMarketOrder(orderId);
 if (!order || order.sellerId !== acting.seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const open = await getOpenSession(acting.seller.id).catch(() => null);
 const verdict = voidEligibility(order, { openSessionId: open?.id ?? null });
 if (!verdict.ok) {
 if (verdict.alreadyVoided) return NextResponse.json({ ok: true, alreadyVoided: true, orderId, status: "refunded" });
 return NextResponse.json({ error: verdict.reason }, { status: 409 });
 }

 // Claim first so a double tap can't refund twice at Stripe; give it back if the money won't move.
 if (!(await claimOrderRefund(orderId))) return NextResponse.json({ ok: true, alreadyVoided: true, orderId, status: "refunded" });

 if (verdict.kind === "card") {
 const pay = await getSellerPayments(acting.slug).catch(() => null);
 if (!pay?.stripeAccountId || !order.stripePaymentIntent) {
 await revertOrderRefundClaim(orderId);
 return NextResponse.json({ error: "Card refunds need the store's Stripe account — refund this one from Orders." }, { status: 409 });
 }
 const sharedIntent = (await getOrdersByPaymentIntent(order.stripePaymentIntent).catch(() => [])).length > 1;
 const refunded = await refundOrderPayment({
 stripeAccountId: pay.stripeAccountId, paymentIntent: order.stripePaymentIntent, refundAmountCents: order.amountCents,
 feeCents: order.feeCents || 0, returnShipDeduction: 0, totalDeduction: 0, sharedIntent,
 });
 if (!refunded.ok) {
 await revertOrderRefundClaim(orderId);
 return NextResponse.json({ error: refunded.error }, { status: 502 });
 }
 }

 // The money has moved (or was never electronic). Now the books and the rack.
 const checkout = order.checkoutId ? await getCheckout(order.checkoutId).catch(() => null) : null;
 const prior = checkout?.items.find((l) => l.itemId === order.itemId)?.prior ?? checkout?.priorStatus ?? "active";
 const item = await relistItem(order.itemId, prior).catch((e) => { logError("market-void-relist", e, { context: { orderId, itemId: order.itemId } }); return null; });
 await reverseConsignedSale({ productId: order.itemId, orderId }).catch(() => {});
 await reversePayoutForOrder(orderId).catch(() => {});
 await markOrderRefunded(orderId, order.amountCents);

 return NextResponse.json({ ok: true, voided: true, orderId, kind: verdict.kind, refundedCents: order.amountCents, currency: order.currency, item: item ? { id: item.id, status: item.status } : null });
}
