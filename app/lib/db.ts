import { neon } from "@neondatabase/serverless";
import { unstable_cache } from "next/cache";
import { HIDDEN_STORE_SLUGS } from "./stores";
import { SHOPIFY_STORES } from "./storeConfig";
import { logError } from "./error-log";

// Products from these slugs are hidden site-wide: manually disabled + stores without Collabs ID.
// "venus-vintage" — removed as a store, but her product rows remain in the DB and sync as $0
// (she rents most pieces). Keep her disabled so nothing surfaces until the rows are purged.
export const DISABLED_STORE_SLUGS: string[] = ["velvet-archive", "venus-vintage", ...HIDDEN_STORE_SLUGS];

// Slugs of Shopify-powered stores. Used to gate collabs_link requirement — only Shopify
// products need a collabs_link to be visible; non-Shopify products are always shown.
const SHOPIFY_STORE_SLUGS: string[] = SHOPIFY_STORES.map((s) => s.slug);

// Stores excluded from New Arrivals only (products still appear in browse/search).
const NEW_ARRIVALS_EXCLUDED_SLUGS: string[] = ["chill-boutique"];

// Get the database URL from environment variable
const getDatabaseUrl = () => {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) {
 throw new Error(
 "DATABASE_URL or POSTGRES_URL environment variable is not set. " +
 "Please set up Vercel Postgres or Neon database."
 );
 }
 return url;
};

// One-time / self-healing cleanup for scrape pollution: a "Condition Guide" nav link once matched as
// a Condition field and swallowed the store's whole menu into condition/materials/measurements. The
// scraper no longer does this, but the COALESCE upsert keeps old junk — so null it out. Idempotent:
// a real value ("Excellent — light wear") never contains these nav phrases, so it's left untouched.
export async function cleanScrapedNavJunk(): Promise<number> {
 const sql = neon(getDatabaseUrl());
 const junk = "(contact us|shop all|sourcing requests?|summer arrivals|private sourcing|add to (cart|bag)|log ?in|newsletter|search cart)";
 const rows = (await sql`
  UPDATE products SET
   condition = CASE WHEN condition ~* ${junk} THEN NULL ELSE condition END,
   materials = CASE WHEN materials ~* ${junk} THEN NULL ELSE materials END,
   measurements = CASE WHEN measurements ~* ${junk} THEN NULL ELSE measurements END
  WHERE condition ~* ${junk} OR materials ~* ${junk} OR measurements ~* ${junk}
  RETURNING id
 `.catch(() => [])) as { id: number }[];
 return rows.length;
}

export type DBProduct = {
 id: number;
 store_slug: string;
 store_name: string;
 title: string;
 price: number;
 currency: string;
 image: string | null;
 images: string | null;
 video_url: string | null;
 image_color: string | null;
 external_url: string | null;
 description: string | null;
 variant_id: string | null;
 shopify_product_id: string | null;
 collabs_link: string | null;
 size: string | null;
 compare_at_price: number | null;
 product_type: string | null;
 brand: string | null;
 condition: string | null;
 materials: string | null;
 measurements: string | null;
 tags: string[] | null;
 collections: string[] | null;
 era: string | null;
 insider_notified: boolean;
 synced_at: Date;
 created_at: Date;
};

/**
 * Initialize the products table if it doesn't exist
 */
export async function initDatabase() {
 const sql = neon(getDatabaseUrl());

 await sql`
 CREATE TABLE IF NOT EXISTS products (
 id SERIAL PRIMARY KEY,
 store_slug VARCHAR(255) NOT NULL,
 store_name VARCHAR(255) NOT NULL,
 title TEXT NOT NULL,
 price DECIMAL(10, 2) NOT NULL,
 currency VARCHAR(10) DEFAULT 'USD',
 image TEXT,
 external_url TEXT,
 synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 UNIQUE(store_slug, title)
 )
 `;

 // Create index for faster queries by store
 await sql`
 CREATE INDEX IF NOT EXISTS idx_products_store_slug ON products(store_slug)
 `;

 // Add description column if it doesn't exist (migration for existing tables)
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT
 `;

 // Add images column if it doesn't exist (JSON array of image URLs)
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT
 `;

 // Add video_url column — a hosted product video (mp4) when the store lists one
 // instead of (or alongside) images.
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT
 `;

 // Colour read off the product IMAGE by vision (normalized to the filter palette),
 // so colour filtering works even when the title has no colour word. image_color_at
 // marks a product as processed (so the backfill skips it), even if no colour was
 // determinable (image_color stays NULL).
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_color TEXT`;
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_color_at TIMESTAMPTZ`;

 // Add variant_id column for Shopify direct checkout URLs
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_id TEXT
 `;
 // Captured from the seller's own product page (scrapeProductPage stores): the condition,
 // fibre/materials, and measurements they already wrote — stored structured so intake,
 // pricing, and training use the truth instead of re-guessing it from the photo.
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS condition TEXT`;
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS materials TEXT`;
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS measurements TEXT`;
 // The seller's own Shopify tags — they encode era/style/collection (e.g. "y2k", "1990s",
 // "archive"). Kept so we stop discarding a strong era/style signal at import.
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[]`;
 // The store's own collections this piece belongs to (e.g. "1990s", "Chanel", "Bags") — the
 // richest seller-labeled signal for era/brand/category. `era` is derived from them (see
 // collections-sync.ts) so the intake accuracy loop learns from real labels, not guesses.
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS collections TEXT[]`;
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS era TEXT`;

 // Add created_at column (set explicitly during sync, NULL for existing products)
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE
 `;

 // Add shopify_product_id for Collabs affiliate link generation
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_product_id TEXT
 `;

 // Add collabs_link: per-product collabs.shop affiliate URL
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS collabs_link TEXT
 `;

 // Add size column for product sizing info (e.g. "38.5", "M", "US 8")
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS size TEXT
 `;

 // The set of bare size tokens this product should match a size filter on —
 // the DERIVED display size (deriveSize), expanded so a ranged fit like
 // "US 2-4" → {2,3,4}. NULL means "not yet computed" (falls back to raw size
 // matching); populated by the size-keys backfill. GIN index for fast overlap.
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS size_keys TEXT[]
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_products_size_keys ON products USING GIN (size_keys)`;

 // Add insider_notified column to track which products have been emailed to Insiders
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS insider_notified BOOLEAN DEFAULT FALSE
 `;

 // Add compare_at_price for sale price display
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_at_price DECIMAL(10, 2)
 `;

 // designer/product type from Shopify (e.g. "Chanel", "Louis Vuitton")
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT
 `;

 // Index for new arrivals queries
 await sql`
 CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC)
 `;

 // Market data: log every price change detected at sync time
 await sql`
 CREATE TABLE IF NOT EXISTS price_history (
 id SERIAL PRIMARY KEY,
 product_id INTEGER,
 store_slug TEXT NOT NULL,
 title TEXT NOT NULL,
 designer TEXT,
 old_price NUMERIC(10,2) NOT NULL,
 new_price NUMERIC(10,2) NOT NULL,
 currency TEXT NOT NULL DEFAULT 'USD',
 changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_price_history_store ON price_history(store_slug, changed_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_price_history_designer ON price_history(designer, changed_at DESC)`;

 // Market data: capture sold items at the moment they fall off the sync feed
 await sql`
 CREATE TABLE IF NOT EXISTS sold_items (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 store_name TEXT NOT NULL,
 title TEXT NOT NULL,
 designer TEXT,
 final_price NUMERIC(10,2) NOT NULL,
 original_price NUMERIC(10,2),
 currency TEXT NOT NULL DEFAULT 'USD',
 image TEXT,
 size TEXT,
 shopify_product_id TEXT,
 collabs_link TEXT,
 click_count INTEGER NOT NULL DEFAULT 0,
 favorite_count INTEGER NOT NULL DEFAULT 0,
 days_listed INTEGER,
 first_seen_at TIMESTAMPTZ,
 sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_sold_items_sold_at ON sold_items(sold_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_sold_items_designer ON sold_items(designer, sold_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_sold_items_store ON sold_items(store_slug, sold_at DESC)`;
 // Confirmed = final_price is the REAL amount from a matched order (a receipt), not the listed price
 // inferred at feed-drop. Populated by recordConfirmedSales; lets the price eval grade against truth.
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false`.catch(() => {});
 // Reconcile sold_items schema DRIFT: two historical CREATE TABLE definitions disagreed (this one vs
 // the market-data one), so whichever ran first won and the other's columns were missing — making the
 // insert below throw silently. Add every column BOTH definitions and the insert paths reference, so
 // the table converges no matter which shape exists on a given environment.
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS product_id TEXT`.catch(() => {});
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS product_type TEXT`.catch(() => {});
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS source_id TEXT`.catch(() => {});
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS shopify_product_id TEXT`.catch(() => {});
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS collabs_link TEXT`.catch(() => {});
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0`.catch(() => {});
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS favorite_count INTEGER NOT NULL DEFAULT 0`.catch(() => {});
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS days_listed INTEGER`.catch(() => {});
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ`.catch(() => {});

 // Preserve the identity of products removed from the catalog (sold out / renamed) so the
 // events ETL can still resolve their views — otherwise that history orphans and demand for
 // our best-selling items gets undercounted. Keyed by the original products.id; composite_id
 // matches how product_views/clicks reference a product ("{store_slug}-{id}").
 await sql`
 CREATE TABLE IF NOT EXISTS product_history (
 id INTEGER PRIMARY KEY,
 store_slug TEXT NOT NULL,
 composite_id TEXT NOT NULL,
 title TEXT,
 description TEXT,
 shopify_product_id TEXT,
 price NUMERIC(10,2),
 currency TEXT,
 archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_product_history_composite ON product_history(composite_id)`;

 // Remove products synced under the old computed slug for Bloda's Choice
 // (computed: "bloda-s-choice", correct: "blodas-choice")
 await sql`DELETE FROM products WHERE store_slug = 'bloda-s-choice'`;

 // Deduplicate any existing rows before enforcing the unique constraint
 await sql`
 DELETE FROM products
 WHERE id NOT IN (
 SELECT MIN(id) FROM products GROUP BY store_slug, title
 )
 `;

 // Enforce unique (store_slug, title) — safe to run on existing tables
 await sql`
 CREATE UNIQUE INDEX IF NOT EXISTS idx_products_store_title
 ON products(store_slug, title)
 `;

 // Composite index for store detail pages (filter by store + available for purchase)
 await sql`
 CREATE INDEX IF NOT EXISTS idx_products_store_collabs
 ON products(store_slug, collabs_link)
 WHERE shopify_product_id IS NULL OR collabs_link IS NOT NULL
 `;

 // Timestamp for when a Collabs link was first assigned to a product.
 // Used by new arrivals to determine if a Shopify product is genuinely new
 // (link set recently for a just-synced item) vs. an old product that just
 // had its link batch-generated.
 await sql`
 ALTER TABLE products ADD COLUMN IF NOT EXISTS collabs_link_set_at TIMESTAMPTZ
 `;

 // Index for insider notification queries
 await sql`
 CREATE INDEX IF NOT EXISTS idx_products_insider_notified
 ON products(insider_notified, created_at DESC)
 WHERE insider_notified = FALSE
 `;

 // Persistent record of every (store_slug, title) that has ever been shown to Insiders.
 // Survives product deletions so re-inserted products are never shown as "new" again.
 await sql`
 CREATE TABLE IF NOT EXISTS insider_seen_products (
 store_slug TEXT NOT NULL,
 title TEXT NOT NULL,
 PRIMARY KEY (store_slug, title)
 )
 `;

 // Search indexes — required for full-text and fuzzy search in /api/search
 await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.catch(() => {});
 await sql`
 CREATE INDEX IF NOT EXISTS idx_products_title_fts
 ON products USING GIN (to_tsvector('english', COALESCE(title, '')))
 `.catch(() => {});
 await sql`
 CREATE INDEX IF NOT EXISTS idx_products_title_trgm
 ON products USING GIN (LOWER(title) gin_trgm_ops)
 `.catch(() => {});
}

/**
 * Sync products for a store using upsert to preserve stable product IDs.
 * Products no longer in the feed are removed; existing ones are updated in place.
 */
export type PriceDrop = {
 productId: number;
 title: string;
 image: string | null;
 oldPrice: number;
 newPrice: number;
 storeSlug: string;
 storeName: string;
};

export async function syncProducts(
 storeSlug: string,
 storeName: string,
 products: Array<{
 title: string;
 price: number;
 currency?: string;
 image?: string;
 images?: string[];
 videoUrl?: string | null;
 externalUrl?: string;
 description?: string;
 variantId?: string;
 shopifyProductId?: string;
 size?: string;
 compareAtPrice?: number | null;
 brand?: string;
 productType?: string;
 condition?: string | null;
 materials?: string | null;
 measurements?: string | null;
 tags?: string[];
 available?: boolean; // false = sold out at the source. Preserved in sold_items, kept out of the live catalog.
 }>,
 options?: { excludeKeywords?: string[]; excludeTitles?: string[] }
): Promise<{ count: number; inserted: number; updated: number; priceDrops: PriceDrop[] }> {
 const sql = neon(getDatabaseUrl());

 // Titles that should never appear on VYA — blocked globally across all stores.
 // Checked as case-insensitive substrings. Includes non-catalog "products" that
 // sellers create as custom invoices (bulk orders, deposits, balance payments) —
 // e.g. Nello's "Custom Bulk Order (6 items)" with a photo of a receipt.
 const BLOCKED_TITLE_PATTERNS = [
 "gift card",
 "authentication",
 "authentification",
 "item authentication",
 "authentication service",
 "authentication fee",
 "bulk order",
 "custom bulk",
 "deposit",
 "balance due",
 "remaining balance",
 "payment plan",
 "down payment",
 "invoice",
 ];

 // Per-store exclusions come from two places: the store config (options) AND the
 // admin-managed "permanently removed" list in blocked_products. The DB list lets the
 // team remove a specific item from the admin with no code change, enforced on every
 // sync path (all call syncProducts). .catch handles the table not existing yet.
 const dbBlockedRows = (await sql`SELECT title FROM blocked_products WHERE store_slug = ${storeSlug}`.catch(() => [])) as { title: string }[];
 const excludeKws = (options?.excludeKeywords ?? []).map((k) => k.toLowerCase());
 const excludeTitles = new Set<string>([
 ...(options?.excludeTitles ?? []).map((t) => t.toLowerCase()),
 ...dbBlockedRows.map((r) => r.title.toLowerCase()),
 ]);

 // A title is blocked if it matches a global pattern, an exact removed/excluded title,
 // or an excluded keyword. Used both to delete existing rows AND to skip re-inserting
 // on this same sync run (see the upsert loop below — `if (isBlocked) continue`).
 const isBlocked = (title: string) => {
 const lower = title.toLowerCase();
 return BLOCKED_TITLE_PATTERNS.some((p) => lower.includes(p))
 || excludeTitles.has(lower)
 || excludeKws.some((kw) => lower.includes(kw));
 };

 // Remove any previously-synced globally-blocked products for this store.
 for (const pat of BLOCKED_TITLE_PATTERNS) {
 await sql`DELETE FROM products WHERE store_slug = ${storeSlug} AND title ILIKE ${"%" + pat + "%"}`;
 }

 // Remove store-specific excluded / permanently-removed products already in the DB.
 if (excludeKws.length > 0 || excludeTitles.size > 0) {
 const existing = await sql`SELECT title FROM products WHERE store_slug = ${storeSlug}`;
 for (const r of existing as { title: string }[]) {
 if (isBlocked(r.title)) {
 await sql`DELETE FROM products WHERE store_slug = ${storeSlug} AND lower(title) = lower(${r.title})`;
 }
 }
 }

 // Snapshot current prices so we can detect drops after upsert
 const oldRows = await sql`
 SELECT id, title, price, image FROM products WHERE store_slug = ${storeSlug}
 `;
 const oldByTitle = new Map<string, { id: number; price: number; image: string | null }>();
 for (const row of oldRows) {
 oldByTitle.set(row.title as string, {
 id: row.id as number,
 price: Number(row.price),
 image: row.image as string | null,
 });
 }

 // Load titles that have ever been shown to Insiders for this store.
 // If a product was deleted and re-inserted, we restore insider_notified = TRUE
 // so it doesn't appear on the Insider page as a "new" arrival again.
 const seenRows = await sql`
 SELECT title FROM insider_seen_products WHERE store_slug = ${storeSlug}
 `;
 const prevSeenTitles = new Set(seenRows.map((r) => r.title as string));

 // Upsert each product (preserves id for existing rows)
 const titles: string[] = [];
 let insertedCount = 0;
 let updatedCount = 0;
 for (const product of products) {
 if (isBlocked(product.title)) continue;

 // Sold out at the source: preserve its listing data (feeds pricing comps + demand) but keep it
 // OUT of the live catalog. If it was already live on VYA, the stale-product sweep below captures
 // the transition with real dwell time; here we only capture pieces NEW to us — a store's existing
 // sold history at import. Don't push its title, so the sweep removes any stale live row. Deduped
 // by store+title so repeated imports/syncs don't pile up.
 if (product.available === false) {
 if (!oldByTitle.has(product.title)) {
 await sql`
 INSERT INTO sold_items (store_slug, store_name, product_id, title, designer, final_price, original_price, currency, image, size, product_type, source_id, sold_at)
 SELECT ${storeSlug}, ${storeName}, ${product.shopifyProductId ? `${storeSlug}-shopify-${product.shopifyProductId}` : null}, ${product.title},
  ${(product.brand || product.productType || "").trim() || null}, ${product.price}, ${product.compareAtPrice ?? product.price}, ${product.currency || "USD"},
  ${product.image || (product.images && product.images[0]) || null}, ${product.size || null}, ${product.productType || null}, ${product.shopifyProductId || null}, NOW()
 WHERE NOT EXISTS (SELECT 1 FROM sold_items s WHERE s.store_slug = ${storeSlug} AND lower(s.title) = lower(${product.title}))
 `.catch((e) => logError("sold_items-import-insert", e, { context: { storeSlug, title: product.title } })); // never swallow — this path silently starved the data layer for months
 }
 continue;
 }

 titles.push(product.title);
 // VYA is a visual marketplace — never add a product with no image (it renders a
 // broken card and is filtered out of every grid anyway). Video-only products
 // carry the video's poster frame as their image (see shopifyClient), so they
 // still have one and pass. The title stays in `titles` (above) so an existing
 // row isn't wrongly logged as "sold"/deleted by the stale-product cleanup.
 if (!product.image && !(product.images && product.images.length > 0)) continue;
 const isExisting = oldByTitle.has(product.title);
 if (isExisting) updatedCount++; else insertedCount++;
 const imagesJson = product.images ? JSON.stringify(product.images) : null;
 const wasSeenOnInsider = prevSeenTitles.has(product.title);
 await sql`
 INSERT INTO products (store_slug, store_name, title, price, currency, image, images, video_url, external_url, description, variant_id, shopify_product_id, size, compare_at_price, product_type, brand, condition, materials, measurements, tags, insider_notified, synced_at, created_at)
 VALUES (
 ${storeSlug},
 ${storeName},
 ${product.title},
 ${product.price},
 ${product.currency || "USD"},
 ${product.image || null},
 ${imagesJson},
 ${product.videoUrl || null},
 ${product.externalUrl || null},
 ${product.description || null},
 ${product.variantId || null},
 ${product.shopifyProductId || null},
 ${product.size || null},
 ${product.compareAtPrice ?? null},
 ${product.productType || null},
 ${product.brand || null},
 ${product.condition || null},
 ${product.materials || null},
 ${product.measurements || null},
 ${product.tags && product.tags.length ? product.tags : null},
 ${wasSeenOnInsider},
 NOW(),
 NOW()
 )
 ON CONFLICT (store_slug, title) DO UPDATE SET
 store_name = EXCLUDED.store_name,
 price = EXCLUDED.price,
 currency = EXCLUDED.currency,
 image = EXCLUDED.image,
 images = EXCLUDED.images,
 video_url = EXCLUDED.video_url,
 external_url = EXCLUDED.external_url,
 description = EXCLUDED.description,
 variant_id = COALESCE(EXCLUDED.variant_id, products.variant_id),
 shopify_product_id = COALESCE(EXCLUDED.shopify_product_id, products.shopify_product_id),
 size = COALESCE(EXCLUDED.size, products.size),
 -- Invalidate derived size tokens ONLY when their inputs (size/description) actually
 -- changed, so the bounded onlyMissing backfill recomputes just the changed rows
 -- instead of the whole catalog every night.
 size_keys = CASE
 WHEN products.description IS DISTINCT FROM EXCLUDED.description
 OR products.size IS DISTINCT FROM COALESCE(EXCLUDED.size, products.size)
 THEN NULL ELSE products.size_keys END,
 compare_at_price = EXCLUDED.compare_at_price,
 product_type = COALESCE(EXCLUDED.product_type, products.product_type),
 brand = COALESCE(EXCLUDED.brand, products.brand),
 condition = COALESCE(EXCLUDED.condition, products.condition),
 materials = COALESCE(EXCLUDED.materials, products.materials),
 measurements = COALESCE(EXCLUDED.measurements, products.measurements),
 tags = COALESCE(EXCLUDED.tags, products.tags),
 synced_at = NOW()
 `;
 }

 // Detect price changes and log to price_history; build price drop list for notifications
 const priceDrops: PriceDrop[] = [];
 for (const product of products) {
 if (isBlocked(product.title)) continue;
 const old = oldByTitle.get(product.title);
 if (old && product.price !== old.price) {
 // Log every price change (up or down) for market data
 await sql`
 INSERT INTO price_history (product_id, store_slug, title, designer, old_price, new_price, currency)
 VALUES (
 ${old.id},
 ${storeSlug},
 ${product.title},
 ${product.productType || null},
 ${old.price},
 ${product.price},
 ${product.currency || "USD"}
 )
 `.catch(() => {}); // non-fatal: table may not exist on first run before initDatabase
 if (product.price < old.price) {
 priceDrops.push({
 productId: old.id,
 title: product.title,
 image: product.image || old.image || null,
 oldPrice: old.price,
 newPrice: product.price,
 storeSlug,
 storeName,
 });
 }
 }
 }

 // Capture sold items (products dropping off the feed) before deleting them
 if (titles.length > 0) {
 // Column list MUST match the sold_items table exactly — the previous list referenced
 // shopify_product_id/collabs_link/first_seen_at (which don't exist), so every insert threw and
 // the swallowed catch left sold_items frozen for months, starving the data layer. Log, don't hide.
 try {
 await sql`
 INSERT INTO sold_items
 (store_slug, store_name, product_id, title, designer, final_price, original_price, currency,
 image, size, product_type, source_id, click_count, favorite_count, days_listed, sold_at)
 SELECT
 p.store_slug,
 p.store_name,
 p.store_slug || '-' || p.id::text,
 p.title,
 COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, '')),
 p.price,
 COALESCE(p.compare_at_price, p.price),
 p.currency,
 p.image,
 p.size,
 p.product_type,
 p.shopify_product_id,
 COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.product_id = p.store_slug || '-' || p.id::text), 0)::integer,
 COALESCE((SELECT COUNT(*) FROM product_favorites pf WHERE pf.product_id = p.id), 0)::integer,
 CASE WHEN p.created_at IS NOT NULL
 THEN GREATEST(0, EXTRACT(day FROM (NOW() - p.created_at))::integer)
 ELSE NULL
 END,
 NOW()
 FROM products p
 WHERE p.store_slug = ${storeSlug}
 AND p.title != ALL(${titles})
 AND p.price > 0
 `;
 } catch (e) {
 console.error(`[sync] sold_items capture failed for ${storeSlug}:`, e);
 }
 }

 // Preserve product identity (id + composite key) BEFORE deletion so the events ETL can
 // resolve renamed/sold-out products — otherwise their views orphan and demand undercounts
 // the very items that sold. (sold_items above lacks the id needed to match a view/click.)
 if (titles.length > 0) {
 await sql`
 INSERT INTO product_history (id, store_slug, composite_id, title, description, shopify_product_id, price, currency, archived_at)
 SELECT p.id, p.store_slug, p.store_slug || '-' || p.id::text, p.title, p.description, p.shopify_product_id, p.price, p.currency, NOW()
 FROM products p
 WHERE p.store_slug = ${storeSlug} AND p.title != ALL(${titles})
 ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, price = EXCLUDED.price, currency = EXCLUDED.currency, archived_at = NOW()
 `.catch((e) => console.error("[sync] product_history archive failed:", e));
 }

 // Remove products that are no longer in the feed.
 // Skip deletion entirely when 0 products come back — that almost always means
 // a transient API failure (rate limit, brief outage, empty JSON response).
 // Deleting all rows in that case would make every product look brand-new on
 // the next successful sync. If a store genuinely goes to 0 products, use the
 // manual purge in /admin/sync.
 if (titles.length > 0) {
 await sql`
 DELETE FROM products
 WHERE store_slug = ${storeSlug}
 AND title != ALL(${titles})
 `;
 }

 return { count: products.length, inserted: insertedCount, updated: updatedCount, priceDrops };
}

/**
 * Get all products for a specific store.
 */
export async function getProductsByStore(storeSlug: string): Promise<DBProduct[]> {
 const sql = neon(getDatabaseUrl());

 const result = await sql`
 SELECT * FROM products
 WHERE store_slug = ${storeSlug}
 AND (store_slug != ALL(${SHOPIFY_STORE_SLUGS}) OR collabs_link IS NOT NULL)
 AND title NOT ILIKE '%gift card%'
 AND image IS NOT NULL AND image != ''
 ORDER BY id
 `;
 return result as DBProduct[];
}

/**
 * Get a single product by its database ID
 */
export async function getProductById(id: number): Promise<DBProduct | null> {
 const sql = neon(getDatabaseUrl());

 const result = await sql`
 SELECT * FROM products
 WHERE id = ${id}
 AND (store_slug != ALL(${SHOPIFY_STORE_SLUGS}) OR collabs_link IS NOT NULL)
 AND (${DISABLED_STORE_SLUGS.length} = 0 OR store_slug != ALL(${DISABLED_STORE_SLUGS}))
 LIMIT 1
 `;
 return (result[0] as DBProduct) ?? null;
}

/**
 * Get all products from all stores.
 */
const _getAllProductsUncached = async (): Promise<DBProduct[]> => {
 const sql = neon(getDatabaseUrl());
 const query = async () => sql`
 SELECT * FROM products
 WHERE (store_slug != ALL(${SHOPIFY_STORE_SLUGS}) OR collabs_link IS NOT NULL)
 AND title NOT ILIKE '%gift card%'
 AND image IS NOT NULL AND image != ''
 AND (${DISABLED_STORE_SLUGS.length} = 0 OR store_slug != ALL(${DISABLED_STORE_SLUGS}))
 ORDER BY store_slug, id
 `;
 try {
 return (await query()) as DBProduct[];
 } catch (err) {
 if (err instanceof TypeError && err.message.includes("fetch failed")) {
 await new Promise((r) => setTimeout(r, 2000));
 return (await query()) as DBProduct[];
 }
 throw err;
 }
};

// Not cached — result exceeds Next.js 2MB unstable_cache limit
export const getAllProducts = _getAllProductsUncached;

// Idempotently ensure products.size_keys exists. initDatabase only runs during
// syncs, but the public list endpoints reference size_keys on every request —
// and Postgres validates the column at parse time even when the size filter is
// off — so they must guarantee it exists first. Memoised: the ALTER runs once
// per server instance, then this resolves instantly.
let _sizeKeysEnsured: Promise<void> | null = null;
export function ensureSizeKeysColumn(): Promise<void> {
 if (!_sizeKeysEnsured) {
 const sql = neon(getDatabaseUrl());
 _sizeKeysEnsured = (async () => {
 await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS size_keys TEXT[]`;
 await sql`CREATE INDEX IF NOT EXISTS idx_products_size_keys ON products USING GIN (size_keys)`;
 })().catch((e) => {
 _sizeKeysEnsured = null; // allow retry on the next request
 throw e;
 });
 }
 return _sizeKeysEnsured;
}

/**
 * Get recommended products, excluding a specific product by ID.
 * Uses random row sampling (no full-table sort) for speed, then limits.
 */
export async function getRecommendedProducts(
 excludeId: number,
 limit: number = 20
): Promise<DBProduct[]> {
 const sql = neon(getDatabaseUrl());

 const result = await sql`
 SELECT * FROM products TABLESAMPLE BERNOULLI(50)
 WHERE id != ${excludeId}
 AND (store_slug != ALL(${SHOPIFY_STORE_SLUGS}) OR collabs_link IS NOT NULL)
 AND title NOT ILIKE '%gift card%'
 AND image IS NOT NULL AND image != ''
 AND (${DISABLED_STORE_SLUGS.length} = 0 OR store_slug != ALL(${DISABLED_STORE_SLUGS}))
 LIMIT ${limit}
 `;
 return result as DBProduct[];
}

/**
 * Get products matching a title keyword (brand name, item type, etc.)
 * Used to seed the recommendation pool with contextually relevant items.
 */
export async function getProductsByTitleKeyword(
 keyword: string,
 excludeId: number,
 limit: number = 40
): Promise<DBProduct[]> {
 const sql = neon(getDatabaseUrl());
 const pattern = `%${keyword}%`;
 const result = await sql`
 SELECT * FROM products
 WHERE id != ${excludeId}
 AND title ILIKE ${pattern}
 AND (store_slug != ALL(${SHOPIFY_STORE_SLUGS}) OR collabs_link IS NOT NULL)
 AND title NOT ILIKE '%gift card%'
 AND image IS NOT NULL AND image != ''
 AND (${DISABLED_STORE_SLUGS.length} = 0 OR store_slug != ALL(${DISABLED_STORE_SLUGS}))
 LIMIT ${limit}
 `;
 return result as DBProduct[];
}

/**
 * Get recently added products (new arrivals).
 * maxPerStore caps results per store for diversity (use 2 for homepage carousel, large number for full page).
 */
const _getNewArrivalsUncached = async (limit: number, days: number, maxPerStore = 2): Promise<DBProduct[]> => {
 // Degrade to empty when no DB is configured (e.g. a preview build without DATABASE_URL),
 // so the ISR homepage can still prerender instead of crashing the build.
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return [];
 const sql = neon(dbUrl);
 try {
 const result = await sql`
 WITH click_counts AS (
 SELECT store_slug, product_name, COUNT(*)::int AS click_count
 FROM clicks
 GROUP BY store_slug, product_name
 ),
 pool AS (
 SELECT p.*,
 COALESCE(cc.click_count, 0) AS click_count,
 ROW_NUMBER() OVER (
 PARTITION BY p.store_slug
 ORDER BY p.created_at DESC, p.id DESC
 ) AS store_rank
 FROM products p
 LEFT JOIN click_counts cc
 ON cc.store_slug = p.store_slug AND cc.product_name = p.title
 WHERE p.created_at IS NOT NULL
 AND p.created_at >= NOW() - make_interval(days => ${days})
 AND p.title NOT ILIKE '%gift card%'
 AND p.image IS NOT NULL AND p.image != ''
 AND (${DISABLED_STORE_SLUGS.length} = 0 OR p.store_slug != ALL(${DISABLED_STORE_SLUGS}))
 AND p.store_slug != ALL(${NEW_ARRIVALS_EXCLUDED_SLUGS})
 AND (p.store_slug != ALL(${SHOPIFY_STORE_SLUGS}) OR p.collabs_link IS NOT NULL)
 )
 SELECT * FROM pool
 WHERE store_rank <= ${maxPerStore}
 ORDER BY created_at DESC, id DESC
 LIMIT ${limit}
 `;
 return result as DBProduct[];
 } catch {
 return [];
 }
};

export const getNewArrivals = unstable_cache(
 _getNewArrivalsUncached,
 ["new-arrivals"],
 { revalidate: 600 } // 10 minutes
);


/**
 * Get brand counts directly from the DB (fast aggregation, no full table scan in JS).
 */
export async function getBrandCounts(): Promise<Array<{ brand: string; count: number }>> {
 const sql = neon(getDatabaseUrl());
 try {
 const result = await sql`
 SELECT brand, COUNT(*)::int AS count
 FROM products
 WHERE brand IS NOT NULL
 AND (shopify_product_id IS NULL OR collabs_link IS NOT NULL)
 AND title NOT ILIKE '%gift card%'
 GROUP BY brand
 ORDER BY count DESC
 `;
 return result as Array<{ brand: string; count: number }>;
 } catch {
 return [];
 }
}

/**
 * Get list of all synced stores
 */
export async function getSyncedStores(): Promise<
 Array<{ store_slug: string; store_name: string; product_count: number; last_synced: Date }>
> {
 const sql = neon(getDatabaseUrl());

 const result = await sql`
 SELECT
 store_slug,
 store_name,
 COUNT(*) as product_count,
 MAX(synced_at) as last_synced
 FROM products
 GROUP BY store_slug, store_name
 ORDER BY store_name
 `;
 return result as any;
}

/**
 * Update the collabs_link for a product by its database ID.
 * Called by the admin generate-collabs-links endpoint.
 */
export async function updateCollabsLink(id: number, collabsLink: string): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await sql`
 UPDATE products SET collabs_link = ${collabsLink} WHERE id = ${id}
 `;
}

/**
 * Get all products for Collabs-enabled stores that have a shopify_product_id
 * but no collabs_link yet. Optionally filtered to a specific store.
 */
export async function getProductsMissingCollabsLink(storeSlug?: string): Promise<DBProduct[]> {
 const sql = neon(getDatabaseUrl());
 const result = storeSlug
 ? await sql`
 SELECT * FROM products
 WHERE store_slug = ${storeSlug}
 AND shopify_product_id IS NOT NULL
 AND collabs_link IS NULL
 ORDER BY id
 `
 : await sql`
 SELECT * FROM products
 WHERE shopify_product_id IS NOT NULL
 AND collabs_link IS NULL
 ORDER BY store_slug, id
 `;
 return result as DBProduct[];
}

/**
 * Delete products that have a shopify_product_id but no collabs_link and
 * no created_at (meaning they predate Collabs support and have never been
 * visible on VYA). Safe to remove — they'll be re-added by the next sync
 * if the store enrolls them in Collabs.
 */
export async function deletePermanentlyStuckProducts(storeSlug?: string, minDaysStuck?: number): Promise<number> {
 const sql = neon(getDatabaseUrl());
 // minDaysStuck: also purge products stuck without a collabs link for this many days
 // (likely sold-out items Shopify still lists as available but Collabs excludes)
 if (minDaysStuck) {
 const result = storeSlug
 ? await sql`
 DELETE FROM products
 WHERE store_slug = ${storeSlug}
 AND shopify_product_id IS NOT NULL
 AND collabs_link IS NULL
 AND (
 created_at IS NULL
 OR created_at < NOW() - (${minDaysStuck} || ' days')::interval
 )
 RETURNING id
 `
 : await sql`
 DELETE FROM products
 WHERE shopify_product_id IS NOT NULL
 AND collabs_link IS NULL
 AND (
 created_at IS NULL
 OR created_at < NOW() - (${minDaysStuck} || ' days')::interval
 )
 RETURNING id
 `;
 return result.length;
 }
 const result = storeSlug
 ? await sql`
 DELETE FROM products
 WHERE store_slug = ${storeSlug}
 AND shopify_product_id IS NOT NULL
 AND collabs_link IS NULL
 AND created_at IS NULL
 RETURNING id
 `
 : await sql`
 DELETE FROM products
 WHERE shopify_product_id IS NOT NULL
 AND collabs_link IS NULL
 AND created_at IS NULL
 RETURNING id
 `;
 return result.length;
}

/**
 * Look up the collabs_link for a product by its database ID.
 * Returns null if the product doesn't exist or has no collabs_link.
 */
export async function getCollabsLink(id: number): Promise<string | null> {
 const sql = neon(getDatabaseUrl());
 const result = await sql`
 SELECT collabs_link FROM products WHERE id = ${id} LIMIT 1
 `;
 return (result[0]?.collabs_link as string | null) ?? null;
}

/**
 * Get per-store breakdown of shopify_product_id and collabs_link coverage.
 * Used for debugging sync issues.
 */
export async function getShopifyIdCoverage(
 storeSlugs: string[]
): Promise<Record<string, { total: number; withId: number; withoutId: number; withCollabsLink: number }>> {
 const sql = neon(getDatabaseUrl());
 if (storeSlugs.length === 0) return {};
 const rows = await sql`
 SELECT
 store_slug,
 COUNT(*)::int AS total,
 COUNT(*) FILTER (WHERE shopify_product_id IS NOT NULL)::int AS with_id,
 COUNT(*) FILTER (WHERE shopify_product_id IS NULL)::int AS without_id,
 COUNT(*) FILTER (WHERE collabs_link IS NOT NULL)::int AS with_collabs_link
 FROM products
 WHERE store_slug = ANY(${storeSlugs})
 GROUP BY store_slug
 `;
 const result: Record<string, { total: number; withId: number; withoutId: number; withCollabsLink: number }> = {};
 for (const row of rows) {
 result[row.store_slug as string] = {
 total: row.total as number,
 withId: row.with_id as number,
 withoutId: row.without_id as number,
 withCollabsLink: row.with_collabs_link as number,
 };
 }
 return result;
}

/**
 * Get any collabs link for a given store slug.
 * Used to extract the dt_id tracking parameter for cart checkout URLs.
 */
export async function getAnyCollabsLinkForStore(storeSlug: string): Promise<string | null> {
 const sql = neon(getDatabaseUrl());
 const result = await sql`
 SELECT collabs_link FROM products
 WHERE store_slug = ${storeSlug} AND collabs_link IS NOT NULL
 LIMIT 1
 `;
 return (result[0]?.collabs_link as string | null) ?? null;
}

/**
 * Get sample products that have collabs links, for verification.
 */
export async function getProductsWithCollabsLinks(storeSlug?: string, limit = 5): Promise<DBProduct[]> {
 const sql = neon(getDatabaseUrl());
 const result = storeSlug
 ? await sql`
 SELECT * FROM products
 WHERE store_slug = ${storeSlug}
 AND collabs_link IS NOT NULL
 ORDER BY id
 LIMIT ${limit}
 `
 : await sql`
 SELECT * FROM products
 WHERE collabs_link IS NOT NULL
 ORDER BY store_slug, id
 LIMIT ${limit}
 `;
 return result as DBProduct[];
}

/**
 * Update the collabs_link for a product by its Shopify product ID.
 * Used when importing links generated from the Collabs browser script.
 */
export async function updateCollabsLinkByShopifyProductId(
 shopifyProductId: string,
 collabsLink: string
): Promise<void> {
 const sql = neon(getDatabaseUrl());
 // Only update rows that don't already have a collabs_link.
 // collabs_link_set_at = NOW() only if created_at is within the last 14 days
 // (genuinely new product). Older products get collabs_link_set_at = created_at
 // so they don't flood new arrivals when links are batch-generated.
 await sql`
 UPDATE products
 SET collabs_link = ${collabsLink},
 collabs_link_set_at = CASE
 WHEN created_at >= NOW() - INTERVAL '14 days' THEN NOW()
 ELSE COALESCE(created_at, NOW() - INTERVAL '1 year')
 END
 WHERE shopify_product_id = ${shopifyProductId}
 AND collabs_link IS NULL
 `;
}
