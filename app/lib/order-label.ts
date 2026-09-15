import { getOrderDetail, setOrderLabel, setReturnLabel, getReturnLabelInfo, setShipBackLabel, listParcelItemSizes } from "./db/orders";
import { getSellerById } from "./db/sellers";
import { getShippingSettings, hasShipFrom } from "./store-shipping-db";
import { DEFAULT_LABEL_PRINTER } from "./label-format-core";
import { getRates, buyLabel, voidLabel, isShipConfigured, getOrCreateShipAccount } from "./ship-provider";
import { recordShortfall } from "./shipping-shortfall-db";
import { recordLabelTransaction, getLabelTransaction, markLabelVoided } from "./shippo-labels-db";
import { MIN_MARGIN_CENTS } from "./shipping-tiers";
import { parcelForLabel, combineParcels } from "./parcel-core";
import { isoCountry, missingForLabel, describeMissing } from "./ship-from-core";
import { getStoreProfile } from "./store-profile-db";
import { sendOpsAlert, sendStoreOwnerAlert, ownerAlertButton } from "./email";
import { customsForOrder } from "./order-customs";

/**
 * Auto-generate a PREPAID shipping label for an order and store it (status stays 'paid': the seller
 * prints it and marks it shipped when they drop it off). The buyer already paid the flat shipping at
 * checkout and VYA collected it, so VYA covers the label here. The seller is never charged.
 *
 * Idempotent (skips if a label already exists) and best-effort: returns a reason instead of throwing
 * when it can't run (no ship-from address, Shippo off, no rates), so the seller falls back to the
 * manual "generate label" button. Buys the cheapest service.
 */
export async function generateOrderLabel(orderId: string): Promise<{ ok: boolean; reason?: string; detail?: string }> {
 if (!isShipConfigured()) return { ok: false, reason: "ship-not-configured" };
 const order = await getOrderDetail(orderId);
 if (!order) return { ok: false, reason: "order-not-found" };
 if (order.labelUrl) return { ok: true, reason: "already-labeled" };
 if (!order.shipLine1 || !order.shipCity) return { ok: false, reason: "no-ship-to" };

 const seller = await getSellerById(order.sellerId);
 if (!seller) return { ok: false, reason: "no-seller" };
 const shipping = await getShippingSettings(seller.slug);
 // What she prints on (label-format-core.ts): 4×6 for a thermal printer, the sheet otherwise.
 const printer = shipping.labelPrinter ?? DEFAULT_LABEL_PRINTER;
 if (!hasShipFrom(shipping)) return { ok: false, reason: "no-ship-from" };

 const f = shipping.shipFrom!;
 // Countries go to the carrier as ISO-2. The settings form takes free text, and two live stores
 // had "United States" saved, which Shippo and EasyPost both reject, so every rate came back
 // empty and no label could be bought. See isoCountry.
 // THE EMAIL IS NOT ALWAYS ON THE SELLER ROW. Three of the recent failures were
 // "address_from.email must not be empty", because this read seller.email and some stores have
 // none. The support address she set in Settings is the same person and is sitting right there.
 const fromEmail = String(seller.email || "").trim()
  || String((await getStoreProfile(seller.slug).catch(() => null))?.supportEmail || "").trim()
  || null;

 // ASKED BEFORE THE CARRIER IS, not after it refuses. USPS rejects a label with no seller phone or
 // email, and that rejection arrived as a raw carrier string at the moment she pressed Buy label,
 // with a packed parcel in front of her. Six of the last fourteen purchases on this account died
 // this way. Now it names the field while she can still do something about it.
 const labelGaps = missingForLabel(f, fromEmail);
 if (labelGaps.length) return { ok: false, reason: "incomplete-ship-from", detail: describeMissing(labelGaps) };

 const from = { name: f.name || seller.name, street1: f.street1!, street2: f.street2, city: f.city!, state: f.state!, zip: f.zip!, country: isoCountry(f.country), phone: f.phone, email: fromEmail ?? undefined };
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
 // Built BEFORE rating, not at purchase, so the price quoted is the price paid. A DDP rate costs
 // more than a DDU one because the duty is inside it.
 const { declaration: customs } = await customsForOrder({
  storeSlug: seller.slug, sellerName: seller.name, itemId: order.itemId,
  fromCountry: from.country, toCountry: to.country,
  parcelWeightOz: parcel.weightOz, fallbackValueCents: order.amountCents, fallbackTitle: order.itemTitle ?? undefined,
 }).catch(() => ({ declaration: null }));
 const rates = await getRates(from, to, parcel, shipAcct, customs, printer);
 if (!rates.length) return { ok: false, reason: "no-rates" };
 const label = await buyLabel(rates[0].rateId, shipAcct, printer);
 if (!label) return { ok: false, reason: "label-failed" };
 await setOrderLabel(orderId, { labelUrl: label.labelUrl, trackingNumber: label.trackingNumber, trackingUrl: label.trackingUrl, labelCostCents: label.costCents });
 await recordLabelTransaction(orderId, label.transactionId); // so we can void it if the order is refunded

 // AND TELL HER. This is the path a label is normally bought on, the moment the buyer pays, and it
 // was the one that said nothing: the label appeared in Orders and she had no reason to look.
 await sendLabelReadyEmail({
  storeSlug: seller.slug,
  orderId,
  itemTitle: order.itemTitle,
  labelUrl: label.labelUrl,
  trackingNumber: label.trackingNumber,
  qrCodeUrl: label.qrCodeUrl,
 });

 // WHAT THIS ORDER COST US, WRITTEN DOWN AND ATTRIBUTED.
 //
 // It used to be one email to ops: "thin shipping margin on order X". Sent, read or not, and gone.
 // Nothing accumulated, nothing could be totalled, and the two reasons arrived in the same sentence
 // even though only one of them is billable: a piece with no weight on it was priced off a category
 // guess and the box was not (hers), against a route VYA simply prices thin (ours).
 //
 // The buyer's postage goes to VYA in the application fee and VYA buys the label, so every one of
 // these lands on VYA until somebody does something about it. This is the number they would need.
 const paidCents = order.shippingPaidCents || 0;
 const shortfall = await recordShortfall({
  orderId,
  storeSlug: seller.slug,
  paidCents,
  labelCostCents: label.costCents,
  items: siblings.length ? siblings : [{ weightOz: order.itemWeightOz, lengthIn: order.itemLengthIn, widthIn: order.itemWidthIn, heightIn: order.itemHeightIn }],
 }).catch(() => null);

 // Ops still hears, but only about the half that is ours to fix, and with the cause named. A
 // recoverable one is a conversation with a seller, not a re-tune of the price table.
 if (paidCents > 0 && label.costCents > paidCents - MIN_MARGIN_CENTS) {
  const marginCents = paidCents - label.costCents;
  const whose = shortfall?.recoverable ? `RECOVERABLE from ${seller.slug}` : "ours";
  await sendOpsAlert(
   `Thin shipping margin on order ${orderId} (${shortfall?.cause ?? "unknown"}, ${whose})`,
   `Buyer paid ${paidCents}¢, real label ${label.costCents}¢ → margin ${marginCents}¢ (target ≥ ${MIN_MARGIN_CENTS}¢).\n${shortfall?.note ?? ""}`,
  ).catch(() => {});
 }
 return { ok: true };
}

/**
 * Void (refund) an order's shipping label. Used when an order is refunded before it ships, so VYA
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
 * Generate a prepaid RETURN label. The outbound label with from/to swapped: it ships FROM the buyer
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
 // What she prints on (label-format-core.ts): 4×6 for a thermal printer, the sheet otherwise.
 const printer = shipping.labelPrinter ?? DEFAULT_LABEL_PRINTER;
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
 // Built BEFORE rating, not at purchase, so the price quoted is the price paid. A DDP rate costs
 // more than a DDU one because the duty is inside it.
 const { declaration: customs } = await customsForOrder({
  storeSlug: seller.slug, sellerName: seller.name, itemId: order.itemId,
  fromCountry: from.country, toCountry: to.country,
  parcelWeightOz: parcel.weightOz, fallbackValueCents: order.amountCents, fallbackTitle: order.itemTitle ?? undefined,
 }).catch(() => ({ declaration: null }));
 const rates = await getRates(from, to, parcel, shipAcct, customs, printer);
 if (!rates.length) return { ok: false, reason: "no-rates" };
 const label = await buyLabel(rates[0].rateId, shipAcct, printer);
 if (!label) return { ok: false, reason: "label-failed" };
 await setReturnLabel(orderId, { url: label.labelUrl, trackingNumber: label.trackingNumber, costCents: label.costCents });
 return { ok: true, labelUrl: label.labelUrl, trackingNumber: label.trackingNumber, costCents: label.costCents };
}

/**
 * Ship a REJECTED return back to the buyer. A store → buyer label (same direction as the original
 * outbound, bought fresh and stored separately so it doesn't clash with the original fulfillment label).
 */
export async function generateShipBackLabel(orderId: string): Promise<{ ok: boolean; reason?: string; detail?: string; labelUrl?: string; trackingNumber?: string; costCents?: number }> {
 if (!isShipConfigured()) return { ok: false, reason: "ship-not-configured" };
 const order = await getOrderDetail(orderId);
 if (!order) return { ok: false, reason: "order-not-found" };
 if (!order.shipLine1 || !order.shipCity) return { ok: false, reason: "no-buyer-address" };
 const seller = await getSellerById(order.sellerId);
 if (!seller) return { ok: false, reason: "no-seller" };
 const shipping = await getShippingSettings(seller.slug);
 // What she prints on (label-format-core.ts): 4×6 for a thermal printer, the sheet otherwise.
 const printer = shipping.labelPrinter ?? DEFAULT_LABEL_PRINTER;
 if (!hasShipFrom(shipping)) return { ok: false, reason: "no-store-address" };
 const f = shipping.shipFrom!;

 // THE EMAIL IS NOT ALWAYS ON THE SELLER ROW. Three of the recent failures were
 // "address_from.email must not be empty", because this read seller.email and some stores have
 // none. The support address she set in Settings is the same person and is sitting right there.
 const fromEmail = String(seller.email || "").trim()
  || String((await getStoreProfile(seller.slug).catch(() => null))?.supportEmail || "").trim()
  || null;

 // ASKED BEFORE THE CARRIER IS, not after it refuses. USPS rejects a label with no seller phone or
 // email, and that rejection arrived as a raw carrier string at the moment she pressed Buy label,
 // with a packed parcel in front of her. Six of the last fourteen purchases on this account died
 // this way. Now it names the field while she can still do something about it.
 const labelGaps = missingForLabel(f, fromEmail);
 if (labelGaps.length) return { ok: false, reason: "incomplete-ship-from", detail: describeMissing(labelGaps) };

 const from = { name: f.name || seller.name, street1: f.street1!, street2: f.street2, city: f.city!, state: f.state!, zip: f.zip!, country: isoCountry(f.country), phone: f.phone, email: fromEmail ?? undefined };
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
 // Built BEFORE rating, not at purchase, so the price quoted is the price paid. A DDP rate costs
 // more than a DDU one because the duty is inside it.
 const { declaration: customs } = await customsForOrder({
  storeSlug: seller.slug, sellerName: seller.name, itemId: order.itemId,
  fromCountry: from.country, toCountry: to.country,
  parcelWeightOz: parcel.weightOz, fallbackValueCents: order.amountCents, fallbackTitle: order.itemTitle ?? undefined,
 }).catch(() => ({ declaration: null }));
 const rates = await getRates(from, to, parcel, shipAcct, customs, printer);
 if (!rates.length) return { ok: false, reason: "no-rates" };
 const label = await buyLabel(rates[0].rateId, shipAcct, printer);
 if (!label) return { ok: false, reason: "label-failed" };
 await setShipBackLabel(orderId, label.labelUrl);
 return { ok: true, labelUrl: label.labelUrl, trackingNumber: label.trackingNumber, costCents: label.costCents };
}

/**
 * Tell the seller her label is ready.
 *
 * ONE COPY, CALLED FROM BOTH PATHS, because the drift is the bug. Buying a label happens in two
 * places: automatically the moment the buyer pays (the normal case, here in generateOrderLabel) and
 * manually from the Orders screen when that failed. Only the MANUAL one sent this email, so on the
 * ordinary path the label simply appeared in Orders and nothing told her it existed. Ops heard when
 * auto-buy failed; she heard nothing when it worked.
 *
 * The QR code is included when the carrier returned one. USPS Label Broker means she needs no
 * printer at all: the counter scans it and prints the label for her, which for a seller working off
 * a kitchen table is the difference between posting today and posting when she next finds a printer.
 * The auto path was dropping it even though Shippo hands it back on every purchase.
 *
 * Never throws. The label IS bought and stored; a mail outage must not make that look like failure.
 */
export async function sendLabelReadyEmail(args: {
 storeSlug: string;
 orderId: string;
 itemTitle?: string | null;
 labelUrl: string;
 trackingNumber?: string | null;
 qrCodeUrl?: string | null;
}): Promise<void> {
 if (!args.labelUrl) return;
 const what = args.itemTitle || `order ${args.orderId}`;
 const tracking = args.trackingNumber
  ? `<p style="font-size:13px;color:#6b6b6b;margin:16px 0 0;">Tracking: <b>${args.trackingNumber}</b></p>`
  : "";
 const qr = args.qrCodeUrl
  ? `<p style="font-size:14px;line-height:1.7;margin:18px 0 0;">No printer? Show this at the Post Office and they will print it for you.</p>${ownerAlertButton(args.qrCodeUrl, "Show the QR code")}`
  : "";
 await sendStoreOwnerAlert(args.storeSlug, {
  subject: `Shipping label: ${what}`,
  html:
   `<p style="font-size:16px;line-height:1.7;margin:0 0 18px;">Your label for <b>${what}</b> is ready. ` +
   `Print it, tape it on, and mark the order shipped when you drop it off.</p>` +
   ownerAlertButton(args.labelUrl, "Print the label") + qr + tracking,
 }).catch(() => {});
}
