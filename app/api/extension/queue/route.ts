import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listAvailableItems } from "@/app/lib/db/inventory";
import { crossPostContent, platformByKey, getCrossListingsByPlatform } from "@/app/lib/cross-listing-db";
import { inferBrandFromTitle } from "@/app/lib/market-data-db";
import { normalizeColor } from "@/app/lib/colorNormalize";
import { MAX_ITEM_IMAGES } from "@/app/lib/item-limits";

export const dynamic = "force-dynamic";

// The VYA Cross-Lister browser extension calls this (with the seller's vyaplatform.com session
// cookie) to get their active listings, each pre-formatted for the target marketplace — title within
// its char limit, caption (+inline hashtags where the feed uses them), price, and image URLs — so
// the extension can fill the seller's own sell form. No marketplace API is involved; the extension
// automates the seller's logged-in session (the only way these sites allow). ?platform= picks the
// formatting (depop | poshmark | …); defaults to depop.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Log into vyaplatform.com first." }, { status: 401 });

 const requested = new URL(request.url).searchParams.get("platform") || "depop";
 const platform = platformByKey(requested) ? requested : "depop";

 const seller = await getSellerBySlug(slug);
 const [rawItems, alreadyListed] = await Promise.all([
 seller ? listAvailableItems(seller.id).catch(() => []) : Promise.resolve([]),
 getCrossListingsByPlatform(slug, platform).catch(() => []),
 ]);
 // Hide only items actually PUBLISHED on this marketplace (status 'listed'). A 'pending' marker
 // means a fill was started but not published — keep those in the queue so they can be retried.
 const listedIds = new Set(alreadyListed.filter((c) => c.status === "listed").map((c) => c.itemId));
 const items = rawItems.filter((it) => it.status !== "removed" && !listedIds.has(it.id)).map((it) => {
 const brand = it.brand || inferBrandFromTitle(it.title) || null;
 const c = crossPostContent(
 { title: it.title, brand, condition: it.condition, size: it.size, category: it.category, priceCents: it.priceCents, description: it.description },
 platform,
 );
 return {
 id: it.id,
 title: c.title,
 body: c.body, // caption (with inline #hashtags on hashtag-driven feeds) — the "description" field
 tags: c.tags,
 priceDollars: Math.round((it.priceCents || 0) / 100),
 size: it.size,
 category: it.category,
 brand, // for the marketplace brand picker
 condition: it.condition || null, // for the marketplace condition picker
 material: it.material || null, // Vestiaire material autocomplete
 color: normalizeColor(it.title), // dominant colour inferred from the title (e.g. "…Brown Suede" → brown)
 images: Array.isArray(it.images) ? it.images.slice(0, MAX_ITEM_IMAGES) : [],
 };
 });

 return NextResponse.json({ ok: true, store: slug, platform, count: items.length, items });
}
