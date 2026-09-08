// ───────────────────────────────────────────────────────────────────────────
// The prepaid return label a rental promises.
//
// "A prepaid return label is in the box" is a sentence the storefront prints when a store turns the
// setting on — and until now that is ALL it was. Nothing bought a label, so a store that ticked the
// box was telling every renter something that wasn't true.
//
// It buys the label the same way an order return does (cheapest rate, store's Shippo account), just
// keyed on a BOOKING rather than an order: rentals never create an order, because nothing is sold.
// FROM the renter, TO the store — the piece is coming home.
// ───────────────────────────────────────────────────────────────────────────
import { isoCountry } from "../ship-from-core";
import { parcelForLabel } from "../parcel-core";
import { getBooking, setRentalReturnLabel, getStoreSettings } from "./rentals-db";
import { resolveSettings } from "./settings-core";
import { getSellerById } from "../db/sellers";
import { getShippingSettings, hasShipFrom } from "../store-shipping-db";
import { getRates, buyLabel, isShipConfigured, getOrCreateShipAccount } from "../ship-provider";
import { getItem } from "../db/inventory";

export type LabelResult = { ok: boolean; reason?: string; labelUrl?: string; trackingNumber?: string; costCents?: number };

/**
 * Buy the return label for one booking.
 *
 * Every failure is a `reason` rather than a throw, because the caller is a seller pressing a button
 * and "no ship-from address" is something they can fix — where a stack trace isn't.
 */
export async function generateRentalReturnLabel(bookingId: string): Promise<LabelResult> {
 if (!isShipConfigured()) return { ok: false, reason: "shipping-not-configured" };

 const booking = await getBooking(bookingId);
 if (!booking) return { ok: false, reason: "booking-not-found" };
 // Bought once. A second press returns the same label rather than charging the store twice.
 if (booking.returnLabelUrl) {
  return { ok: true, reason: "already-bought", labelUrl: booking.returnLabelUrl, trackingNumber: booking.returnTracking ?? undefined };
 }
 if (booking.delivery === "pickup") return { ok: false, reason: "collected-in-person" };
 if (!booking.ship?.line1 || !booking.ship.city) return { ok: false, reason: "no-renter-address" };

 const seller = await getSellerById(booking.sellerId);
 if (!seller) return { ok: false, reason: "no-seller" };

 // The store has to have said it pays for returns. Buying one anyway would spend a seller's money
 // on a promise they never made.
 const store = await getStoreSettings(seller.slug).catch(() => null);
 const settings = resolveSettings(store, null);
 if (!settings.prepaidLabel) return { ok: false, reason: "store-does-not-prepay" };

 const shipping = await getShippingSettings(seller.slug);
 if (!hasShipFrom(shipping)) return { ok: false, reason: "no-store-address" };
 const s = shipping.shipFrom!;

 // FROM the renter, TO the shop — the opposite of the outbound leg.
 const from = {
  name: booking.renterName || "Renter", street1: booking.ship.line1, street2: booking.ship.line2 || undefined,
  city: booking.ship.city, state: booking.ship.state, zip: booking.ship.zip, country: isoCountry(booking.ship.country),
  phone: booking.renterPhone || undefined, email: booking.renterEmail || undefined,
 };
 const to = {
  name: s.name || seller.name, street1: s.street1!, street2: s.street2, city: s.city!, state: s.state!,
  zip: s.zip!, country: isoCountry(s.country), phone: s.phone, email: seller.email,
 };

 // The piece's own measurements where it has them — a rented coat and a rented clutch are not the
 // same parcel, and a wrong guess is a wrong price.
 const item = await getItem(booking.itemId).catch(() => null);
 // …and where it hasn't, the middle of the ladder rather than a mailer. The line above was right
 // about the wrong guess being a wrong price, and then guessed 16oz in a 12x9x3 — which is a
 // clutch, so every unmeasured coat went back on a label that didn't cover it. parcelForLabel
 // with nothing paid resolves to Medium, never Small.
 const parcel = parcelForLabel({
  item: { weightOz: item?.weightOz, lengthIn: item?.lengthIn, widthIn: item?.widthIn, heightIn: item?.heightIn },
  shippingPaidCents: null,
 });

 const acct = await getOrCreateShipAccount(seller.slug, seller.name);
 const rates = await getRates(from, to, parcel, acct);
 if (!rates.length) return { ok: false, reason: "no-rates" };

 const label = await buyLabel(rates[0].rateId, acct);
 if (!label) return { ok: false, reason: "label-failed" };

 await setRentalReturnLabel(bookingId, { url: label.labelUrl, trackingNumber: label.trackingNumber, costCents: label.costCents });
 return { ok: true, labelUrl: label.labelUrl, trackingNumber: label.trackingNumber, costCents: label.costCents };
}
