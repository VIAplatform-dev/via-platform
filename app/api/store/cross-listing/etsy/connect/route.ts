import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { etsyAuthUrl, etsyConfigured, etsySignState, makePkce } from "@/app/lib/etsy";

export const dynamic = "force-dynamic";

// GET: start the Etsy connection (PKCE). We stash the code_verifier in an httpOnly cookie and
// send the seller to Etsy's consent screen; the callback reads the cookie to complete the exchange.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!etsyConfigured()) return NextResponse.json({ error: "Etsy isn’t configured on the server yet (missing ETSY_KEYSTRING / ETSY_REDIRECT_URI)." }, { status: 503 });

 const { verifier, challenge } = makePkce();
 const state = etsySignState(slug);
 const res = NextResponse.redirect(etsyAuthUrl(state, challenge));
 res.cookies.set("etsy_pkce", verifier, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
 return res;
}
