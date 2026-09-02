import { NextResponse } from "next/server";
import { listEbayConnectedStores } from "@/app/lib/ebay-tokens-db";
import { getRecentEbaySoldSkus, ebayConfigured } from "@/app/lib/ebay";
import { getItem, markSold } from "@/app/lib/db/inventory";
import { delistEverywhere } from "@/app/lib/cross-listing-db";
import { creditConsignedSale } from "@/app/lib/consignment-db";

// eBay sale-sync — the missing half of "sold anywhere → pull everywhere". Polls each connected
// store's recent eBay orders; when a piece sold on eBay (SKU = our itemId), marks it sold on VYA
// and delists it elsewhere so it can't double-sell, and credits the consignor if it was consigned.
// Idempotent: a piece already sold on VYA is skipped, so re-seeing the same eBay order is a no-op.
export const maxDuration = 300;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 if (!ebayConfigured()) return NextResponse.json({ ok: true, skipped: "ebay not configured" });

 // Look back 6h so nothing slips between hourly runs; re-seen sales are no-ops (item already sold).
 const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
 const stores = await listEbayConnectedStores();
 let checked = 0;
 let pulled = 0;
 for (const slug of stores) {
 const sold = await getRecentEbaySoldSkus(slug, since).catch(() => []);
 for (const s of sold) {
 checked++;
 const item = await getItem(s.sku).catch(() => null);
 if (!item || item.status === "sold") continue;
 await markSold(s.sku).catch(() => {});
 await delistEverywhere(s.sku, "ebay").catch(() => {});
 // Consigned? Credit the consignor their split (payout stays manual — eBay paid the store,
 // not VYA, so there's no routed balance to auto-transfer from).
 await creditConsignedSale({ productId: s.sku, orderId: `ebay-${s.orderId}`, soldPriceCents: s.soldPriceCents, channel: "ebay" }).catch(() => {});
 pulled++;
 }
 }
 return NextResponse.json({ ok: true, stores: stores.length, checked, pulled });
}
