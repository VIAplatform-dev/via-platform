import { NextResponse } from "next/server";
import { listEbayConnectedStores } from "@/app/lib/ebay-tokens-db";
import { getEbayListingViews, ebayConfigured } from "@/app/lib/ebay";
import { getCrossListingsByPlatform, upsertCrossListingStats } from "@/app/lib/cross-listing-db";

// eBay engagement sync — pulls each connected store's live eBay listings' item-page views from the
// Sell Analytics traffic report and folds them into the unified cross_listing_stats, so the
// cross-listing board's roll-up shows real eBay views alongside the extension-scraped channels.
// Views are the metric the modern OAuth Sell API exposes cleanly; watch counts / Best Offers would
// need the legacy Trading API and aren't pulled here. Best-effort + idempotent (an upsert per item).
export const maxDuration = 300;

// The eBay listing id lives in the stored listing URL: https://www.ebay.com/itm/<id>.
function listingIdFromUrl(url: string | null): string | null {
 if (!url) return null;
 const m = url.match(/\/itm\/(\d{6,})/);
 return m ? m[1] : null;
}

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 if (!ebayConfigured()) return NextResponse.json({ ok: true, skipped: "ebay not configured" });

 const stores = await listEbayConnectedStores();
 let updated = 0;
 for (const slug of stores) {
 const listings = await getCrossListingsByPlatform(slug, "ebay").catch(() => []);
 // Map each eBay listing id back to our item id.
 const byListing = new Map<string, string>();
 for (const l of listings) {
 const id = listingIdFromUrl(l.externalUrl);
 if (id) byListing.set(id, l.itemId);
 }
 if (!byListing.size) continue;

 const views = await getEbayListingViews(slug, [...byListing.keys()]).catch(() => ({}));
 for (const [listingId, count] of Object.entries(views)) {
 const itemId = byListing.get(listingId);
 if (!itemId) continue;
 await upsertCrossListingStats(slug, itemId, "ebay", { views: count }).catch(() => {});
 updated++;
 }
 }
 return NextResponse.json({ ok: true, stores: stores.length, updated });
}
