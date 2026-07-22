import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { getCrossListingErrors } from "@/app/lib/cross-listing-db";

export const dynamic = "force-dynamic";

// Why did a cross-listing fail? The board only shows a status; on failure the actual error message
// is stored in cross_listings.external_url. This surfaces the recent failures + their reason.
// GET ?store=<slug>&platform=<ebay|etsy|depop> (platform optional)
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const url = new URL(request.url);
 const slug = url.searchParams.get("store");
 const platform = url.searchParams.get("platform") || undefined;
 if (!slug) return NextResponse.json({ error: "store slug required (?store=<slug>)" }, { status: 400 });
 try {
 return NextResponse.json({ store: slug, errors: await getCrossListingErrors(slug, platform) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
