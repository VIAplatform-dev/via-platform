import { NextRequest, NextResponse } from "next/server";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { getShippingSettings } from "@/app/lib/store-shipping-db";

export const dynamic = "force-dynamic";
const COOKIE = "via_cart";

// GET — everything the cart checkout page needs: live cart items, the store, and
// whether shipping is free (based on the cart subtotal). Mirrors checkout-info.
export async function GET(request: NextRequest) {
 const token = request.cookies.get(COOKIE)?.value;
 const ids = token ? await getCartItemIds(token) : [];
 const items: { id: string; title: string; priceCents: number; currency: string; image: string | null }[] = [];
 let sellerId = "";
 for (const id of ids) {
 const it = await getItem(id);
 if (it && it.status !== "sold" && it.status !== "removed") {
 items.push({ id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency, image: it.images?.[0] || null });
 sellerId = it.sellerId;
 }
 }
 if (!items.length) return NextResponse.json({ error: "Your bag is empty." }, { status: 409 });

 const seller = sellerId ? await getSellerById(sellerId) : null;
 const shipping = seller ? await getShippingSettings(seller.slug) : null;
 const subtotal = items.reduce((s, i) => s + i.priceCents, 0);
 const mode = shipping?.mode ?? "buyer_pays";
 const threshold = shipping?.freeThresholdCents ?? null;
 const freeShipping = mode === "store_pays" || (mode === "free_over" && threshold != null && subtotal >= threshold);

 return NextResponse.json({ items, storeName: seller?.name || "the store", freeShipping, subtotalCents: subtotal, publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim() });
}
