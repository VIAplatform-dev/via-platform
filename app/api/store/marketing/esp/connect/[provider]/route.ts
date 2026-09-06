import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { authorizeUrl, makePkce, makeState, oauthConfigured, espBaseUrl } from "@/app/lib/esp-oauth";
import type { EspProvider } from "@/app/lib/esp-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = espBaseUrl();

// "Connect Mailchimp" — step one. Send the seller to the provider's own sign-in.
//
// The things we need on the way back — which store this was, the PKCE verifier, the state — go in a
// short-lived, httpOnly cookie rather than a database row: they're worthless after five minutes, and
// a cookie means an abandoned connection cleans itself up.
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.redirect(new URL("/admin/marketing/esp?error=signin", BASE));

 const { provider: raw } = await ctx.params;
 const provider = (raw === "mailchimp" ? "mailchimp" : "klaviyo") as EspProvider;
 if (!oauthConfigured(provider)) {
  return NextResponse.redirect(new URL(`/admin/marketing/esp?error=unavailable&p=${provider}`, BASE));
 }

 const clientId = (provider === "mailchimp" ? process.env.MAILCHIMP_CLIENT_ID : process.env.KLAVIYO_CLIENT_ID)!;
 const state = makeState();
 // Klaviyo requires PKCE; Mailchimp doesn't use it. Generated either way and simply unused for them.
 const { verifier, challenge } = makePkce();

 const res = NextResponse.redirect(authorizeUrl({ provider, clientId, baseUrl: BASE, state, challenge }));
 // Secure only over https. A Secure cookie is dropped on a plain-http dev server, and the seller
 // would come back from Mailchimp to "that took too long" with nothing explaining why.
 res.cookies.set(`vya_esp_${provider}`, JSON.stringify({ slug, state, verifier }), {
  httpOnly: true, secure: BASE.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 600,
 });
 return res;
}
