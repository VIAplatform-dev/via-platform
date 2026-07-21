import { NextRequest, NextResponse } from "next/server";
import { ebayExchangeCode, ebaySignState, ensureEbayReady } from "@/app/lib/ebay";

export const dynamic = "force-dynamic";

// eBay redirects here after consent (the URL configured under the RuName). We verify the
// signed state, exchange the code for tokens, and bounce back to the Cross-listing tab.
export async function GET(request: NextRequest) {
 const sp = request.nextUrl.searchParams;
 const code = sp.get("code");
 const state = sp.get("state") || "";
 const back = new URL("/infrastructure/admin/cross-listing", request.url);

 const slug = state.split(".")[0];
 if (!code || !slug || ebaySignState(slug) !== state) {
 back.searchParams.set("ebay", "error");
 return NextResponse.redirect(back);
 }
 const ok = await ebayExchangeCode(slug, code).catch(() => false);
 // On a fresh connect, auto-opt into Business Policies + create default payment/shipping/return
 // policies so the seller can list immediately (best-effort — never fail the connect over it).
 if (ok) await ensureEbayReady(slug).catch(() => null);
 back.searchParams.set("ebay", ok ? "connected" : "error");
 return NextResponse.redirect(back);
}
