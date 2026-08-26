// Shared plumbing for the Shopify-shaped cart routes: who is this store, whose cart is this, and
// how do we answer in the theme's own dialect.
//
// The cart itself is VYA's existing storefront cart (`storefront-cart-db` + the `via_cart` cookie) —
// deliberately NOT a second cart. A shopper who adds through the theme's drawer and then goes to
// VYA's checkout must be looking at the same bag.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCartItemIds } from "@/app/lib/storefront-cart-db";
import { getItem } from "@/app/lib/db/inventory";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { storeSlugForHost } from "./store-host";
import { buildCart, type CartLineItem, type ShopifyCart } from "./cart-json";

export const CART_COOKIE = "via_cart";

/**
 * The store this request is for, derived from the HOST — not from a header or a query parameter.
 *
 * The host is what actually routed the request, so it can't be re-pointed by a script running on the
 * page. A spoofable `x-store` header would let the seller's own JavaScript address another seller's
 * catalogue.
 */
export async function resolveStore(request: NextRequest): Promise<{ slug: string; sellerId: string } | null> {
 const slug = storeSlugForHost(request.headers.get("host"));
 if (!slug) return null;
 const seller = await getSellerBySlug(slug);
 return seller ? { slug, sellerId: seller.id } : null;
}

/** The visitor's cart token, minting one when they don't have a cart yet. */
export function cartToken(request: NextRequest): { token: string; isNew: boolean } {
 const existing = request.cookies.get(CART_COOKIE)?.value;
 return existing ? { token: existing, isNew: false } : { token: randomUUID(), isNew: true };
}

/** Attach a freshly minted cart cookie. Scoped to this store's own origin, which is what makes a
 *  hosted store's shoppers the SELLER's customers rather than shared across VYA. */
export function withCartCookie(res: NextResponse, token: string, isNew: boolean): NextResponse {
 if (isNew) res.cookies.set(CART_COOKIE, token, { maxAge: 60 * 60 * 24 * 30, path: "/", httpOnly: true, sameSite: "lax" });
 return res;
}

/**
 * Squarespace's own "this visitor has a cart" flag.
 *
 * Not decoration, and not ours to skip: its storefront bundle gates BOTH the cart fetch on page load
 *
 *   if (isAuthenticated || Cookies.get("hasCart") === "true" || Cookies.get("CART")) ShoppingCart.load(…)
 *
 * and the mini-cart's Checkout button (which throws without it) on this cookie. Miss it and a
 * shopper's bag looks empty on every page they open afterwards, however much is really in it.
 * Deliberately NOT httpOnly — the seller's own script is what reads it.
 */
export function withSqsCartFlag(res: NextResponse, hasCart: boolean): NextResponse {
 if (hasCart) res.cookies.set("hasCart", "true", { maxAge: 60 * 60 * 24 * 30, path: "/", httpOnly: false, sameSite: "lax" });
 else res.cookies.set("hasCart", "", { maxAge: 0, path: "/", httpOnly: false, sameSite: "lax" });
 return res;
}

/** Load the visitor's cart and render it in Shopify's shape. Sold/removed pieces drop out on their
 *  own — one-of-one inventory means availability is the status, not a count. */
export async function currentCart(token: string): Promise<ShopifyCart> {
 return buildCart(await cartLines(token), token);
}

/** The visitor's cart as plain VYA pieces, before any platform's dialect is applied — Shopify's
 *  above, Squarespace's in sqs-cart-json.ts. Both drop sold and removed pieces here, so every
 *  surface counts the same bag. */
export async function cartLines(token: string): Promise<CartLineItem[]> {
 if (!token) return [];
 const ids = await getCartItemIds(token);
 const lines: CartLineItem[] = [];
 for (const id of ids) {
  const it = await getItem(id);
  if (!it || it.status === "sold" || it.status === "removed") continue;
  lines.push({
   id: it.id,
   title: it.title,
   priceCents: it.priceCents,
   currency: it.currency,
   image: it.images?.[0] ?? null,
   handle: it.sourceId,
   sourceVariantId: it.variants?.[0]?.sourceVariantId ?? it.sourceId,
   available: it.status === "active",
  });
 }
 return lines;
}

/**
 * How many pieces are really in this visitor's bag.
 *
 * Deliberately derived from `currentCart` rather than counted straight off the token: the drawer and
 * the /cart.js response drop sold and removed pieces, and a header badge that counted them anyway
 * would say "2" over a drawer showing one item. One rule, one number, everywhere.
 */
export async function cartItemCount(token: string): Promise<number> {
 if (!token) return 0;
 try { return (await currentCart(token)).item_count; } catch { return 0; }
}

/** Shopify's cart JSON, with the headers themes expect. */
export function cartResponse(cart: ShopifyCart, status = 200): NextResponse {
 return NextResponse.json(cart, { status, headers: { "Cache-Control": "no-store" } });
}

/** Shopify's error shape — themes render `description` in the drawer. */
export function errorResponse(description: string, status = 422): NextResponse {
 return NextResponse.json({ status, message: "Cart Error", description }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Read a theme's request body whichever way it was sent.
 *
 * Themes post Add-to-cart as JSON *or* as a classic form encoding depending on the theme and on
 * whether their JS ran — both must work, or Add-to-cart silently does nothing.
 */
export async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
 const type = (request.headers.get("content-type") || "").toLowerCase();
 try {
  if (type.includes("application/json")) return (await request.json()) as Record<string, unknown>;
  const form = await request.formData();
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : "";
  return out;
 } catch {
  return {};
 }
}
