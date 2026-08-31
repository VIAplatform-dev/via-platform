// Which store's bag a storefront request is about.
//
// The `/api/storefront/cart*` routes are reached from two different worlds. On a hosted storefront
// they arrive on the seller's own domain, where the host names the store. On VYA's own domain every
// store is served under one address (`/site/{slug}`, `/s/{handle}`, the checkout page), so there is
// no host to read and the page has to say which store it is showing.
//
// The decision itself is pure and tested in storefront-cart-core (bagStoreSlug); this resolves that
// slug to a seller, and falls back to the bag's own store when nothing else answers.
import type { NextRequest } from "next/server";
import { storeSlugForHost } from "./plan-b/store-host.ts";
import { bagStoreSlug } from "./storefront-cart-core.ts";
import { getSellerBySlug } from "./db/sellers.ts";
import { cartSellerId } from "./storefront-cart-db.ts";

/**
 * The seller whose bag this request means, or null when it cannot be told.
 *
 * Null is not a failure: every reader treats it as "the whole bag", which is exactly how these
 * routes behaved before bags were per-store. So a page that hasn't been taught to name its store
 * keeps working — it just doesn't get the filtering.
 *
 * The last resort — the bag's OWN store — is what keeps a shopper's single-store bag working on a
 * VYA page that forgot the `?store=`: with one store in the bag there is no ambiguity to resolve.
 */
export async function requestBagSellerId(request: NextRequest, cartToken: string | null | undefined): Promise<string | null> {
 const slug = bagStoreSlug(storeSlugForHost(request.headers.get("host")), request.nextUrl.searchParams.get("store"));
 if (slug) {
  const seller = await getSellerBySlug(slug).catch(() => null);
  if (seller) return seller.id;
 }
 return cartToken ? await cartSellerId(cartToken).catch(() => null) : null;
}
