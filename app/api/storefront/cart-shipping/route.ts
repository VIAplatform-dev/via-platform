import { NextRequest, NextResponse } from "next/server";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { assignTier, flatRateCents } from "@/app/lib/shipping-tiers";

export const dynamic = "force-dynamic";
const COOKIE = "via_cart";

// POST { toAddress } — live shipping for the whole bag. The cart's items ship as one
// parcel (weights summed) from the store's ship-from. Free when the store covers it;
// falls back to free if rates can't be computed so a sale is never blocked. Mirrors
// /api/storefront/shipping-rates but for the cart. Single-seller carts are the norm.
export async function POST(request: NextRequest) {
 const token = request.cookies.get(COOKIE)?.value;
 const body = await request.json().catch(() => null);
 const to = body?.toAddress || {};
 if (!token) return NextResponse.json({ error: "Your bag is empty." }, { status: 400 });
 if (!to.street1 || !to.city || !to.zip) return NextResponse.json({ error: "A full address is required." }, { status: 400 });

 const ids = await getCartItemIds(token);
 const items = [];
 let sellerId = "";
 for (const id of ids) { const it = await getItem(id); if (it && it.status !== "sold" && it.status !== "removed") { items.push(it); sellerId = it.sellerId; } }
 if (!items.length) return NextResponse.json({ error: "Your bag is empty." }, { status: 409 });

 const seller = await getSellerById(sellerId);
 if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });
 const shipping = await getShippingSettings(seller.slug);
 const subtotal = items.reduce((s, it) => s + it.priceCents, 0);
 const threshold = shipping.freeThresholdCents;
 const free = shipping.mode === "store_pays" || (shipping.mode === "free_over" && threshold != null && subtotal >= threshold);
 if (free) return NextResponse.json({ free: true, rates: [] });

 // Flat-rate pricing: the buyer pays one clean tier price by parcel size (auto-detected from the
 // items' captured weight/dimensions). VYA buys the real discounted label at fulfillment and keeps
 // the spread. Combine the bag into one parcel: sum weights + heights, take the largest L/W.
 const parcel = {
 weightOz: items.reduce((s, it) => s + (it.weightOz || 16), 0),
 lengthIn: Math.max(...items.map((it) => it.lengthIn || 12)),
 widthIn: Math.max(...items.map((it) => it.widthIn || 9)),
 heightIn: items.reduce((s, it) => s + (it.heightIn || 3), 0),
 };
 const tier = assignTier(parcel);
 // One clean, consistent flat price by size — same number every time (Depop/Poshmark-style), matching
 // exactly what checkout charges. No live-rate lookup, so it never varies by distance or blocks a sale.
 const charge = flatRateCents(parcel);
 return NextResponse.json({ free: false, rates: [{ provider: "VYA", service: `${tier.label} parcel`, costCents: charge, estDays: null }] });
}
