import { neon } from "@neondatabase/serverless";
import { getItem } from "./db/inventory";
import { listOnEbay, endOnEbay, ebayConnected, type EbayResult } from "./ebay";
import { listOnDepop, endOnDepop, depopConnected, type DepopResult } from "./depop";
import { listOnEtsy, endOnEtsy, etsyConnected, type EtsyResult } from "./etsy";

// Cross-listing: a seller publishes to VYA, and we fan the item out to their other
// marketplaces; when it sells ANYWHERE, we pull it from everywhere (no double-sell).
//
// Reality check baked into the design: Depop/Poshmark/Grailed have NO public listing
// API, so we can't literally auto-post or auto-remove there — we generate paste-ready
// content and track status, and tell the seller exactly where to pull a sold item.
// eBay/Etsy DO have APIs (hasApi), so real auto-post/remove can plug in there later.

export type Platform = { key: string; name: string; hasApi: boolean; live?: boolean; titleMax: number; profileUrl: (handle: string) => string };

export const PLATFORMS: Platform[] = [
 // eBay is the one live API integration (auto-posts + auto-removes). The rest are "copy" channels:
 // VYA writes each a title within its char limit + tags, and the seller pastes it.
 { key: "ebay", name: "eBay", hasApi: true, live: true, titleMax: 80, profileUrl: (h) => `https://www.ebay.com/usr/${h}` },
 { key: "depop", name: "Depop", hasApi: false, live: true, titleMax: 65, profileUrl: (h) => `https://www.depop.com/${h}` },
 { key: "poshmark", name: "Poshmark", hasApi: false, live: true, titleMax: 80, profileUrl: (h) => `https://poshmark.com/closet/${h}` },
 { key: "etsy", name: "Etsy", hasApi: true, live: true, titleMax: 140, profileUrl: (h) => `https://www.etsy.com/shop/${h}` },
 { key: "vestiaire", name: "Vestiaire Collective", hasApi: false, live: true, titleMax: 50, profileUrl: (h) => `https://www.vestiairecollective.com/profile/${h}/` },
 { key: "vinted", name: "Vinted", hasApi: false, live: true, titleMax: 100, profileUrl: (h) => `https://www.vinted.com/member/${h}` },
 { key: "mercari", name: "Mercari", hasApi: false, live: true, titleMax: 80, profileUrl: (h) => `https://www.mercari.com/u/${h}/` },
 { key: "grailed", name: "Grailed", hasApi: false, live: true, titleMax: 60, profileUrl: (h) => `https://www.grailed.com/${h}` },
 { key: "instagram", name: "Instagram", hasApi: false, live: true, titleMax: 125, profileUrl: (h) => `https://www.instagram.com/${h}/` },
 { key: "facebook", name: "Facebook Marketplace", hasApi: false, live: true, titleMax: 100, profileUrl: (h) => `https://www.facebook.com/${h}` },
];
export const platformByKey = (k: string) => PLATFORMS.find((p) => p.key === k) || null;

export type ItemForPost = { title: string; brand?: string | null; condition?: string | null; size?: string | null; category?: string | null; priceCents: number; description?: string | null };

// Paste-ready listing content tuned to a platform (title within its char limit, tags,
// and — for Depop — inline hashtags). Template-based, no AI cost.
export function crossPostContent(item: ItemForPost, platformKey: string): { title: string; body: string; tags: string[]; price: string } {
 const max = platformByKey(platformKey)?.titleMax || 80;
 const brand = (item.brand || "").trim();
 const base = [brand, item.title].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
 const title = base.length > max ? base.slice(0, max - 1).trimEnd() + "…" : base;
 const bits = [brand, item.category, item.size ? `Size ${item.size}` : "", item.condition ? `${item.condition} condition` : ""].filter(Boolean);
 const tags = Array.from(new Set([brand, item.category || "", item.size ? `size ${item.size}` : "", "vintage"].filter(Boolean).map((t) => String(t).toLowerCase().replace(/\s+/g, ""))));
 const desc = (item.description || "").trim() || `${bits.join(" · ")}. One-of-one — grab it before it's gone.`;
 // Hashtag-driven feeds (Depop, Instagram) get inline tags appended to the caption.
 const hashtagPlatforms = new Set(["depop", "instagram"]);
 const body = hashtagPlatforms.has(platformKey)
 ? `${desc}\n\n${tags.slice(0, platformKey === "instagram" ? 10 : 5).map((t) => `#${t}`).join(" ")}`
 : desc;
 return { title, body, tags, price: `$${Math.round(item.priceCents / 100)}` };
}

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTables() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_platform_accounts (
  id SERIAL PRIMARY KEY, store_slug TEXT NOT NULL, platform TEXT NOT NULL, handle TEXT NOT NULL,
  auto_list BOOLEAN NOT NULL DEFAULT true, connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_slug, platform)
 )`;
 await sql`CREATE TABLE IF NOT EXISTS cross_listings (
  id SERIAL PRIMARY KEY, store_slug TEXT NOT NULL, item_id TEXT NOT NULL, platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', external_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_slug, item_id, platform)
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_cross_listings_item ON cross_listings (item_id)`;
 // Engagement per (item, platform): likes/offers/views/watchers, fed by the extension (no-API
 // channels), the eBay/Etsy APIs, and VYA-native events — the single source the dashboard rolls up.
 await sql`CREATE TABLE IF NOT EXISTS cross_listing_stats (
  id SERIAL PRIMARY KEY, store_slug TEXT NOT NULL, item_id TEXT NOT NULL, platform TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0, offers INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0, watchers INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_slug, item_id, platform)
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_cross_listing_stats_store ON cross_listing_stats (store_slug)`;
 // One row per sale, tagged with the marketplace it sold on — powers per-channel revenue on the
 // cross-listing dashboard. Written when a piece is marked sold (going forward; no backfill).
 await sql`CREATE TABLE IF NOT EXISTS cross_listing_sales (
  id SERIAL PRIMARY KEY, store_slug TEXT NOT NULL, item_id TEXT NOT NULL, platform TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0, sold_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_cross_listing_sales_store ON cross_listing_sales (store_slug)`;
 ensured = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PlatformAccount = { platform: string; handle: string; autoList: boolean };

export async function getPlatformAccounts(storeSlug: string): Promise<PlatformAccount[]> {
 await ensureTables();
 const rows = (await db()`SELECT platform, handle, auto_list FROM store_platform_accounts WHERE store_slug = ${storeSlug} ORDER BY platform`.catch(() => [])) as any[];
 return rows.map((r) => ({ platform: r.platform, handle: r.handle, autoList: r.auto_list === true }));
}

export async function upsertPlatformAccount(storeSlug: string, platform: string, handle: string, autoList: boolean): Promise<void> {
 if (!platformByKey(platform)) return;
 await ensureTables();
 const h = handle.trim().replace(/^@/, "").slice(0, 120);
 await db()`
  INSERT INTO store_platform_accounts (store_slug, platform, handle, auto_list)
  VALUES (${storeSlug}, ${platform}, ${h}, ${autoList})
  ON CONFLICT (store_slug, platform) DO UPDATE SET handle = EXCLUDED.handle, auto_list = EXCLUDED.auto_list
 `.catch(() => {});
}

export async function removePlatformAccount(storeSlug: string, platform: string): Promise<void> {
 await ensureTables();
 await db()`DELETE FROM store_platform_accounts WHERE store_slug = ${storeSlug} AND platform = ${platform}`.catch(() => {});
}

/** On publish to VYA: queue a cross-listing for every connected, auto-list platform. */
export async function createCrossListingsForItem(storeSlug: string, itemId: string): Promise<number> {
 await ensureTables();
 const accounts = (await getPlatformAccounts(storeSlug)).filter((a) => a.autoList);
 if (!accounts.length) return 0;
 const sql = db();
 let n = 0;
 for (const a of accounts) {
 await sql`INSERT INTO cross_listings (store_slug, item_id, platform, status) VALUES (${storeSlug}, ${itemId}, ${a.platform}, 'pending') ON CONFLICT (store_slug, item_id, platform) DO NOTHING`.catch(() => {});
 n++;
 }
 return n;
}

// Actually POST to the platforms that have a real API (eBay + Depop). Best-effort +
// background: on success we store the live listing URL, on failure the error message.
export async function syncItemToApiPlatforms(storeSlug: string, itemId: string): Promise<void> {
 const [ebayOn, depopOn, etsyOn] = await Promise.all([
 ebayConnected(storeSlug).catch(() => false),
 depopConnected(storeSlug).catch(() => false),
 etsyConnected(storeSlug).catch(() => false),
 ]);
 if (!ebayOn && !depopOn && !etsyOn) return;
 const item = await getItem(itemId).catch(() => null);
 if (!item) return;

 if (etsyOn) {
 await markCrossListing(storeSlug, itemId, "etsy", "pending");
 const r = await listOnEtsy(storeSlug, {
 itemId, title: item.title, description: item.description ?? item.title,
 priceUsd: (item.priceCents || 0) / 100, imageUrls: item.images || [],
 }).catch((): EtsyResult => ({ ok: false, error: "Etsy push failed." }));
 await markCrossListing(storeSlug, itemId, "etsy", r.ok ? "listed" : "error", r.ok ? (r.listingUrl ?? null) : (r.error ?? "error"));
 }

 if (ebayOn) {
 await markCrossListing(storeSlug, itemId, "ebay", "pending");
 const r = await listOnEbay(storeSlug, {
 itemId, title: item.title, description: item.description ?? null, brand: item.brand,
 condition: item.condition, size: item.size, priceCents: item.priceCents, currency: item.currency || "USD",
 images: item.images || [],
 }).catch((): EbayResult => ({ ok: false, error: "eBay push failed." }));
 await markCrossListing(storeSlug, itemId, "ebay", r.ok ? "listed" : "error", r.ok ? (r.listingUrl ?? null) : (r.error ?? "error"));
 }

 if (depopOn) {
 await markCrossListing(storeSlug, itemId, "depop", "pending");
 const r = await listOnDepop(storeSlug, {
 itemId, title: item.title, description: item.description ?? null, brand: item.brand,
 condition: item.condition, size: item.size, category: item.category, colour: null,
 priceCents: item.priceCents, currency: item.currency || "USD", images: item.images || [],
 }).catch((): DepopResult => ({ ok: false, error: "Depop push failed." }));
 await markCrossListing(storeSlug, itemId, "depop", r.ok ? "listed" : "error", r.ok ? (r.listingUrl ?? null) : (r.error ?? "error"));
 }
}

export type CrossListing = { itemId: string; platform: string; status: string; externalUrl: string | null };

export async function getCrossListingsForItem(storeSlug: string, itemId: string): Promise<CrossListing[]> {
 await ensureTables();
 const rows = (await db()`SELECT item_id, platform, status, external_url FROM cross_listings WHERE store_slug = ${storeSlug} AND item_id = ${itemId}`.catch(() => [])) as any[];
 return rows.map((r) => ({ itemId: r.item_id, platform: r.platform, status: r.status, externalUrl: r.external_url ?? null }));
}

/** All of a store's live cross-listings on one platform (for the per-platform stat pulls). */
export async function getCrossListingsByPlatform(storeSlug: string, platform: string): Promise<CrossListing[]> {
 await ensureTables();
 const rows = (await db()`SELECT item_id, platform, status, external_url FROM cross_listings WHERE store_slug = ${storeSlug} AND platform = ${platform} AND status IN ('listed', 'pending')`.catch(() => [])) as any[];
 return rows.map((r) => ({ itemId: r.item_id, platform: r.platform, status: r.status, externalUrl: r.external_url ?? null }));
}

// Recent failed cross-listings with the stored reason (on error, external_url holds the message).
// The board only shows a per-platform status, so this is how you see WHY something failed.
export async function getCrossListingErrors(storeSlug: string, platform?: string): Promise<{ itemId: string; title: string; platform: string; status: string; error: string | null; updatedAt: string }[]> {
 await ensureTables();
 const rows = (await db()`
  SELECT c.item_id, c.platform, c.status, c.external_url, c.updated_at, i.title
  FROM cross_listings c LEFT JOIN items i ON i.id::text = c.item_id
  WHERE c.store_slug = ${storeSlug} AND c.status = 'error'
  ORDER BY c.updated_at DESC LIMIT 50
 `.catch(() => [])) as any[];
 return rows
  .filter((r) => !platform || r.platform === platform)
  .slice(0, 25)
  .map((r) => ({ itemId: r.item_id, title: r.title ?? "(unknown item)", platform: r.platform, status: r.status, error: r.external_url ?? null, updatedAt: r.updated_at }));
}

export async function markCrossListing(storeSlug: string, itemId: string, platform: string, status: string, externalUrl?: string | null): Promise<void> {
 await ensureTables();
 await db()`
  INSERT INTO cross_listings (store_slug, item_id, platform, status, external_url, updated_at)
  VALUES (${storeSlug}, ${itemId}, ${platform}, ${status}, ${externalUrl ?? null}, now())
  ON CONFLICT (store_slug, item_id, platform) DO UPDATE SET status = EXCLUDED.status, external_url = COALESCE(EXCLUDED.external_url, cross_listings.external_url), updated_at = now()
 `.catch(() => {});
}

// ── engagement stats (likes / offers / views / watchers) per item × platform ──
export type PlatformStats = { likes: number; offers: number; views: number; watchers: number };
export type StatsInput = { likes?: number; offers?: number; views?: number; watchers?: number };
const ZERO_STATS = (): PlatformStats => ({ likes: 0, offers: 0, views: 0, watchers: 0 });

/**
 * Record engagement for one item on one platform. Only the provided fields are written; omitted
 * fields keep their prior value (so a channel that only knows likes doesn't zero out views). Called
 * by the extension report endpoint (no-API channels) and the API/cron pulls (eBay/Etsy).
 */
export async function upsertCrossListingStats(storeSlug: string, itemId: string, platform: string, stats: StatsInput): Promise<void> {
 if (platform !== "vya" && !platformByKey(platform)) return;
 await ensureTables();
 const clean = (n: number | undefined): number | null => (n == null || !Number.isFinite(Number(n)) ? null : Math.max(0, Math.min(10_000_000, Math.round(Number(n)))));
 const likes = clean(stats.likes), offers = clean(stats.offers), views = clean(stats.views), watchers = clean(stats.watchers);
 if (likes == null && offers == null && views == null && watchers == null) return;
 await db()`
  INSERT INTO cross_listing_stats (store_slug, item_id, platform, likes, offers, views, watchers, updated_at)
  VALUES (${storeSlug}, ${itemId}, ${platform}, ${likes ?? 0}, ${offers ?? 0}, ${views ?? 0}, ${watchers ?? 0}, now())
  ON CONFLICT (store_slug, item_id, platform) DO UPDATE SET
   likes = COALESCE(${likes}, cross_listing_stats.likes),
   offers = COALESCE(${offers}, cross_listing_stats.offers),
   views = COALESCE(${views}, cross_listing_stats.views),
   watchers = COALESCE(${watchers}, cross_listing_stats.watchers),
   updated_at = now()
 `.catch(() => {});
}

/**
 * The item sold (on `soldPlatform`, or 'vya'). Flip its cross-listings: the platform it
 * sold on → 'sold', every other → 'removed' (needs pulling). Returns the still-live
 * platforms the seller must remove it from, with API vs manual noted.
 */
export async function delistEverywhere(itemId: string, soldPlatform: string): Promise<{ platform: string; name: string; handle: string | null; hasApi: boolean }[]> {
 await ensureTables();
 const sql = db();
 const rows = (await sql`SELECT store_slug, platform, status, external_url FROM cross_listings WHERE item_id = ${itemId}`.catch(() => [])) as any[];
 if (!rows.length) return [];
 const storeSlug = rows[0].store_slug as string;
 const accounts = await getPlatformAccounts(storeSlug);
 const toPull: { platform: string; name: string; handle: string | null; hasApi: boolean }[] = [];
 for (const r of rows) {
 const isSoldHere = r.platform === soldPlatform;
 const next = isSoldHere ? "sold" : "removed";
 await sql`UPDATE cross_listings SET status = ${next}, updated_at = now() WHERE item_id = ${itemId} AND platform = ${r.platform}`.catch(() => {});
 // eBay has an API — actually end the live listing (unless eBay is where it sold).
 if (!isSoldHere && r.platform === "ebay") endOnEbay(storeSlug, itemId).catch(() => {});
 if (!isSoldHere && r.platform === "depop") endOnDepop(storeSlug, itemId).catch(() => {});
 // Etsy has an API — deactivate the live listing (its id lives in the stored listing URL).
 if (!isSoldHere && r.platform === "etsy" && r.external_url) endOnEtsy(storeSlug, String(r.external_url)).catch(() => {});
 if (!isSoldHere && r.status !== "removed" && r.status !== "sold") {
 const p = platformByKey(r.platform);
 toPull.push({ platform: r.platform, name: p?.name || r.platform, handle: accounts.find((a) => a.platform === r.platform)?.handle || null, hasApi: !!p?.hasApi });
 }
 }
 return toPull;
}

export type BoardRow = { itemId: string; title: string; priceCents: number; image: string | null; status: string; listings: Record<string, string>; errors: Record<string, string>; stats: { totals: PlatformStats; byPlatform: Record<string, PlatformStats> } };

/** Every active/pending item with its per-platform cross-listing status + engagement, for the tab. */
export async function getCrossListBoard(storeSlug: string): Promise<BoardRow[]> {
 await ensureTables();
 const sql = db();
 const [rows, statRows, vyaOffers] = await Promise.all([
 sql`
  SELECT i.id::text AS item_id, i.title, i.price_cents, i.images, i.status,
   COALESCE(json_object_agg(c.platform, c.status) FILTER (WHERE c.platform IS NOT NULL), '{}') AS listings,
   COALESCE(json_object_agg(c.platform, c.external_url) FILTER (WHERE c.status = 'error' AND c.external_url IS NOT NULL), '{}') AS errors
  FROM items i JOIN sellers s ON s.id = i.seller_id
  LEFT JOIN cross_listings c ON c.item_id = i.id::text AND c.store_slug = ${storeSlug}
  WHERE s.slug = ${storeSlug} AND i.status IN ('active', 'reserved')
  GROUP BY i.id, i.title, i.price_cents, i.images, i.status
  ORDER BY i.created_at DESC LIMIT 200
 `.catch(() => []),
 sql`SELECT item_id, platform, likes, offers, views, watchers FROM cross_listing_stats WHERE store_slug = ${storeSlug}`.catch(() => []),
 // VYA-native pending offers per item (reliably keyed by item_id) → folded in as the 'vya' channel.
 sql`SELECT item_id, COUNT(*)::int AS offers FROM storefront_offers WHERE store_slug = ${storeSlug} AND status = 'pending' AND item_id IS NOT NULL GROUP BY item_id`.catch(() => []),
 ]) as [any[], any[], any[]];

 // Index stats by item → platform.
 const byItem = new Map<string, Record<string, PlatformStats>>();
 const put = (itemId: string, platform: string, s: StatsInput) => {
 const m = byItem.get(itemId) ?? {};
 const cur = m[platform] ?? ZERO_STATS();
 m[platform] = { likes: s.likes ?? cur.likes, offers: s.offers ?? cur.offers, views: s.views ?? cur.views, watchers: s.watchers ?? cur.watchers };
 byItem.set(itemId, m);
 };
 for (const r of statRows) put(String(r.item_id), String(r.platform), { likes: Number(r.likes) || 0, offers: Number(r.offers) || 0, views: Number(r.views) || 0, watchers: Number(r.watchers) || 0 });
 for (const r of vyaOffers) put(String(r.item_id), "vya", { offers: Number(r.offers) || 0 });

 return rows.map((r) => {
 const byPlatform = byItem.get(String(r.item_id)) ?? {};
 const totals = Object.values(byPlatform).reduce<PlatformStats>((t, s) => ({ likes: t.likes + s.likes, offers: t.offers + s.offers, views: t.views + s.views, watchers: t.watchers + s.watchers }), ZERO_STATS());
 return {
 itemId: r.item_id, title: String(r.title || "Item"), priceCents: Number(r.price_cents || 0),
 image: Array.isArray(r.images) ? (r.images[0] ?? null) : null, status: String(r.status),
 listings: (r.listings && typeof r.listings === "object") ? r.listings : {},
 errors: (r.errors && typeof r.errors === "object") ? r.errors : {},
 stats: { totals, byPlatform },
 };
 });
}

// ── per-marketplace sales + rollup (dashboard) ────────────────────────────────
/** Record a sale on a given marketplace at the item's current price (idempotency isn't needed —
 *  markSold is a deliberate one-shot action). Looks up the item price itself. */
export async function recordCrossListingSale(storeSlug: string, itemId: string, platform: string): Promise<void> {
 await ensureTables();
 const sql = db();
 const rows = (await sql`SELECT price_cents FROM items WHERE id::text = ${itemId}`.catch(() => [])) as any[];
 const priceCents = Number(rows[0]?.price_cents || 0);
 await sql`INSERT INTO cross_listing_sales (store_slug, item_id, platform, price_cents) VALUES (${storeSlug}, ${itemId}, ${platform}, ${priceCents})`.catch(() => {});
}

export type MarketplaceRollup = {
 platform: string; // channel key ('vya', 'ebay', 'depop', …)
 listed: number; queued: number; error: number; // live board state
 offers: number; likes: number; views: number; watchers: number; // engagement (extension/API/VYA-fed)
 sold: number; revenueCents: number; // realised sales on this channel (forward-looking)
};

/** One aggregate row per marketplace the store touches — the dashboard's summary. */
export async function getMarketplaceRollup(storeSlug: string): Promise<MarketplaceRollup[]> {
 await ensureTables();
 const sql = db();
 const [listRows, statRows, saleRows, vyaOffers] = (await Promise.all([
 sql`SELECT platform, status, COUNT(*)::int AS n FROM cross_listings WHERE store_slug = ${storeSlug} GROUP BY platform, status`.catch(() => []),
 sql`SELECT platform, COALESCE(SUM(likes),0)::int AS likes, COALESCE(SUM(offers),0)::int AS offers, COALESCE(SUM(views),0)::int AS views, COALESCE(SUM(watchers),0)::int AS watchers FROM cross_listing_stats WHERE store_slug = ${storeSlug} GROUP BY platform`.catch(() => []),
 sql`SELECT platform, COUNT(*)::int AS sold, COALESCE(SUM(price_cents),0)::int AS revenue FROM cross_listing_sales WHERE store_slug = ${storeSlug} GROUP BY platform`.catch(() => []),
 sql`SELECT COUNT(*)::int AS offers FROM storefront_offers WHERE store_slug = ${storeSlug} AND status = 'pending' AND item_id IS NOT NULL`.catch(() => []),
 ])) as [any[], any[], any[], any[]];

 const map = new Map<string, MarketplaceRollup>();
 const row = (k: string) => {
 let r = map.get(k);
 if (!r) { r = { platform: k, listed: 0, queued: 0, error: 0, offers: 0, likes: 0, views: 0, watchers: 0, sold: 0, revenueCents: 0 }; map.set(k, r); }
 return r;
 };
 for (const r of listRows) {
 const t = row(String(r.platform));
 if (r.status === "listed") t.listed += Number(r.n) || 0;
 else if (r.status === "pending") t.queued += Number(r.n) || 0;
 else if (r.status === "error") t.error += Number(r.n) || 0;
 }
 for (const r of statRows) { const t = row(String(r.platform)); t.likes += Number(r.likes) || 0; t.offers += Number(r.offers) || 0; t.views += Number(r.views) || 0; t.watchers += Number(r.watchers) || 0; }
 for (const r of saleRows) { const t = row(String(r.platform)); t.sold += Number(r.sold) || 0; t.revenueCents += Number(r.revenue) || 0; }
 // VYA-native pending offers → the 'vya' channel (kept consistent with the board).
 const vo = Number(vyaOffers[0]?.offers || 0);
 if (vo > 0) row("vya").offers += vo;
 return [...map.values()];
}
