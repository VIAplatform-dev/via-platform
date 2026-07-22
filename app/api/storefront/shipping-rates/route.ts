import { NextRequest, NextResponse } from "next/server";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getShippingSettings, hasShipFrom } from "@/app/lib/store-shipping-db";
import { assignTier, buyerChargeCents, tierNeedsFloorCheck } from "@/app/lib/shipping-tiers";
import { getRates, isShippoConfigured } from "@/app/lib/shippo";

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
 // weight/dimensions). VYA buys the real discounted label at fulfillment and keeps the spread —
 // so no ship-from or live-rate lookup is needed and the sale is never blocked.
 const parcel = { weightOz: item.weightOz || 16, lengthIn: item.lengthIn || 12, widthIn: item.widthIn || 9, heightIn: item.heightIn || 3 };
 const tier = assignTier(parcel);
 // Guarantee margin: floor the Large tier against the live cheapest rate so VYA never ships at a loss.
 let liveCheapest: number | null = null;
 if (tierNeedsFloorCheck(tier.id) && isShippoConfigured() && hasShipFrom(shipping)) {
 const f = shipping.shipFrom!;
 const from = { name: f.name, street1: f.street1!, street2: f.street2, city: f.city!, state: f.state!, zip: f.zip!, country: f.country || "US", phone: f.phone };
 const dest = { name: to.name, street1: to.street1, street2: to.street2, city: to.city, state: to.state, zip: to.zip, country: to.country || "US", phone: to.phone };
 const rates = await getRates(from, dest, parcel).catch(() => []);
 if (rates.length) liveCheapest = rates[0].amountCents;
 }
 const charge = buyerChargeCents(parcel, liveCheapest);
 return NextResponse.json({ free: false, rates: [{ provider: "VYA", service: `${tier.label} parcel`, costCents: charge, estDays: null }] });
}
