import { neon } from "@neondatabase/serverless";
import { COLLECTIONS } from "./collections-config";
import { DISABLED_STORE_SLUGS, type DBProduct } from "./db";
export { COLLECTIONS } from "./collections-config";
export type { CollectionSlug } from "./collections-config";

const getDatabaseUrl = () => {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL environment variable is not set.");
 return url;
};

// Sentinel value — no week concept, picks are always live
const FIXED_WEEK = "1970-01-01";

let _initialized = false;

export type PickWithProduct = {
 pickId: number;
 position: number;
 favoriteCount?: number;
 product: {
 id: number;
 storeSlug: string;
 storeName: string;
 title: string;
 price: number;
 currency?: string | null;
 image: string | null;
 images: string | null;
 imageColor?: string | null;
 size: string | null;
 externalUrl: string | null;
 };
};

export async function initEditorsPicks(): Promise<void> {
 if (_initialized) return;
 const sql = neon(getDatabaseUrl());
 await sql`
 CREATE TABLE IF NOT EXISTS editors_picks (
 id SERIAL PRIMARY KEY,
 product_id INTEGER NOT NULL,
 week_start DATE NOT NULL,
 position SMALLINT NOT NULL DEFAULT 0,
 added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(product_id, week_start)
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_editors_picks_week ON editors_picks(week_start)`;
 // Migration: consolidate all picks to the fixed sentinel week
 await sql`UPDATE editors_picks SET week_start = ${FIXED_WEEK} WHERE week_start != ${FIXED_WEEK}`;

 // Add collection_slug column (migration-safe)
 await sql`ALTER TABLE editors_picks ADD COLUMN IF NOT EXISTS collection_slug TEXT NOT NULL DEFAULT 'editors-picks'`;

 // Drop old unique constraint that only allowed one pick per product globally,
 // then add a per-collection unique constraint so a product can appear in multiple collections
 await sql`ALTER TABLE editors_picks DROP CONSTRAINT IF EXISTS editors_picks_product_id_week_start_key`;
 await sql`
 CREATE UNIQUE INDEX IF NOT EXISTS idx_editors_picks_product_collection
 ON editors_picks(product_id, collection_slug)
 `;
 _initialized = true;
}

export async function getAllEditorsPicks(collectionSlug: string = "editors-picks"): Promise<PickWithProduct[]> {
 const sql = neon(getDatabaseUrl());
 await initEditorsPicks();

 const rows = await sql`
 SELECT
 ep.id AS pick_id,
 ep.position,
 p.id AS product_id,
 p.store_slug,
 p.store_name,
 p.title,
 p.price,
 p.currency,
 p.image,
 p.images,
 p.image_color,
 p.size,
 p.external_url,
 p.created_at,
 COUNT(c.id) AS click_count
 FROM editors_picks ep
 JOIN products p ON p.id = ep.product_id
 LEFT JOIN clicks c ON c.product_id = (p.store_slug || '-' || p.id::text)
 WHERE ep.collection_slug = ${collectionSlug}
 AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 GROUP BY ep.id, ep.position, p.id, p.store_slug, p.store_name, p.title, p.price, p.currency, p.image, p.images, p.image_color, p.size, p.external_url, p.created_at
 ORDER BY ep.added_at DESC, ep.id DESC
 LIMIT 500
 `;

 return rows.map((r) => ({
 pickId: r.pick_id as number,
 position: r.position as number,
 product: {
 id: r.product_id as number,
 storeSlug: r.store_slug as string,
 storeName: r.store_name as string,
 title: r.title as string,
 price: Number(r.price),
 currency: r.currency as string | null,
 image: r.image as string | null,
 images: r.images as string | null,
 imageColor: (r.image_color as string | null) ?? null,
 size: r.size as string | null,
 externalUrl: r.external_url as string | null,
 },
 }));
}

/** Returns picks for ALL collections in parallel — used on homepage. */
export async function getAllCollectionPicks(): Promise<Record<string, PickWithProduct[]>> {
 await initEditorsPicks();
 const sql = neon(getDatabaseUrl());

 const rows = await sql`
 SELECT
 ep.id AS pick_id,
 ep.collection_slug,
 ep.position,
 p.id AS product_id,
 p.store_slug,
 p.store_name,
 p.title,
 p.price,
 p.currency,
 p.image,
 p.images,
 p.size,
 p.external_url,
 COUNT(c.id) AS click_count
 FROM editors_picks ep
 JOIN products p ON p.id = ep.product_id
 LEFT JOIN clicks c ON c.product_id = (p.store_slug || '-' || p.id::text)
 WHERE (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 GROUP BY ep.id, ep.collection_slug, ep.position, p.id, p.store_slug, p.store_name, p.title, p.price, p.currency, p.image, p.images, p.size, p.external_url
 ORDER BY ep.collection_slug, ep.added_at DESC, ep.id DESC
 `;

 const result: Record<string, PickWithProduct[]> = {};
 for (const col of COLLECTIONS) result[col.slug] = [];

 for (const r of rows) {
 const slug = r.collection_slug as string;
 if (!result[slug]) result[slug] = [];
 result[slug].push({
 pickId: r.pick_id as number,
 position: r.position as number,
 product: {
 id: r.product_id as number,
 storeSlug: r.store_slug as string,
 storeName: r.store_name as string,
 title: r.title as string,
 price: Number(r.price),
 currency: r.currency as string | null,
 image: r.image as string | null,
 images: r.images as string | null,
 size: r.size as string | null,
 externalUrl: r.external_url as string | null,
 },
 });
 }

 return result;
}

/** Returns the set of collection slugs that have at least one product. */
export async function getActiveCollectionSlugs(): Promise<Set<string>> {
 try {
 const sql = neon(getDatabaseUrl());
 await initEditorsPicks();
 const rows = await sql`
 SELECT DISTINCT ep.collection_slug
 FROM editors_picks ep
 JOIN products p ON p.id = ep.product_id
 WHERE (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 `;
 return new Set(rows.map((r) => r.collection_slug as string));
 } catch {
 return new Set();
 }
}

export async function addEditorsPick(productId: number, collectionSlug: string = "editors-picks"): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await initEditorsPicks();

 const countRows = await sql`
 SELECT COALESCE(MAX(position), -1)::int AS max_pos
 FROM editors_picks
 WHERE collection_slug = ${collectionSlug}
 `;
 const nextPos = (countRows[0].max_pos as number) + 1;

 await sql`
 INSERT INTO editors_picks (product_id, week_start, position, collection_slug)
 VALUES (${productId}, ${FIXED_WEEK}, ${nextPos}, ${collectionSlug})
 ON CONFLICT (product_id, collection_slug) DO NOTHING
 `;
}

export async function removeEditorsPick(productId: number, collectionSlug: string = "editors-picks"): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await initEditorsPicks();
 await sql`
 DELETE FROM editors_picks
 WHERE product_id = ${productId} AND collection_slug = ${collectionSlug}
 `;
}

type ProductResult = {
 id: number;
 storeSlug: string;
 storeName: string;
 title: string;
 price: number;
 image: string | null;
};

function mapProductRow(r: Record<string, unknown>): ProductResult {
 return {
 id: r.id as number,
 storeSlug: r.store_slug as string,
 storeName: r.store_name as string,
 title: r.title as string,
 price: Number(r.price),
 image: r.image as string | null,
 };
}

export async function getAllProducts(limit = 300): Promise<ProductResult[]> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT id, store_slug, store_name, title, price, image
 FROM products
 WHERE image IS NOT NULL
 AND (shopify_product_id IS NULL OR collabs_link IS NOT NULL)
 AND (${DISABLED_STORE_SLUGS.length} = 0 OR store_slug != ALL(${DISABLED_STORE_SLUGS}))
 ORDER BY created_at DESC NULLS LAST
 LIMIT ${limit}
 `;
 return rows.map(mapProductRow);
}

export async function getProductsByStore(storeSlug: string, limit = 300): Promise<ProductResult[]> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT id, store_slug, store_name, title, price, image
 FROM products
 WHERE store_slug = ${storeSlug}
 AND (shopify_product_id IS NULL OR collabs_link IS NOT NULL)
 AND (${DISABLED_STORE_SLUGS.length} = 0 OR store_slug != ALL(${DISABLED_STORE_SLUGS}))
 ORDER BY title
 LIMIT ${limit}
 `;
 return rows.map(mapProductRow);
}

/**
 * Dynamically returns the top `limit` most-favorited products across all stores.
 * This powers the "Everyone's Favorites" section — no manual curation required.
 * Falls back to most-clicked products if no favorites exist yet.
 */
export async function getEveryonesFavorites(limit = 75): Promise<PickWithProduct[]> {
 // Degrade to empty when the DB isn't reachable (e.g. a preview build without
 // DATABASE_URL) so static prerendering of the homepage never crashes the build.
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return [];
 const sql = neon(dbUrl);

 try {
 const rows = await sql`
 SELECT
 p.id AS product_id,
 p.store_slug,
 p.store_name,
 p.title,
 p.price,
 p.currency,
 p.image,
 p.images,
 p.image_color,
 p.size,
 p.external_url,
 COUNT(pf.id)::int AS favorite_count
 FROM products p
 JOIN product_favorites pf ON pf.product_id = p.id
 WHERE p.image IS NOT NULL
 AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 AND (${DISABLED_STORE_SLUGS.length} = 0 OR p.store_slug != ALL(${DISABLED_STORE_SLUGS}))
 GROUP BY p.id, p.store_slug, p.store_name, p.title, p.price, p.currency, p.image, p.images, p.image_color, p.size, p.external_url
 ORDER BY p.created_at DESC NULLS LAST, favorite_count DESC
 LIMIT ${limit}
 `;

 return rows.map((r, i) => ({
 pickId: r.product_id as number,
 position: i,
 favoriteCount: r.favorite_count as number,
 product: {
 id: r.product_id as number,
 storeSlug: r.store_slug as string,
 storeName: r.store_name as string,
 title: r.title as string,
 price: Number(r.price),
 currency: r.currency as string | null,
 image: r.image as string | null,
 images: r.images as string | null,
 imageColor: (r.image_color as string | null) ?? null,
 size: r.size as string | null,
 externalUrl: r.external_url as string | null,
 },
 }));
 } catch (error) {
 // A query failure during prerender (e.g. Neon out-of-memory under the parallel build
 // workers) must not crash the homepage — degrade to empty like the other homepage fetches.
 console.error("Failed to fetch everyone's favorites:", error);
 return [];
 }
}

/** Collection slug for the hand-picked weekly New Arrivals email. NOT a public
 * collection — it only feeds the email. */
export const EMAIL_PICKS_SLUG = "new-arrivals-email";

/**
 * Products hand-picked for the New Arrivals email, in pick order, as full product
 * rows. Empty when nothing is curated — the email then falls back to its automatic
 * weekly selection, so it never goes out blank. Capped at 25 (the email's max).
 */
export async function getEmailPickProducts(): Promise<DBProduct[]> {
 await initEditorsPicks();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT p.*
 FROM editors_picks ep
 JOIN products p ON p.id = ep.product_id
 WHERE ep.collection_slug = ${EMAIL_PICKS_SLUG}
 AND p.image IS NOT NULL
 AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 ORDER BY ep.position ASC, ep.added_at ASC
 LIMIT 25
 `;
 return rows as unknown as DBProduct[];
}

// Admin product search — deliberately NOT its own ranking.
//
// The curator types "runway" or "ysl" the way a shopper would, so this runs the SHOPPER'S
// search (/api/search: brand aliases, category expansion, stemming, synonyms, description
// matches, typo fallback) and then re-reads those ids out of `products` in the shape the
// admin grid already consumes. One ranking, one place to improve it — a second copy here
// would drift the moment either side changed.
//
// The public route returns ids in relevance order; that order is preserved on the way back.
export async function searchProducts(q: string, storeSlug?: string): Promise<ProductResult[]> {
 const { GET: marketplaceSearch } = await import("@/app/api/search/route");
 const res = await marketplaceSearch(
 new Request(`https://vyaplatform.com/api/search?q=${encodeURIComponent(q)}&limit=200`)
 );
 const data = (await res.json()) as { products?: { id: number }[] };
 const ids = (data.products ?? []).map((p) => p.id).filter((id) => Number.isFinite(id));
 if (ids.length === 0) return [];

 const sql = neon(getDatabaseUrl());
 const rows = storeSlug
 ? await sql`
 SELECT id, store_slug, store_name, title, price, image
 FROM products
 WHERE id = ANY(${ids})
 AND store_slug = ${storeSlug}
 `
 : await sql`
 SELECT id, store_slug, store_name, title, price, image
 FROM products
 WHERE id = ANY(${ids})
 `;

 const rank = new Map(ids.map((id, i) => [id, i]));
 return rows
 .map(mapProductRow)
 .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
