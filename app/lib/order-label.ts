import { getOrderDetail, setOrderLabel, setReturnLabel, getReturnLabelInfo, setShipBackLabel, listParcelItemSizes } from "./db/orders";
import { getSellerById } from "./db/sellers";
import { getShippingSettings, hasShipFrom } from "./store-shipping-db";
import { getRates, buyLabel, voidLabel, isShipConfigured, getOrCreateShipAccount } from "./ship-provider";
import { recordLabelTransaction, getLabelTransaction, markLabelVoided } from "./shippo-labels-db";
import { MIN_MARGIN_CENTS } from "./shipping-tiers";
import { parcelForLabel, combineParcels } from "./parcel-core";
import { isoCountry } from "./ship-from-core";
import { sendOpsAlert } from "./email";
import { customsForOrder } from "./order-customs";

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
 if (!isShipConfigured()) return { ok: false, reason: "ship-not-configured" };
 const order = await getOrderDetail(orderId);
 if (!order) return { ok: false, reason: "order-not-found" };
 if (order.labelUrl) return { ok: true, reason: "already-labeled" };
 if (!order.shipLine1 || !order.shipCity) return { ok: false, reason: "no-ship-to" };

 const seller = await getSellerById(order.sellerId);
 if (!seller) return { ok: false, reason: "no-seller" };
 const shipping = await getShippingSettings(seller.slug);
 if (!hasShipFrom(shipping)) return { ok: false, reason: "no-ship-from" };

 const f = shipping.shipFrom!;
 // Countries go to the carrier as ISO-2. The settings form takes free text, and two live stores
 // had "United States" saved — which Shippo and EasyPost both reject, so every rate came back
 // empty and no label could be bought. See isoCountry.
 const from = { name: f.name || seller.name, street1: f.street1!, street2: f.street2, city: f.city!, state: f.state!, zip: f.zip!, country: isoCountry(f.country), phone: f.phone, email: seller.email };
 const to = { name: order.buyerName, street1: order.shipLine1, street2: order.shipLine2, city: order.shipCity, state: order.shipState || "", zip: order.shipPostal || "", country: isoCountry(order.shipCountry), phone: order.buyerPhone, email: order.buyerEmail };
 // EVERY piece in this checkout, not just the row we were called with.
 //
 // Orders are one row per piece, so a bag of three shares a payment intent. Sizing the label from
 // one row meant a t-shirt bought alongside a large bag produced a t-shirt-sized label for a box
 // holding both. And never smaller than the buyer paid for: this used to fall back to 16oz in a
 // 12x9x3 whatever the piece was. See combineParcels / parcelForLabel.
 const siblings = order.stripePaymentIntent
  ? await listParcelItemSizes(order.sellerId, order.stripePaymentIntent).catch(() => [])
  : [];
 const parcel = combineParcels(
  siblings.length ? siblings : [{ weightOz: order.itemWeightOz, lengthIn: order.itemLengthIn, widthIn: order.itemWidthIn, heightIn: order.itemHeightIn }],
  { shippingPaidCents: order.shippingPaidCents },
 );

 const shipAcct = await getOrCreateShipAccount(seller.slug, seller.name); // null today (Shippo/platform account); the store's sub-account once Forge is on
 // A parcel crossing a border needs a declaration or the carrier returns no international rates.
 // Built BEFORE rating, not at purchase, so the price quoted is the price paid — a DDP rate costs
 // more than a DDU one because the duty is inside it.
 const { declaration: customs } = await customsForOrder({
  storeSlug: seller.slug, sellerName: seller.name, itemId: order.itemId,
  fromCountry: from.country, toCountry: to.country,
  parcelWeightOz: parcel.weightOz, fallbackValueCents: order.amountCents, fallbackTitle: order.itemTitle ?? undefined,
 }).catch(() => ({ declaration: null }));
 const rates = await getRates(from, to, parcel, shipAcct, customs);
 if (!rates.length) return { ok: false, reason: "no-rates" };
 const label = await buyLabel(rates[0].rateId, shipAcct);
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

/**
 * Generate a prepaid RETURN label — the outbound label with from/to swapped: it ships FROM the buyer
 * back TO the store's ship-from address. VYA buys it on Shippo (same as outbound); who ultimately
 * pays is a policy decision handled at refund time (buyer-pays → deducted from the refund). Idempotent
 * (returns the existing label) + best-effort (a reason instead of throwing).
 */
export async function generateReturnLabel(orderId: string): Promise<{ ok: boolean; reason?: string; labelUrl?: string; trackingNumber?: string; costCents?: number }> {
 if (!isShipConfigured()) return { ok: false, reason: "ship-not-configured" };
 const order = await getOrderDetail(orderId);
 if (!order) return { ok: false, reason: "order-not-found" };

 const existing = await getReturnLabelInfo(orderId).catch(() => ({ url: null, trackingNumber: null, costCents: null }));
 if (existing.url) return { ok: true, reason: "already-labeled", labelUrl: existing.url, trackingNumber: existing.trackingNumber || undefined, costCents: existing.costCents ?? undefined };

 if (!order.shipLine1 || !order.shipCity) return { ok: false, reason: "no-buyer-address" };
 const seller = await getSellerById(order.sellerId);
 if (!seller) return { ok: false, reason: "no-seller" };
 const shipping = await getShippingSettings(seller.slug);
 if (!hasShipFrom(shipping)) return { ok: false, reason: "no-store-address" };
 const s = shipping.shipFrom!;

 // FROM = the buyer (the return originates with them); TO = the store's ship-from.
 const from = { name: order.buyerName, street1: order.shipLine1, street2: order.shipLine2, city: order.shipCity, state: order.shipState || "", zip: order.shipPostal || "", country: isoCountry(order.shipCountry), phone: order.buyerPhone, email: order.buyerEmail };
 const to = { name: s.name || seller.name, street1: s.street1!, street2: s.street2, city: s.city!, state: s.state!, zip: s.zip!, country: isoCountry(s.country), phone: s.phone, email: seller.email };
 // Same floor as the outbound label: it is the same physical object coming back, so a return can
 // no more be a 16oz mailer than the original was. What the buyer paid to receive it is the size
 // it evidently is.
 const parcel = parcelForLabel({
  item: { weightOz: order.itemWeightOz, lengthIn: order.itemLengthIn, widthIn: order.itemWidthIn, heightIn: order.itemHeightIn },
  shippingPaidCents: order.shippingPaidCents,
 });

 const shipAcct = await getOrCreateShipAccount(seller.slug, seller.name); // null today (Shippo/platform account); the store's sub-account once Forge is on
 // A parcel crossing a border needs a declaration or the carrier returns no international rates.
 // Built BEFORE rating, not at purchase, so the price quoted is the price paid — a DDP rate costs
 // more than a DDU one because the duty is inside it.
 const { declaration: customs } = await customsForOrder({
  storeSlug: seller.slug, sellerName: seller.name, itemId: order.itemId,
  fromCountry: from.country, toCountry: to.country,
  parcelWeightOz: parcel.weightOz, fallbackValueCents: order.amountCents, fallbackTitle: order.itemTitle ?? undefined,
 }).catch(() => ({ declaration: null }));
 const rates = await getRates(from, to, parcel, shipAcct, customs);
 if (!rates.length) return { ok: false, reason: "no-rates" };
 const label = await buyLabel(rates[0].rateId, shipAcct);
 if (!label) return { ok: false, reason: "label-failed" };
 await setReturnLabel(orderId, { url: label.labelUrl, trackingNumber: label.trackingNumber, costCents: label.costCents });
 return { ok: true, labelUrl: label.labelUrl, trackingNumber: label.trackingNumber, costCents: label.costCents };
}

/**
 * Ship a REJECTED return back to the buyer — a store → buyer label (same direction as the original
 * outbound, bought fresh and stored separately so it doesn't clash with the original fulfillment label).
 */
export async function generateShipBackLabel(orderId: string): Promise<{ ok: boolean; reason?: string; labelUrl?: string; trackingNumber?: string; costCents?: number }> {
 if (!isShipConfigured()) return { ok: false, reason: "ship-not-configured" };
 const order = await getOrderDetail(orderId);
 if (!order) return { ok: false, reason: "order-not-found" };
 if (!order.shipLine1 || !order.shipCity) return { ok: false, reason: "no-buyer-address" };
 const seller = await getSellerById(order.sellerId);
 if (!seller) return { ok: false, reason: "no-seller" };
 const shipping = await getShippingSettings(seller.slug);
 if (!hasShipFrom(shipping)) return { ok: false, reason: "no-store-address" };
 const f = shipping.shipFrom!;

 const from = { name: f.name || seller.name, street1: f.street1!, street2: f.street2, city: f.city!, state: f.state!, zip: f.zip!, country: isoCountry(f.country), phone: f.phone, email: seller.email };
 const to = { name: order.buyerName, street1: order.shipLine1, street2: order.shipLine2, city: order.shipCity, state: order.shipState || "", zip: order.shipPostal || "", country: isoCountry(order.shipCountry), phone: order.buyerPhone, email: order.buyerEmail };
 // Same floor as the outbound label: it is the same physical object coming back, so a return can
 // no more be a 16oz mailer than the original was. What the buyer paid to receive it is the size
 // it evidently is.
 const parcel = parcelForLabel({
  item: { weightOz: order.itemWeightOz, lengthIn: order.itemLengthIn, widthIn: order.itemWidthIn, heightIn: order.itemHeightIn },
  shippingPaidCents: order.shippingPaidCents,
 });

 const shipAcct = await getOrCreateShipAccount(seller.slug, seller.name); // null today (Shippo/platform account); the store's sub-account once Forge is on
 // A parcel crossing a border needs a declaration or the carrier returns no international rates.
 // Built BEFORE rating, not at purchase, so the price quoted is the price paid — a DDP rate costs
 // more than a DDU one because the duty is inside it.
 const { declaration: customs } = await customsForOrder({
  storeSlug: seller.slug, sellerName: seller.name, itemId: order.itemId,
  fromCountry: from.country, toCountry: to.country,
  parcelWeightOz: parcel.weightOz, fallbackValueCents: order.amountCents, fallbackTitle: order.itemTitle ?? undefined,
 }).catch(() => ({ declaration: null }));
 const rates = await getRates(from, to, parcel, shipAcct, customs);
 if (!rates.length) return { ok: false, reason: "no-rates" };
 const label = await buyLabel(rates[0].rateId, shipAcct);
 if (!label) return { ok: false, reason: "label-failed" };
 await setShipBackLabel(orderId, label.labelUrl);
 return { ok: true, labelUrl: label.labelUrl, trackingNumber: label.trackingNumber, costCents: label.costCents };
}
