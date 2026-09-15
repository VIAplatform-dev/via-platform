import { NextRequest, NextResponse } from "next/server";
import { verifyState, verifyCallbackHmac, exchangeCodeForToken } from "@/app/lib/shopify-oauth";
import { saveConnection } from "@/app/lib/store-connections-db";

export const dynamic = "force-dynamic";

// GET: Shopify redirects here after the seller approves. We verify the request,
// trade the code for an Admin API token, and save it as the store's connection.
export async function GET(request: NextRequest) {
 const origin = request.nextUrl.origin;
 const params = request.nextUrl.searchParams;
 const fail = (why: string) => NextResponse.redirect(new URL(`/store/import?shopify=${why}`, origin));

 const state = verifyState(params.get("state") || "");
 if (!state?.slug) return fail("state");
 if (!verifyCallbackHmac(params)) return fail("hmac");

 // Trust the shop Shopify signed into the (HMAC-verified) callback: it's the
 // store that actually approved and whose token we're about to receive.
 const shop = params.get("shop") || "";
 if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return fail("shop");

 const code = params.get("code") || "";
 const token = code ? await exchangeCodeForToken(shop, code) : null;
 if (!token) return fail("token");

 await saveConnection(state.slug, "shopify", { shopDomain: shop, token }, shop).catch(() => {});
 return NextResponse.redirect(new URL("/store/import?shopify=connected", origin));
}
