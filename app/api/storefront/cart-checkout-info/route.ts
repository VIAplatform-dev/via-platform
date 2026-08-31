import { NextRequest, NextResponse } from "next/server";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { requestBagSellerId } from "@/app/lib/storefront-cart-scope";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { emptyBagMessage } from "@/app/lib/storefront-cart-core";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { pickupOffered, formatPickupAddress } from "@/app/lib/pickup-core.ts";

export const dynamic = "force-dynamic";
const COOKIE = "via_cart";

// GET — everything the cart checkout page needs: live cart items, the store, and
// whether shipping is free (based on the cart subtotal). Mirrors checkout-info.
export async function GET(request: NextRequest) {
 const token = request.cookies.get(COOKIE)?.value;
 // This store's bag — see storefront-cart-scope.
 const ids = token ? await getCartItemIds(token, await requestBagSellerId(request, token)) : [];
 const items: { id: string; title: string; priceCents: number; currency: string; image: string | null }[] = [];
 let sellerId = "";
 // The pieces that have gone since they were added. One-of-one stock sells while a shopper is still
 // deciding, and "your bag is empty" for a bag they remember filling reads as a broken shop — so
 // the ones that sold are named back to them (see emptyBagMessage).
 const gone: string[] = [];
 for (const id of ids) {
 const it = await getItem(id);
 if (it && it.status !== "sold" && it.status !== "removed") {
 items.push({ id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency, image: it.images?.[0] || null });
 sellerId = it.sellerId;
 } else if (it) {
 gone.push(it.title);
 }
 }
 if (!items.length) return NextResponse.json({ error: emptyBagMessage(ids.length, gone) }, { status: 409 });

 const seller = sellerId ? await getSellerById(sellerId) : null;
 const shipping = seller ? await getShippingSettings(seller.slug) : null;
 const subtotal = items.reduce((s, i) => s + i.priceCents, 0);
 const mode = shipping?.mode ?? "buyer_pays";
 const threshold = shipping?.freeThresholdCents ?? null;
 const freeShipping = mode === "store_pays" || (mode === "free_over" && threshold != null && subtotal >= threshold);
 // Collect in store — whether it's on offer at all, so checkout knows before an address is typed
 // (collection needs none). Advisory: the money is still decided server-side at quote and at
 // payment, so a shopper who flips this in the response gains nothing. See checkout-delivery.ts.
 const pk = shipping?.pickup ?? null;
 const pickup = pickupOffered(pk)
  ? { available: true, address: formatPickupAddress(pk!.address!), instructions: (pk!.instructions || "").trim() || null }
  : { available: false, address: null, instructions: null };

 return NextResponse.json({ items, storeName: seller?.name || "the store", freeShipping, pickup, subtotalCents: subtotal, publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim() });
}
