import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { isShopifyOAuthConfigured, normalizeShop, signState, buildAuthUrl } from "@/app/lib/shopify-oauth";

export const dynamic = "force-dynamic";

// GET ?shop=… kick off the one-click connect. The acting seller is identified
// from their VYA session and stamped into a signed `state`, so the callback knows
// which VYA store to attach the connection to.
export async function GET(request: NextRequest) {
 const origin = request.nextUrl.origin;
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.redirect(new URL("/store/login", origin));
 if (!isShopifyOAuthConfigured()) return NextResponse.redirect(new URL("/store/import?shopify=unconfigured", origin));

 const shop = normalizeShop(request.nextUrl.searchParams.get("shop") || "");
 if (!shop) return NextResponse.redirect(new URL("/store/import?shopify=baddomain", origin));

 const state = signState({ slug, shop, t: Date.now() });
 const redirectUri = `${origin}/api/store/shopify-oauth/callback`;
 return NextResponse.redirect(buildAuthUrl(shop, state, redirectUri));
}
