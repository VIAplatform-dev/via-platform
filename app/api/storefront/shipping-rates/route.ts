import { NextRequest, NextResponse } from "next/server";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { assignTier, flatRateCents } from "@/app/lib/shipping-tiers";

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
 const parcel = { weightOz: item.weightOz || 16, lengthIn: item.lengthIn || 12, widthIn: item.widthIn || 9, heightIn: item.heightIn || 3 };
 const tier = assignTier(parcel);
 // One clean, consistent flat price by size — same number every time (Depop/Poshmark-style), matching
 // exactly what checkout charges. No live-rate lookup, so it never varies by distance or blocks a sale.
 const charge = flatRateCents(parcel);
 return NextResponse.json({ free: false, rates: [{ provider: "VYA", service: `${tier.label} parcel`, costCents: charge, estDays: null }] });
}
