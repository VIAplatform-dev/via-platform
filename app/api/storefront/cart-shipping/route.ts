import { NextRequest, NextResponse } from "next/server";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { requestBagSellerId } from "@/app/lib/storefront-cart-scope";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { emptyBagMessage } from "@/app/lib/storefront-cart-core";
import { assignTier, flatRateCents } from "@/app/lib/shipping-tiers";
import { resolveDelivery } from "@/app/lib/checkout-delivery.ts";

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
 // A collection needs no address, so the address check waits until we know (from the STORE's
 // settings, below) whether this really is one. A shopper claiming pickup at a store that doesn't
 // offer it still gets asked for her address — she just gets asked a moment later.
 const hasAddress = !!(to.street1 && to.city && to.zip);
 const claimed = typeof body?.delivery === "string" ? body.delivery : null;
 if (!hasAddress && claimed !== "pickup") return NextResponse.json({ error: "A full address is required." }, { status: 400 });

 // This store's bag — see storefront-cart-scope.
 const ids = await getCartItemIds(token, await requestBagSellerId(request, token));
 const items = [];
 let sellerId = "";
 // Pieces that sold while the shopper was deciding are named back to them rather than reported as
 // an empty bag — see emptyBagMessage.
 const gone: string[] = [];
 for (const id of ids) { const it = await getItem(id); if (it && it.status !== "sold" && it.status !== "removed") { items.push(it); sellerId = it.sellerId; } else if (it) { gone.push(it.title); } }
 if (!items.length) return NextResponse.json({ error: emptyBagMessage(ids.length, gone) }, { status: 409 });

 const seller = await getSellerById(sellerId);
 if (!seller) return NextResponse.json({ error: "Seller not found." }, { status: 404 });
 const shipping = await getShippingSettings(seller.slug);
 const subtotal = items.reduce((s, it) => s + it.priceCents, 0);

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

 // The one place the choice is priced: what she claimed, checked against what this store offers.
 // A claim of "pickup" at a store with no collection address comes back as a delivery, postage and
 // all — cart-intent re-runs exactly this before charging, so the quote and the charge agree.
 // Read off the body ALREADY parsed above. `request.clone()` throws once the body has been
 // consumed — and it throws synchronously, before the `.catch()` can attach — so the clone took the
 // whole request down with a 500 and checkout stopped at "Couldn't prepare checkout."
 const d = resolveDelivery({ claimed, subtotalCents: subtotal, parcelShipCents: charge, settings: shipping });
 if (d.method === "pickup") {
  return NextResponse.json({ free: true, rates: [], delivery: "pickup", pickupAvailable: true, collectFrom: d.collectFrom, instructions: d.instructions });
 }
 // She asked to collect somewhere that doesn't do it — she's being posted to, so we need the address.
 if (!hasAddress) return NextResponse.json({ error: "This store isn’t offering collection — a full address is required." }, { status: 400 });
 if (d.shippingCents === 0) return NextResponse.json({ free: true, rates: [], delivery: "ship", pickupAvailable: d.pickupAvailable });
 return NextResponse.json({ free: false, delivery: "ship", pickupAvailable: d.pickupAvailable, rates: [{ provider: "VYA", service: `${tier.label} parcel`, costCents: d.shippingCents, estDays: null }] });
}
