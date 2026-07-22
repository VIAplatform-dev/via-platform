import { NextRequest, NextResponse } from "next/server";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getShippingSettings, hasShipFrom } from "@/app/lib/store-shipping-db";
import { assignTier, buyerChargeCents, tierNeedsFloorCheck } from "@/app/lib/shipping-tiers";
import { getRates, isShippoConfigured } from "@/app/lib/shippo";

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
 // the spread — so this needs no ship-from or live-rate lookup and never blocks checkout.
 // Combine the bag into one parcel: sum weights + heights, take the largest L/W.
 const parcel = {
 weightOz: items.reduce((s, it) => s + (it.weightOz || 16), 0),
 lengthIn: Math.max(...items.map((it) => it.lengthIn || 12)),
 widthIn: Math.max(...items.map((it) => it.widthIn || 9)),
 heightIn: items.reduce((s, it) => s + (it.heightIn || 3), 0),
 };
 const tier = assignTier(parcel);
 // Guarantee margin: only the Large tier can be eaten by a real label, so floor just that case
 // against the live cheapest rate (when we can price it). Small/Medium always clear comfortably.
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
