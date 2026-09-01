import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { ebayAuthUrl, ebayConfigured, ebaySignState } from "@/app/lib/ebay";
import { getShippingSettings } from "@/app/lib/store-shipping-db";

export const dynamic = "force-dynamic";

// GET — kick off the eBay account connection (redirect to eBay's consent screen).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!ebayConfigured()) return NextResponse.json({ error: "eBay isn’t configured on the server yet (missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_RU_NAME)." }, { status: 503 });

 // eBay needs somewhere a listing ships FROM before it will publish anything, and a store with no
 // address gets one invented for it — which used to mean a New York warehouse for a London seller.
 // Ask for it here rather than sending her through consent and failing at the first listing. This
 // is the ONLY part of store setup eBay needs: no payments, no plan, no storefront.
 const shipping = await getShippingSettings(slug).catch(() => null);
 const f = shipping?.shipFrom;
 if (!f?.city || !f?.country) {
  const back = new URL("/admin/settings/locations", request.url);
  back.searchParams.set("need", "ebay");
  return NextResponse.redirect(back);
 }

 return NextResponse.redirect(ebayAuthUrl(ebaySignState(slug)));
}
