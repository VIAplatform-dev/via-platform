import { NextRequest, NextResponse } from "next/server";
import { resolveStore } from "@/app/lib/plan-b/cart-session";
import { readSignInLink } from "@/app/lib/shopper-signin";
import { signShopperToken, shopperCookieOptions, SHOPPER_COOKIE } from "@/app/lib/shopper-session";
import { upsertShopper } from "@/app/lib/store-customers-db";

/**
 * GET ?token=… — the link from the email. Signs the shopper in to THIS store and sends them home.
 *
 * The store comes from the host and the link names the store it was issued for; both must agree, so
 * forwarding a sign-in email cannot hand anyone an account at a different seller's shop.
 *
 * Signing in makes someone that seller's customer and nothing else. It does not create a VYA
 * account, and it does not subscribe them to anything — the seller can ask for that separately.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return NextResponse.json({ error: "Unknown store." }, { status: 404 });

 const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
 const token = request.nextUrl.searchParams.get("token") || "";
 const link = secret ? readSignInLink(token, store.slug, secret) : null;

 // Expired, forged, or issued for another shop. Say the same thing for all three: which one it was
 // is only useful to someone probing.
 if (!link) {
  const res = NextResponse.redirect(new URL("/?signin=expired", request.url));
  res.cookies.delete(SHOPPER_COOKIE);
  return res;
 }

 await upsertShopper(store.slug, link.email, null).catch(() => {});

 const res = NextResponse.redirect(new URL("/?signin=ok", request.url));
 res.cookies.set(SHOPPER_COOKIE, signShopperToken({ email: link.email, storeSlug: store.slug }, secret as string), shopperCookieOptions());
 return res;
}
