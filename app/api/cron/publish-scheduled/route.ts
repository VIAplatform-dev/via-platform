import { NextResponse } from "next/server";
import { publishDueScheduledItems, getCrossListChannels } from "@/app/lib/db/inventory";
import { getSellerById } from "@/app/lib/db/sellers";
import { createCrossListingsForItem, syncItemToApiPlatforms } from "@/app/lib/cross-listing-db";
import { maybeAutoPostStory } from "@/app/lib/instagram-publish";
import { sendNewListingsDigest, type NewListingItem } from "@/app/lib/automation-engine";
import type { Item } from "@/app/lib/db/index";

export const dynamic = "force-dynamic";

// Publishes scheduled listings whose time has come: any draft with publish_at <= now flips to
// active. On flip it does exactly what a manual publish does — fan out to the seller's other
// channels (cross-listing, Instagram) and send ONE new-arrivals digest per store for the drop.
// Runs frequently (see vercel.json) so a scheduled time is honored within the cron interval.
export async function GET(request: Request) {
 if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
 if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const flipped = await publishDueScheduledItems(new Date()).catch(() => [] as Item[]);
 if (!flipped.length) return NextResponse.json({ ok: true, published: 0 });

 // Group by seller → resolve the slug once + send a single digest per store's drop.
 const bySeller = new Map<string, Item[]>();
 for (const it of flipped) {
  const arr = bySeller.get(it.sellerId) || [];
  arr.push(it);
  bySeller.set(it.sellerId, arr);
 }

 let published = 0;
 for (const [sellerId, its] of bySeller) {
  const seller = await getSellerById(sellerId).catch(() => null);
  if (!seller) continue;
  const slug = seller.slug;
  for (const it of its) {
   published++;
   // Honour the channels the seller picked when they scheduled it, not today's defaults.
   const channels = await getCrossListChannels(it.id).catch(() => null);
   createCrossListingsForItem(slug, it.id, channels).catch(() => {});
   syncItemToApiPlatforms(slug, it.id, channels).catch(() => {});
   maybeAutoPostStory(slug, it.id).catch(() => {});
  }
  const digestItems: NewListingItem[] = its.map((it) => ({
   id: it.id, title: it.title, image: it.images?.[0] ?? null, priceCents: it.priceCents, currency: it.currency,
  }));
  await sendNewListingsDigest(slug, digestItems).catch(() => {});
 }

 return NextResponse.json({ ok: true, published });
}
