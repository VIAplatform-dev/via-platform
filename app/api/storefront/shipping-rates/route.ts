import { NextRequest, NextResponse } from "next/server";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { parcelForLabel } from "@/app/lib/parcel-core";
import { resolveBuyerShipping, resolveExpedited } from "@/app/lib/shipping-price";

export const dynamic = "force-dynamic";

// POST { itemId, toAddress } — live shipping options for the buyer's address.
// Returns { free: true } when the store covers shipping for this piece, or the
// cheapest 1–2 rates when the buyer pays. Falls back to free if rates can't be
// computed (Shippo off / no ship-from) so a sale is never blocked.
export async function POST(request: NextRequest) {
 const body = await request.json().catch(() => null);
 const itemId = String(body?.itemId || "");
 const to = body?.toAddress || {};
 if (!itemId || !to.street1 || !to.city || !to.zip) return NextResponse.json({ error: "Item and a full address are required." }, { status: 400 });

 const item = await getItem(itemId);
 if (!item || item.status !== "active") return NextResponse.json({ error: "This piece is no longer available." }, { status: 409 });
 const seller = await getSellerById(item.sellerId);
 if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });

 const shipping = await getShippingSettings(seller.slug);
 const threshold = shipping.freeThresholdCents;
 const free = shipping.mode === "store_pays" || (shipping.mode === "free_over" && threshold != null && item.priceCents >= threshold);
 if (free) return NextResponse.json({ free: true, rates: [] });

 // Flat-rate pricing: one clean tier price by the piece's size (auto-detected from its captured
 // weight/dimensions). VYA buys the real discounted label at fulfillment and keeps the spread.
 // No shipping paid yet — this IS the quote — so the floor is the middle of the ladder rather than
 // a mailer. Guessing small here undercharges the shopper and the store eats it at label time.
 const parcel = parcelForLabel({ item, shippingPaidCents: null });
 // One clean, consistent flat price by size — same number every time (Depop/Poshmark-style), matching
 // exactly what checkout charges. Priced by ZONE with the store's own tier prices when it set them
 // (shipping-zones.ts + shipping-prices-core.ts); a country she doesn't serve is refused, not sold.
 // ONE resolver for the quote AND the charge (shipping-price.ts). They were computed separately
 // and my own change made them disagree: this route started returning a live rate while
 // /cart-intent still charged the zone price, so a buyer could be shown $17 and billed $24.
 const priced = await resolveBuyerShipping({ settings: shipping, sellerName: seller.name, sellerEmail: seller.email, to, parcel });
 if (!priced.ok) return NextResponse.json({ error: "This store doesn’t ship to that country yet." }, { status: 400 });

 const express = await resolveExpedited({
  settings: shipping, sellerName: seller.name, sellerEmail: seller.email, to, parcel,
  standardEstDays: priced.estDays,
 });

 return NextResponse.json({
  free: false, currency: item.currency,
  rates: [
   { provider: "VYA", service: priced.service, costCents: priced.amountCents, estDays: priced.estDays },
   ...(express ? [{ provider: "VYA", service: express.service, costCents: express.amountCents, estDays: express.estDays }] : []),
  ],
 });
}
