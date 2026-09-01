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

/**
 * A RELATIVE Location, for the same reason the cart's submit route uses one: request.url is the
 * server's view of the request, not the seller's domain (locally it comes back as localhost:3000),
 * so redirecting through it walks the shopper off the store origin — and the shopper cookie set on
 * this very response is scoped to that origin, so they would arrive signed out. The browser
 * resolves a relative Location against the page it is already on, which cannot leave the origin.
 */
const home = (path: string) =>
 new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return NextResponse.json({ error: "Unknown store." }, { status: 404 });

 const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
 const token = request.nextUrl.searchParams.get("token") || "";
 const link = secret ? readSignInLink(token, store.slug, secret) : null;

 // Expired, forged, or issued for another shop. Say the same thing for all three: which one it was
 // is only useful to someone probing.
 if (!link) {
  const res = home("/?signin=expired");
  res.cookies.delete(SHOPPER_COOKIE);
  return res;
 }

 await upsertShopper(store.slug, link.email, null).catch(() => {});

 const res = home("/?signin=ok");
 res.cookies.set(SHOPPER_COOKIE, signShopperToken({ email: link.email, storeSlug: store.slug }, secret as string), shopperCookieOptions());
 return res;
}
