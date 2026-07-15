import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getListingsByStore } from "@/app/lib/listings-db";
import { crossPostContent, platformByKey } from "@/app/lib/cross-listing-db";

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

 const listings = await getListingsByStore(slug, true).catch(() => []);
 const items = listings.map((l) => {
 const c = crossPostContent(
 { title: l.title, size: l.size, category: l.category, priceCents: Math.round(l.price * 100), description: l.description },
 platform,
 );
 return {
 id: l.id,
 title: c.title,
 body: c.body, // caption (with inline #hashtags on hashtag-driven feeds) — the "description" field
 tags: c.tags,
 priceDollars: Math.round(l.price),
 size: l.size,
 category: l.category,
 images: Array.isArray(l.images) ? l.images.slice(0, 8) : [],
 };
 });

 return NextResponse.json({ ok: true, store: slug, platform, count: items.length, items });
}
