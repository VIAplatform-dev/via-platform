import { neon } from "@neondatabase/serverless";

// Per-STORE shopper behavior: favorites + product views on a store's OWN storefront
// (not the VYA marketplace). A shopper is identified by a `via_shopper` cookie; if they
// check out, their email can be associated so favorites follow them.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
/** Exported so the analytics read-model views can guarantee their base tables exist. */
export async function ensureStoreEngagementTables() {
 return ensureTables();
}
async function ensureTables() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_favorites (
  id SERIAL PRIMARY KEY, store_slug TEXT NOT NULL, item_id TEXT NOT NULL, shopper_id TEXT NOT NULL,
  email TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_slug, item_id, shopper_id)
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_favorites_store ON store_favorites (store_slug, created_at DESC)`;
 await sql`CREATE TABLE IF NOT EXISTS store_product_views (
  id SERIAL PRIMARY KEY, store_slug TEXT NOT NULL, item_id TEXT NOT NULL, shopper_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_views_store ON store_product_views (store_slug, created_at DESC)`;
 await sql`CREATE TABLE IF NOT EXISTS store_searches (
  id SERIAL PRIMARY KEY, store_slug TEXT NOT NULL, query TEXT NOT NULL, shopper_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_searches_store ON store_searches (store_slug, created_at DESC)`;
 ensured = true;
}

export async function recordSearch(storeSlug: string, query: string, shopperId: string | null = null): Promise<void> {
 const q = query.trim().slice(0, 120);
 if (!q) return;
 await ensureTables();
 await db()`INSERT INTO store_searches (store_slug, query, shopper_id) VALUES (${storeSlug}, ${q}, ${shopperId})`.catch(() => {});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getTopSearches(storeSlug: string, sinceISO: string, limit = 8): Promise<{ query: string; count: number }[]> {
 await ensureTables();
 const rows = (await db()`
  SELECT lower(query) AS query, COUNT(*)::int AS n
  FROM store_searches WHERE store_slug = ${storeSlug} AND created_at >= ${sinceISO}
  GROUP BY lower(query) ORDER BY n DESC LIMIT ${limit}
 `.catch(() => [])) as any[];
 return rows.map((r) => ({ query: String(r.query), count: Number(r.n) }));
}

export type ShopperFavorite = { itemId: string; title: string; priceCents: number; image: string | null; status: string };

/** A shopper's saved items on a store (newest first), with details for the storefront page. */
export async function getShopperFavorites(storeSlug: string, shopperId: string): Promise<ShopperFavorite[]> {
 await ensureTables();
 const rows = (await db()`
  SELECT f.item_id, i.title, i.price_cents, i.images, i.status
  FROM store_favorites f JOIN items i ON i.id::text = f.item_id
  WHERE f.store_slug = ${storeSlug} AND f.shopper_id = ${shopperId}
  ORDER BY f.created_at DESC LIMIT 60
 `.catch(() => [])) as any[];
 return rows.map((r) => ({ itemId: r.item_id, title: String(r.title || "Item"), priceCents: Number(r.price_cents || 0), image: Array.isArray(r.images) ? (r.images[0] ?? null) : null, status: String(r.status || "active") }));
}

export async function recordProductView(storeSlug: string, itemId: string, shopperId: string | null): Promise<void> {
 if (!itemId) return;
 await ensureTables();
 await db()`INSERT INTO store_product_views (store_slug, item_id, shopper_id) VALUES (${storeSlug}, ${itemId}, ${shopperId})`.catch(() => {});
}

export async function isFavorited(storeSlug: string, itemId: string, shopperId: string): Promise<boolean> {
 await ensureTables();
 const rows = (await db()`SELECT 1 FROM store_favorites WHERE store_slug = ${storeSlug} AND item_id = ${itemId} AND shopper_id = ${shopperId} LIMIT 1`.catch(() => [])) as unknown[];
 return rows.length > 0;
}

export async function favoriteCount(storeSlug: string, itemId: string): Promise<number> {
 await ensureTables();
 const rows = (await db()`SELECT COUNT(*)::int AS n FROM store_favorites WHERE store_slug = ${storeSlug} AND item_id = ${itemId}`.catch(() => [])) as { n: number }[];
 return Number(rows[0]?.n || 0);
}

/** Toggle a shopper's favorite for an item. Returns the new state + the item's count. */
export async function toggleFavorite(storeSlug: string, itemId: string, shopperId: string, email: string | null = null): Promise<{ favorited: boolean; count: number }> {
 await ensureTables();
 const sql = db();
 const has = await isFavorited(storeSlug, itemId, shopperId);
 if (has) await sql`DELETE FROM store_favorites WHERE store_slug = ${storeSlug} AND item_id = ${itemId} AND shopper_id = ${shopperId}`.catch(() => {});
 else await sql`INSERT INTO store_favorites (store_slug, item_id, shopper_id, email) VALUES (${storeSlug}, ${itemId}, ${shopperId}, ${email}) ON CONFLICT (store_slug, item_id, shopper_id) DO NOTHING`.catch(() => {});
 return { favorited: !has, count: await favoriteCount(storeSlug, itemId) };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RankedItem = { itemId: string; title: string; count: number };

export async function getTopViewed(storeSlug: string, sinceISO: string, limit = 6): Promise<RankedItem[]> {
 await ensureTables();
 const rows = (await db()`
  SELECT v.item_id, COALESCE(i.title, 'Item') AS title, COUNT(*)::int AS n
  FROM store_product_views v LEFT JOIN items i ON i.id::text = v.item_id
  WHERE v.store_slug = ${storeSlug} AND v.created_at >= ${sinceISO}
  GROUP BY v.item_id, i.title ORDER BY n DESC LIMIT ${limit}
 `.catch(() => [])) as any[];
 return rows.map((r) => ({ itemId: r.item_id, title: String(r.title), count: Number(r.n) }));
}

export async function getTopFavorited(storeSlug: string, sinceISO: string, limit = 6): Promise<RankedItem[]> {
 await ensureTables();
 const rows = (await db()`
  SELECT f.item_id, COALESCE(i.title, 'Item') AS title, COUNT(*)::int AS n
  FROM store_favorites f LEFT JOIN items i ON i.id::text = f.item_id
  WHERE f.store_slug = ${storeSlug} AND f.created_at >= ${sinceISO}
  GROUP BY f.item_id, i.title ORDER BY n DESC LIMIT ${limit}
 `.catch(() => [])) as any[];
 return rows.map((r) => ({ itemId: r.item_id, title: String(r.title), count: Number(r.n) }));
}

export async function storeViewFavoriteTotals(storeSlug: string, sinceISO: string): Promise<{ views: number; favorites: number }> {
 await ensureTables();
 const sql = db();
 const [v, f] = await Promise.all([
 sql`SELECT COUNT(*)::int AS n FROM store_product_views WHERE store_slug = ${storeSlug} AND created_at >= ${sinceISO}`.catch(() => [] as any[]),
 sql`SELECT COUNT(*)::int AS n FROM store_favorites WHERE store_slug = ${storeSlug} AND created_at >= ${sinceISO}`.catch(() => [] as any[]),
 ]);
 return { views: Number(v[0]?.n || 0), favorites: Number(f[0]?.n || 0) };
}
