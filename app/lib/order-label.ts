import { getOrderDetail, setOrderLabel } from "./db/orders";
import { getSellerById } from "./db/sellers";
import { getShippingSettings, hasShipFrom } from "./store-shipping-db";
import { getRates, buyLabel, voidLabel, isShippoConfigured } from "./shippo";
import { recordLabelTransaction, getLabelTransaction, markLabelVoided } from "./shippo-labels-db";
import { MIN_MARGIN_CENTS } from "./shipping-tiers";
import { sendOpsAlert } from "./email";

/**
 * Auto-generate a PREPAID shipping label for an order and store it (status stays 'paid' — the seller
 * prints it and marks it shipped when they drop it off). The buyer already paid the flat shipping at
 * checkout and VYA collected it, so VYA covers the label here — the seller is never charged.
 *
 * Idempotent (skips if a label already exists) and best-effort: returns a reason instead of throwing
 * when it can't run (no ship-from address, Shippo off, no rates), so the seller falls back to the
 * manual "generate label" button. Buys the cheapest service.
 */
export async function generateOrderLabel(orderId: string): Promise<{ ok: boolean; reason?: string }> {
 if (!isShippoConfigured()) return { ok: false, reason: "shippo-not-configured" };
 const order = await getOrderDetail(orderId);
 if (!order) return { ok: false, reason: "order-not-found" };
 if (order.labelUrl) return { ok: true, reason: "already-labeled" };
 if (!order.shipLine1 || !order.shipCity) return { ok: false, reason: "no-ship-to" };

 const seller = await getSellerById(order.sellerId);
 if (!seller) return { ok: false, reason: "no-seller" };
 const shipping = await getShippingSettings(seller.slug);
 if (!hasShipFrom(shipping)) return { ok: false, reason: "no-ship-from" };

 const f = shipping.shipFrom!;
 const from = { name: f.name || seller.name, street1: f.street1!, street2: f.street2, city: f.city!, state: f.state!, zip: f.zip!, country: f.country || "US", phone: f.phone, email: seller.email };
 const to = { name: order.buyerName, street1: order.shipLine1, street2: order.shipLine2, city: order.shipCity, state: order.shipState || "", zip: order.shipPostal || "", country: order.shipCountry || "US", phone: order.buyerPhone, email: order.buyerEmail };
 const parcel = { weightOz: order.itemWeightOz || 16, lengthIn: order.itemLengthIn || 12, widthIn: order.itemWidthIn || 9, heightIn: order.itemHeightIn || 3 };

 const rates = await getRates(from, to, parcel);
 if (!rates.length) return { ok: false, reason: "no-rates" };
 const label = await buyLabel(rates[0].rateId);
 if (!label) return { ok: false, reason: "label-failed" };
 await setOrderLabel(orderId, { labelUrl: label.labelUrl, trackingNumber: label.trackingNumber, trackingUrl: label.trackingUrl, labelCostCents: label.costCents });
 await recordLabelTransaction(orderId, label.transactionId); // so we can void it if the order is refunded

 // Margin watch (buyer pricing stays flat — this never changes what the buyer paid). The buyer paid a
 // flat tier; if the real label ate into (or blew past) our target margin, that size/route is mis-priced
 // in SHIPPING_TIERS — alert ops so we can re-tune the tier. Non-blocking, best-effort.
 const paidCents = order.shippingPaidCents || 0;
 if (paidCents > 0 && label.costCents > paidCents - MIN_MARGIN_CENTS) {
  const marginCents = paidCents - label.costCents;
  await sendOpsAlert(
   `Thin shipping margin on order ${orderId}`,
   `Buyer paid ${paidCents}¢, real label ${label.costCents}¢ → margin ${marginCents}¢ (target ≥ ${MIN_MARGIN_CENTS}¢). If this size/route recurs, re-tune SHIPPING_TIERS.`,
  ).catch(() => {});
 }
 return { ok: true };
}

/**
 * Void (refund) an order's shipping label — used when an order is refunded before it ships, so VYA
 * recovers the label cost it fronted. Best-effort + idempotent: Shippo rejects already-used labels
 * (fine), and a voided label is flagged so we never try twice.
 */
export async function voidOrderLabel(orderId: string): Promise<boolean> {
 const txId = await getLabelTransaction(orderId);
 if (!txId) return false;
 const ok = await voidLabel(txId).catch(() => false);
 if (ok) await markLabelVoided(orderId);
 return ok;
}
