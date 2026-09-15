import { neon } from "@neondatabase/serverless";

// Per-STORE shopper behaviour: saved pieces + product views on a store's OWN storefront, not the
// VYA marketplace.
//
// TWO DIFFERENT IDENTITIES, ON PURPOSE.
//   • VIEWS are anonymous. An unnamed cookie. Counting how many people looked at a piece needs no
//     name, and asking for one to browse would be an imposition with nothing behind it.
//   • SAVES are signed in. `shopper_id` here is the email on the store session (shopper-session.ts),
//     which is what lets a list follow somebody from a laptop to a phone, and what turns "eleven
//     people saved this" into eleven of the seller's own customers rather than eleven random ids.
//
// The seller's shoppers are HERS. A store session names the store it was issued for and is refused
// anywhere else, so signing in to save a dress at one shop makes nobody a marketplace member.

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
 // NOT `store_favorites`. That name was already taken by app/lib/favorites-db.ts. The MARKETPLACE's
 // table of shoppers following a whole store (user_id, store_slug), which feeds notifications and
 // has real rows in it. This is a different thing entirely: one shopper saving one PIECE on one
 // seller's storefront.
 //
 // The collision was silent and total. `CREATE TABLE IF NOT EXISTS` saw a table by that name and
 // did nothing, so every read and write here ran against a table with no item_id column, failed,
 // and was swallowed by the .catch on each query. Saving a piece on a storefront has therefore
 // never once worked. It returned ok, and stored nothing.
 await sql`CREATE TABLE IF NOT EXISTS store_item_favorites (
  id SERIAL PRIMARY KEY, store_slug TEXT NOT NULL, item_id TEXT NOT NULL, shopper_id TEXT NOT NULL,
  email TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_slug, item_id, shopper_id)
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_item_favs_store ON store_item_favorites (store_slug, created_at DESC)`;
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

export type ShopperFavorite = {
 itemId: string;
 title: string;
 priceCents: number;
 currency: string;
 image: string | null;
 status: string;
 /** How this store addresses the piece. The imported handle where there is one, else the id. It is
  *  what goes in /products/…, and the two are not interchangeable. See wishlist-core.ts. */
 ref: string;
};

/** A shopper's saved items on a store (newest first), with details for the storefront page. */
export async function getShopperFavorites(storeSlug: string, shopperId: string): Promise<ShopperFavorite[]> {
 await ensureTables();
 const rows = (await db()`
  SELECT f.item_id, i.title, i.price_cents, i.currency, i.images, i.status, i.source_id
  FROM store_item_favorites f JOIN items i ON i.id::text = f.item_id
  WHERE f.store_slug = ${storeSlug} AND f.shopper_id = ${shopperId}
  ORDER BY f.created_at DESC LIMIT 60
 `.catch(() => [])) as any[];
 return rows.map((r) => ({
  itemId: String(r.item_id),
  title: String(r.title || "Item"),
  priceCents: Number(r.price_cents || 0),
  currency: String(r.currency || "USD").toUpperCase(),
  image: Array.isArray(r.images) ? (r.images[0] ?? null) : null,
  status: String(r.status || "active"),
  // Sold pieces stay in the list rather than vanishing, on one-of-one vintage, "this one went" is
  // information a shopper wants, and silently dropping it looks like the list lost her piece.
  ref: String(r.source_id || r.item_id),
 }));
}

/**
 * The piece a storefront link was pointing at, as an id this table can store.
 *
 * A storefront addresses a piece by whichever name it arrived with: an imported store links to the
 * handle it had on Shopify, a piece added on VYA links to its own id. Saving has to work from both,
 * and only ever within the store doing the asking. A handle from one shop must not be able to
 * attach a save to another shop's piece, and handles are not unique across stores.
 *
 * Returns null when the reference matches nothing live in that store, so a stale link in a
 * shopper's tab cannot create a row pointing at a piece that does not exist.
 */
export async function resolveStoreItemId(storeSlug: string, ref: string): Promise<string | null> {
 const r = (ref || "").trim();
 if (!r) return null;
 const sql = db();
 const seller = (await sql`SELECT id FROM sellers WHERE slug = ${storeSlug} LIMIT 1`.catch(() => [])) as { id: string }[];
 const sellerId = seller[0]?.id;
 if (!sellerId) return null;
 // An id, if it looks like one. Matched against this store, never taken on trust.
 if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r)) {
  const byId = (await sql`SELECT id FROM items WHERE id = ${r}::uuid AND seller_id = ${sellerId} LIMIT 1`.catch(() => [])) as { id: string }[];
  if (byId[0]) return String(byId[0].id);
 }
 // Otherwise the handle it was imported under.
 const byHandle = (await sql`SELECT id FROM items WHERE seller_id = ${sellerId} AND source_id = ${r} LIMIT 1`.catch(() => [])) as { id: string }[];
 return byHandle[0] ? String(byHandle[0].id) : null;
}

export async function recordProductView(storeSlug: string, itemId: string, shopperId: string | null): Promise<void> {
 if (!itemId) return;
 await ensureTables();
 await db()`INSERT INTO store_product_views (store_slug, item_id, shopper_id) VALUES (${storeSlug}, ${itemId}, ${shopperId})`.catch(() => {});
}

export async function isFavorited(storeSlug: string, itemId: string, shopperId: string): Promise<boolean> {
 await ensureTables();
 const rows = (await db()`SELECT 1 FROM store_item_favorites WHERE store_slug = ${storeSlug} AND item_id = ${itemId} AND shopper_id = ${shopperId} LIMIT 1`.catch(() => [])) as unknown[];
 return rows.length > 0;
}

export async function favoriteCount(storeSlug: string, itemId: string): Promise<number> {
 await ensureTables();
 const rows = (await db()`SELECT COUNT(*)::int AS n FROM store_item_favorites WHERE store_slug = ${storeSlug} AND item_id = ${itemId}`.catch(() => [])) as { n: number }[];
 return Number(rows[0]?.n || 0);
}

/**
 * How much attention one piece has had: views and saves, together.
 *
 * These two numbers were already being COLLECTED. Store_product_views has had a row per storefront
 * visit for months, and read by nothing. The phone's piece editor drew "{item.views ?? 0} views ·
 * {item.favorites ?? 0} saves" from fields no endpoint had ever returned, so every piece in the app
 * reported 0 · 0, including one of ange-archive's with 98 real views. A seller deciding whether to
 * reprice something was being shown a flat zero and no way to tell it apart from a true zero.
 *
 * Both counts are scoped to the store as well as the item, matching how they are written.
 */
export async function itemInterest(storeSlug: string, itemId: string): Promise<{ views: number; favorites: number }> {
 if (!itemId) return { views: 0, favorites: 0 };
 await ensureTables();
 const sql = db();
 const [v, f] = await Promise.all([
  sql`SELECT COUNT(*)::int AS n FROM store_product_views WHERE store_slug = ${storeSlug} AND item_id = ${itemId}`.catch(() => []) as Promise<{ n: number }[]>,
  sql`SELECT COUNT(*)::int AS n FROM store_item_favorites WHERE store_slug = ${storeSlug} AND item_id = ${itemId}`.catch(() => []) as Promise<{ n: number }[]>,
 ]);
 return { views: Number(v[0]?.n || 0), favorites: Number(f[0]?.n || 0) };
}

/** Toggle a shopper's favorite for an item. Returns the new state + the item's count. */
export async function toggleFavorite(storeSlug: string, itemId: string, shopperId: string, email: string | null = null): Promise<{ favorited: boolean; count: number }> {
 await ensureTables();
 const sql = db();
 const has = await isFavorited(storeSlug, itemId, shopperId);
 if (has) await sql`DELETE FROM store_item_favorites WHERE store_slug = ${storeSlug} AND item_id = ${itemId} AND shopper_id = ${shopperId}`.catch(() => {});
 else await sql`INSERT INTO store_item_favorites (store_slug, item_id, shopper_id, email) VALUES (${storeSlug}, ${itemId}, ${shopperId}, ${email}) ON CONFLICT (store_slug, item_id, shopper_id) DO NOTHING`.catch(() => {});
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
  FROM store_item_favorites f LEFT JOIN items i ON i.id::text = f.item_id
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
 sql`SELECT COUNT(*)::int AS n FROM store_item_favorites WHERE store_slug = ${storeSlug} AND created_at >= ${sinceISO}`.catch(() => [] as any[]),
 ]);
 return { views: Number(v[0]?.n || 0), favorites: Number(f[0]?.n || 0) };
}
