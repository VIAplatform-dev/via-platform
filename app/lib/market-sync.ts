import { listEbayConnectedStores } from "./ebay-tokens-db";
import { getRecentEbaySoldSkus, ebayConfigured } from "./ebay";
import { listDepopConnectedStores } from "./depop-tokens-db";
import { getRecentDepopSoldSkus, depopConfigured } from "./depop";
import { getItem, markSold } from "./db/inventory";
import { delistEverywhere, getCrossListingsForItem, type CrossListing } from "./cross-listing-db";
import { creditConsignedSale } from "./consignment-db";
import { pushSellerSale } from "./seller-push";

// "Sold anywhere → pulled everywhere", as one function instead of two crons.
//
// THE DOUBLE-SELL WINDOW. Marketplace sales reach VYA by polling — eBay on the hour, Depop at
// twenty past. A piece sold on eBay at 10:02 is still live on her storefront until 11:00, and a
// buyer in VYA checkout in between holds a reservation that eBay knows nothing about. One-of-one
// means that is a refund, an apology and a review; it is the failure a vintage seller never
// forgives a tool for.
//
// The crons keep running on their schedule. What this module adds is the same sync, callable ON
// DEMAND for one store at the moment it matters — inside checkout, before the charge, for any
// piece that is live on a marketplace with a sale feed. A piece that is only on VYA costs nothing:
// no marketplace call, no delay.

import { FEEDS, platformsToCheck, type Feed } from "./market-sync-core";
export { platformsToCheck };

export type SyncResult = { checked: number; pulled: string[]; notes: string[] };

/**
 * Pull one store's recent marketplace sales into VYA: mark each sold piece sold, delist it
 * elsewhere, credit the consignor if it was consigned. Idempotent — a piece already sold on
 * VYA is skipped, so re-seeing the same sale is a no-op.
 *
 * `only` narrows to the feeds that matter (a checkout asks about the feeds the bag is live on);
 * the crons pass nothing and get both.
 */
export async function syncMarketplaceSalesForStore(slug: string, sinceISO: string, only?: Feed[]): Promise<SyncResult> {
 const feeds = only ?? [...FEEDS];
 const result: SyncResult = { checked: 0, pulled: [], notes: [] };

 const sold: Array<{ sku: string; soldPriceCents: number; orderId: string; channel: Feed }> = [];
 if (feeds.includes("ebay") && ebayConfigured()) {
  const r = await getRecentEbaySoldSkus(slug, sinceISO).catch(() => []);
  for (const s of r) sold.push({ ...s, channel: "ebay" });
 }
 if (feeds.includes("depop") && depopConfigured()) {
  const r = await getRecentDepopSoldSkus(slug, sinceISO).catch(() => ({ sales: [], status: "error" as const, detail: "threw" }));
  if (r.status !== "ok" && r.detail) result.notes.push(r.detail);
  for (const s of r.sales) sold.push({ sku: s.sku, soldPriceCents: s.soldPriceCents, orderId: s.orderId, channel: "depop" });
 }

 for (const s of sold) {
  result.checked++;
  const item = await getItem(s.sku).catch(() => null);
  if (!item || item.status === "sold") continue;
  await markSold(s.sku).catch(() => {});
  await delistEverywhere(s.sku, s.channel).catch(() => {});
  // Consigned? Credit the consignor their split. Payout stays manual — the marketplace paid the
  // store, not VYA, so there is no routed balance to auto-transfer from.
  await creditConsignedSale({ productId: s.sku, orderId: `${s.channel}-${s.orderId}`, soldPriceCents: s.soldPriceCents, channel: s.channel }).catch(() => {});
  // Her phone: a sale she did not see happen, because it happened on eBay or Depop. Fire-and-forget,
  // gated by her preferences inside. (A Market Mode sale or a manual "mark sold" never pushes — she
  // was there for those; see seller-push.ts.)
  void pushSellerSale(slug, { itemTitle: item.title, amountCents: s.soldPriceCents, currency: item.currency, channel: s.channel, orderId: `${s.channel}-${s.orderId}` });
  result.pulled.push(s.sku);
 }
 return result;
}

/** The crons' loop, shared so their behaviour cannot drift apart. */
export async function syncAllStores(feed: Feed, sinceISO: string): Promise<{ stores: number } & SyncResult> {
 const stores = feed === "ebay" ? await listEbayConnectedStores() : await listDepopConnectedStores();
 const total: SyncResult = { checked: 0, pulled: [], notes: [] };
 for (const slug of stores) {
  const r = await syncMarketplaceSalesForStore(slug, sinceISO, [feed]);
  total.checked += r.checked;
  total.pulled.push(...r.pulled);
  for (const n of r.notes) if (!total.notes.includes(n)) total.notes.push(n);
 }
 return { stores: stores.length, ...total };
}

/**
 * Called by checkout, before anything is charged. For every piece in the bag that is live on a
 * marketplace with a sale feed, pull that store's sales from the last day and return the ids
 * that turn out to be already sold — so checkout can refuse them instead of double-selling.
 *
 * Returns an empty array in the common case (nothing cross-listed) without touching the network.
 * On any marketplace error it also returns empty: a flaky feed must not block a legitimate sale,
 * and the hourly cron remains the backstop.
 */
export async function settleCrossListedBeforeCharge(storeSlug: string, itemIds: string[]): Promise<string[]> {
 try {
  const listings = (await Promise.all(itemIds.map((id) => getCrossListingsForItem(storeSlug, id).catch(() => [] as CrossListing[])))).flat();
  const feeds = platformsToCheck(listings);
  if (!feeds.length) return [];

  // A day, not the cron's six hours: this runs on demand, and a sale that slipped past a failed
  // hourly run yesterday is exactly the one we are here to catch.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await syncMarketplaceSalesForStore(storeSlug, since, feeds);

  const now = await Promise.all(itemIds.map((id) => getItem(id).catch(() => null)));
  return itemIds.filter((id, i) => now[i]?.status === "sold");
 } catch {
  return [];
 }
}
