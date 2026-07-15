import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { markCrossListing, upsertCrossListingStats, platformByKey } from "@/app/lib/cross-listing-db";

export const dynamic = "force-dynamic";

// The extension reports back from the seller's own logged-in marketplace session — both after it
// lists an item (so the cross-listings board reflects reality and delist-on-sale knows where the
// item lives) AND when it reads engagement off the seller's own pages (likes, offers, views), which
// flow into the unified stats the dashboard rolls up. One item per call; either or both payloads.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = (await request.json().catch(() => null)) as {
 itemId?: string;
 platform?: string;
 status?: string;
 url?: string | null;
 stats?: { likes?: number; offers?: number; views?: number; watchers?: number };
 } | null;
 if (!body?.itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

 // Default to Depop (the first extension channel); accept any known marketplace key.
 const platform = body.platform && platformByKey(body.platform) ? body.platform : "depop";

 // Listing status (optional — only when this report is about a list/publish).
 if (body.status) {
 const status = body.status === "listed" ? "listed" : body.status === "pending" ? "pending" : "error";
 await markCrossListing(slug, body.itemId, platform, status, body.url ?? null);
 }

 // Engagement (optional — only when this report carries scraped stats).
 if (body.stats && typeof body.stats === "object") {
 await upsertCrossListingStats(slug, body.itemId, platform, body.stats);
 }

 return NextResponse.json({ ok: true });
}
