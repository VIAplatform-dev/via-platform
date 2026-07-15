import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getCrossListingsByPlatform, getPlatformAccounts, PLATFORMS } from "@/app/lib/cross-listing-db";

export const dynamic = "force-dynamic";

// The extension calls this (with the seller's vyaplatform.com session) to learn which marketplace
// URLs map to which VYA items, plus the seller's handle per platform. A content script on a
// marketplace page uses this to attribute a scraped like/offer count back to the right VYA item,
// and to know the seller's own shop URL to scan. Only the no-API channels (eBay/Etsy come via their
// APIs) with a captured listing URL are returned.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Log into vyaplatform.com first." }, { status: 401 });

 const noApi = PLATFORMS.filter((p) => p.live && !p.hasApi).map((p) => p.key);
 const [accounts, ...perPlatform] = await Promise.all([
 getPlatformAccounts(slug),
 ...noApi.map((k) => getCrossListingsByPlatform(slug, k)),
 ]);

 const listings: { itemId: string; platform: string; url: string }[] = [];
 perPlatform.forEach((rows, i) => {
 const platform = noApi[i];
 for (const l of rows) if (l.externalUrl) listings.push({ itemId: l.itemId, platform, url: l.externalUrl });
 });

 const handles: Record<string, string> = {};
 for (const a of accounts) handles[a.platform] = a.handle;

 return NextResponse.json({ ok: true, listings, handles });
}
