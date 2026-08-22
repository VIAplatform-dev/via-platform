import { neon } from "@neondatabase/serverless";
import { getProductFavoriteCounts } from "./favorites-db";
import { canonicalStoreSlug, convertCurrencyToUSD, stores } from "./stores";

const getDatabaseUrl = () => {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) {
 throw new Error("DATABASE_URL or POSTGRES_URL environment variable is not set.");
 }
 return url;
};

// Run the ~30 DDL statements below at most once per lambda instance, not on every hot-path
// call (saveClick/saveConversion/analytics reads all invoke this). Matches favorites-db.ts.
let analyticsTablesInitialized = false;

export async function initAnalyticsTables() {
 if (analyticsTablesInitialized) return;
 const sql = neon(getDatabaseUrl());

 await sql`
 CREATE TABLE IF NOT EXISTS product_views (
 id SERIAL PRIMARY KEY,
 product_id VARCHAR(255) NOT NULL,
 timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_product_views_product_id ON product_views(product_id)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_product_views_timestamp ON product_views(timestamp)`;
 await sql`ALTER TABLE product_views ADD COLUMN IF NOT EXISTS user_id TEXT`;
 await sql`CREATE INDEX IF NOT EXISTS idx_product_views_user_id ON product_views(user_id) WHERE user_id IS NOT NULL`;

 await sql`
 CREATE TABLE IF NOT EXISTS clicks (
 id SERIAL PRIMARY KEY,
 click_id VARCHAR(32) NOT NULL UNIQUE,
 timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
 product_id VARCHAR(255) NOT NULL DEFAULT 'unknown',
 product_name TEXT NOT NULL DEFAULT 'unknown',
 store VARCHAR(255) NOT NULL DEFAULT 'unknown',
 store_slug VARCHAR(255) NOT NULL DEFAULT 'unknown',
 external_url TEXT NOT NULL,
 user_agent TEXT
 )
 `;

 await sql`CREATE INDEX IF NOT EXISTS idx_clicks_timestamp ON clicks(timestamp)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_clicks_store ON clicks(store)`;

 await sql`
 CREATE TABLE IF NOT EXISTS conversions (
 id SERIAL PRIMARY KEY,
 conversion_id VARCHAR(64) NOT NULL UNIQUE,
 timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
 order_id VARCHAR(255) NOT NULL,
 order_total NUMERIC(10,2) NOT NULL DEFAULT 0,
 currency VARCHAR(10) NOT NULL DEFAULT 'USD',
 items JSONB DEFAULT '[]',
 via_click_id VARCHAR(32),
 store_slug VARCHAR(255) NOT NULL,
 store_name VARCHAR(255) NOT NULL,
 matched BOOLEAN DEFAULT FALSE,
 matched_click_data JSONB
 )
 `;

 await sql`CREATE INDEX IF NOT EXISTS idx_conversions_timestamp ON conversions(timestamp)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_conversions_store ON conversions(store_slug)`;
 await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversions_order_store ON conversions(order_id, store_slug)`;

 // Tombstones for manually-deleted conversions — so a re-sync never re-creates
 // an order an admin intentionally removed.
 await sql`
 CREATE TABLE IF NOT EXISTS suppressed_conversions (
 order_id VARCHAR(255) NOT NULL,
 store_slug VARCHAR(255) NOT NULL,
 suppressed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
 PRIMARY KEY (order_id, store_slug)
 )
 `;

 // Migrations: add user_id to clicks and conversions (safe to run repeatedly)
 await sql`ALTER TABLE clicks ADD COLUMN IF NOT EXISTS user_id TEXT`;
 await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS user_id TEXT`;
 await sql`CREATE INDEX IF NOT EXISTS idx_clicks_user_id ON clicks(user_id) WHERE user_id IS NOT NULL`;
 await sql`CREATE INDEX IF NOT EXISTS idx_conversions_user_id ON conversions(user_id) WHERE user_id IS NOT NULL`;
 // Migration: store all cart items for multi-item checkouts
 await sql`ALTER TABLE clicks ADD COLUMN IF NOT EXISTS cart_items JSONB`;
 // Migration: store UTM source on clicks for source attribution
 await sql`ALTER TABLE clicks ADD COLUMN IF NOT EXISTS utm_source TEXT`;
 await sql`CREATE INDEX IF NOT EXISTS idx_clicks_utm_source ON clicks(utm_source) WHERE utm_source IS NOT NULL`;
 // Migration: utm_medium too, so paid vs organic can be split (built going forward).
 await sql`ALTER TABLE clicks ADD COLUMN IF NOT EXISTS utm_medium TEXT`;
 // Migration: conversions are always stored in USD (order_total/currency); the
 // seller's original local amount/currency is preserved here for audit.
 await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS original_total NUMERIC(10,2)`;
 await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS original_currency VARCHAR(10)`;
 // Buyer email for the store's sales list (Square sends it on the payment object;
 // Shopify/Wix via the order webhook). Stored per-conversion so every source is covered.
 await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS customer_email TEXT`;
 // Refund/return flag — created here (canonical) so the events ETL and admin market
 // queries that filter on it never hit a missing column on a fresh DB.
 await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS returned BOOLEAN`;
 analyticsTablesInitialized = true;
}

export type CartItemSnapshot = {
 id: string;
 name: string;
 price: number;
};

export type ClickRecord = {
 clickId: string;
 timestamp: string;
 productId: string;
 productName: string;
 store: string;
 storeSlug: string;
 externalUrl: string;
 userAgent?: string;
 userId?: string | null;
 cartItems?: CartItemSnapshot[];
 utmSource?: string | null;
 utmMedium?: string | null;
};

export async function saveClick(click: ClickRecord): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();

 const cartItemsJson = click.cartItems ? JSON.stringify(click.cartItems) : null;
 const storeSlug = canonicalStoreSlug(click.storeSlug);
 await sql`
 INSERT INTO clicks (click_id, timestamp, product_id, product_name, store, store_slug, external_url, user_agent, user_id, cart_items, utm_source, utm_medium)
 VALUES (${click.clickId}, ${click.timestamp}, ${click.productId}, ${click.productName}, ${click.store}, ${storeSlug}, ${click.externalUrl}, ${click.userAgent || null}, ${click.userId || null}, ${cartItemsJson}, ${click.utmSource || null}, ${click.utmMedium || null})
 ON CONFLICT (click_id) DO NOTHING
 `;
}

export async function getClickByClickId(clickId: string): Promise<ClickRecord | null> {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();

 const rows = await sql`
 SELECT * FROM clicks WHERE click_id = ${clickId} LIMIT 1
 `;

 if (rows.length === 0) return null;
 return mapClickRow(rows[0]);
}

export async function getClickAnalytics(range: string) {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();

 let cutoff: string | null = null;
 if (range === "7d") {
 cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
 } else if (range === "30d") {
 cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
 }

 // Total clicks
 const countResult = cutoff
 ? await sql`SELECT COUNT(*)::int AS total FROM clicks WHERE timestamp >= ${cutoff}`
 : await sql`SELECT COUNT(*)::int AS total FROM clicks`;
 const totalClicks = countResult[0].total as number;

 // Clicks by store
 const storeRows = cutoff
 ? await sql`SELECT store, COUNT(*)::int AS count FROM clicks WHERE timestamp >= ${cutoff} GROUP BY store ORDER BY count DESC`
 : await sql`SELECT store, COUNT(*)::int AS count FROM clicks GROUP BY store ORDER BY count DESC`;
 const clicksByStore: Record<string, number> = {};
 for (const row of storeRows) {
 clicksByStore[row.store as string] = row.count as number;
 }

 // Top 10 products
 const productRows = cutoff
 ? await sql`SELECT product_id, product_name, store, COUNT(*)::int AS count FROM clicks WHERE timestamp >= ${cutoff} GROUP BY product_id, product_name, store ORDER BY count DESC LIMIT 10`
 : await sql`SELECT product_id, product_name, store, COUNT(*)::int AS count FROM clicks GROUP BY product_id, product_name, store ORDER BY count DESC LIMIT 10`;
 const topProducts = productRows.map((row) => ({
 id: row.product_id as string,
 name: row.product_name as string,
 store: row.store as string,
 count: row.count as number,
 }));

 // Recent 50 clicks
 const recentRows = cutoff
 ? await sql`SELECT * FROM clicks WHERE timestamp >= ${cutoff} ORDER BY timestamp DESC LIMIT 50`
 : await sql`SELECT * FROM clicks ORDER BY timestamp DESC LIMIT 50`;
 const recentClicks = recentRows.map(mapClickRow);

 return { totalClicks, clicksByStore, topProducts, recentClicks, range };
}

export type ConversionRecord = {
 conversionId: string;
 timestamp: string;
 orderId: string;
 orderTotal: number;
 currency: string;
 items: ConversionItem[];
 viaClickId: string | null;
 storeSlug: string;
 storeName: string;
 matched: boolean;
 userId?: string | null;
 customerEmail?: string | null;
 matchedClickData?: {
 clickId?: string;
 clickTimestamp?: string;
 productName?: string;
 source?: string;
 userId?: string;
 buyerEmail?: string;
 };
};

type ConversionItem = {
 productId?: string;
 productName: string;
 quantity: number;
 price: number;
};

export async function saveConversion(conversion: ConversionRecord): Promise<{ duplicate: boolean }> {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();

 // Normalize to the canonical store slug so dedup, analytics, and email lookups all match.
 const storeSlug = canonicalStoreSlug(conversion.storeSlug);

 // Suppression tombstone: if an admin manually deleted this order, never re-create it.
 // Re-syncs (Carroll/Nello/Square order pulls, webhooks) call saveConversion again on
 // every run — without this check a deleted conversion silently reappears.
 const suppressed = await sql`
 SELECT 1 FROM suppressed_conversions WHERE order_id = ${conversion.orderId} AND store_slug = ${storeSlug} LIMIT 1
 `;
 if (suppressed.length > 0) {
 return { duplicate: true };
 }

 // Always store conversions in USD. Non-US stores capture in their local currency
 // (GBP/EUR/CAD/AUD); convert here so the conversions table + all revenue analytics
 // are apples-to-apples. The original amount/currency is preserved for audit.
 const origCurrency = conversion.currency || "USD";
 const origTotal = conversion.orderTotal;
 const usdTotal = origCurrency === "USD" ? origTotal : convertCurrencyToUSD(origTotal, origCurrency);

 // Check for duplicate
 const existing = await sql`
 SELECT id, order_total FROM conversions WHERE order_id = ${conversion.orderId} AND store_slug = ${storeSlug} LIMIT 1
 `;
 if (existing.length > 0) {
 // If the first webhook saved with total=0 (a placeholder, before the real total was known)
 // and we now have the real (USD) total, correct it once. Deliberately NOT "any higher total
 // wins" — this endpoint is reachable from untrusted store-side callers (see /api/conversion),
 // and an unbounded upgrade would let a replayed request with an inflated orderTotal overwrite
 // an already-real total. Only a genuine $0→real correction is allowed; a real total is final.
 const existingTotal = Number(existing[0].order_total ?? 0);
 if (existingTotal === 0 && usdTotal > 0) {
 await sql`
 UPDATE conversions
 SET order_total = ${usdTotal}, currency = 'USD', original_total = ${origTotal}, original_currency = ${origCurrency}
 WHERE order_id = ${conversion.orderId} AND store_slug = ${storeSlug}
 `;
 }
 return { duplicate: true };
 }

 await sql`
 INSERT INTO conversions (conversion_id, timestamp, order_id, order_total, currency, original_total, original_currency, items, via_click_id, store_slug, store_name, matched, matched_click_data, user_id, customer_email)
 VALUES (
 ${conversion.conversionId},
 ${conversion.timestamp},
 ${conversion.orderId},
 ${usdTotal},
 'USD',
 ${origTotal},
 ${origCurrency},
 ${JSON.stringify(conversion.items)},
 ${conversion.viaClickId},
 ${storeSlug},
 ${conversion.storeName},
 ${conversion.matched},
 ${conversion.matchedClickData ? JSON.stringify(conversion.matchedClickData) : null},
 ${conversion.userId || null},
 ${conversion.customerEmail || conversion.matchedClickData?.buyerEmail || null}
 )
 `;

 await recordConfirmedSales({ storeSlug, storeName: conversion.storeName, orderId: conversion.orderId, currency: origCurrency, soldAt: conversion.timestamp, items: conversion.items }).catch(() => {});
 return { duplicate: false };
}

let confirmedColEnsured = false;

/**
 * A confirmed order is the truest price label there is: what a piece ACTUALLY sold for. The matching
 * sold_items row (captured when the piece dropped off the store feed) already carries the LISTED
 * price PLUS the photo + embedding the price eval needs — so we upgrade THAT row in place to the real
 * sold price and flag it `confirmed`. That turns the price answer-key from a guess into a receipt.
 *
 * Deliberately UPDATE-only (never an INSERT): the rows worth correcting are the ones with photos, and
 * they already exist. It's fully isolated — its own try/catch per line, it only ever touches an
 * unconfirmed row it matches by store + title, writes columns known to exist, and never blocks the
 * order/conversion flow. A sale of something never in our feed simply counts as `unmatched`.
 */
export async function recordConfirmedSales(o: {
 storeSlug: string; storeName: string; orderId: string; currency: string; soldAt: string; items: ConversionItem[];
}): Promise<{ upgraded: number; unmatched: number }> {
 const sql = neon(getDatabaseUrl());
 if (!confirmedColEnsured) {
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false`.catch(() => {});
 confirmedColEnsured = true;
 }
 const cur = (o.currency || "USD").toUpperCase();
 let upgraded = 0, unmatched = 0;
 for (const it of o.items || []) {
 const title = (it.productName || "").trim();
 const priceUsd = cur === "USD" ? it.price : convertCurrencyToUSD(it.price, cur);
 if (!title || !(priceUsd > 0)) continue;
 try {
 // Upgrade the most-recent matching inferred row to the REAL sold price (keeps its photo+embedding).
 // original_price is left alone — it's the listed price; final_price now holds what it truly sold for.
 const up = await sql`
  UPDATE sold_items SET final_price = ${priceUsd}, confirmed = true, sold_at = ${o.soldAt}
  WHERE id = (
   SELECT id FROM sold_items
   WHERE store_slug = ${o.storeSlug} AND lower(title) = lower(${title}) AND confirmed = false
   ORDER BY sold_at DESC LIMIT 1
  )
  RETURNING id
 `;
 if (up.length) upgraded++; else unmatched++;
 } catch { /* isolated — one bad line never breaks the order flow */ }
 }
 return { upgraded, unmatched };
}

// Resolve an email to a VYA account id (for per-recipient email-link attribution).
// Returns null when no account exists for that email (e.g. newsletter-only subscriber).
export async function getUserIdByEmail(email: string): Promise<string | null> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1`.catch(() => []);
 return rows[0]?.id ? String(rows[0].id) : null;
}

// Tombstone an order so future re-syncs never re-create it. Call this whenever a
// conversion is intentionally deleted.
export async function suppressConversion(orderId: string, storeSlug: string): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();
 await sql`
 INSERT INTO suppressed_conversions (order_id, store_slug)
 VALUES (${orderId}, ${canonicalStoreSlug(storeSlug)})
 ON CONFLICT (order_id, store_slug) DO NOTHING
 `;
}

export async function getConversionAnalytics(range: string) {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();

 let cutoff: string | null = null;
 if (range === "7d") {
 cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
 } else if (range === "30d") {
 cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
 }

 const rows = cutoff
 ? await sql`SELECT * FROM conversions WHERE order_total > 0 AND timestamp >= ${cutoff} ORDER BY timestamp DESC`
 : await sql`SELECT * FROM conversions WHERE order_total > 0 ORDER BY timestamp DESC`;

 const conversions = rows.map(mapConversionRow);

 const totalConversions = conversions.length;
 const matchedConversions = conversions.filter((c) => c.matched).length;
 const totalRevenue = conversions.reduce((sum, c) => sum + c.orderTotal, 0);
 const matchedRevenue = conversions
 .filter((c) => c.matched)
 .reduce((sum, c) => sum + c.orderTotal, 0);

 const revenueByStore: Record<string, { total: number; matched: number; count: number }> = {};
 for (const conv of conversions) {
 if (!revenueByStore[conv.storeName]) {
 revenueByStore[conv.storeName] = { total: 0, matched: 0, count: 0 };
 }
 revenueByStore[conv.storeName].total += conv.orderTotal;
 revenueByStore[conv.storeName].count++;
 if (conv.matched) {
 revenueByStore[conv.storeName].matched += conv.orderTotal;
 }
 }

 const recentConversions = conversions.slice(0, 20);

 return {
 totalConversions,
 matchedConversions,
 totalRevenue,
 matchedRevenue,
 revenueByStore,
 recentConversions,
 range,
 };
}

/**
 * Record a product page view. Called fire-and-forget from the product page.
 */
let productViewsReady = false;
export async function saveProductView(productId: string, userId?: string | null): Promise<void> {
 const sql = neon(getDatabaseUrl());
 // Ensure schema once per lambda instance — not 3 DDL statements on every single page view.
 if (!productViewsReady) {
 await sql`
 CREATE TABLE IF NOT EXISTS product_views (
 id SERIAL PRIMARY KEY,
 product_id VARCHAR(255) NOT NULL,
 timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_product_views_product_id ON product_views(product_id)`;
 await sql`ALTER TABLE product_views ADD COLUMN IF NOT EXISTS user_id TEXT`;
 productViewsReady = true;
 }
 await sql`INSERT INTO product_views (product_id, user_id) VALUES (${productId}, ${userId ?? null})`;
}

/**
 * Compute popularity scores for a set of products.
 * Returns a map of dbId -> score.
 */
export async function getProductPopularityScores(
 dbIds: number[]
): Promise<Record<number, number>> {
 if (dbIds.length === 0) return {};

 const sql = neon(getDatabaseUrl());

 // Look up composite IDs (store_slug-id) for these DB IDs
 const productRows = await sql`
 SELECT id, store_slug FROM products WHERE id = ANY(${dbIds})
 `;
 const compositeIdMap = new Map<string, number>(); // compositeId -> dbId
 for (const row of productRows) {
 const compositeId = `${row.store_slug}-${row.id}`;
 compositeIdMap.set(compositeId, row.id as number);
 }

 const compositeIds = Array.from(compositeIdMap.keys());
 if (compositeIds.length === 0) return {};

 const now = Date.now();
 const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
 const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
 const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

 const [clickRows, favCounts, conversionRows, viewRows] = await Promise.all([
 // Clicks with recency weighting (strong signal: user went to buy)
 sql`
 SELECT product_id,
 SUM(CASE WHEN timestamp >= ${sevenDaysAgo}::timestamptz THEN 3
 WHEN timestamp >= ${thirtyDaysAgo}::timestamptz THEN 2
 ELSE 1 END)::int AS score
 FROM clicks
 WHERE product_id = ANY(${compositeIds})
 GROUP BY product_id
 `,
 // Favorites
 getProductFavoriteCounts(dbIds),
 // Conversions
 sql`
 SELECT item->>'productId' AS product_id, COUNT(*)::int AS count
 FROM conversions, jsonb_array_elements(items) AS item
 WHERE timestamp >= ${ninetyDaysAgo}::timestamptz
 AND item->>'productId' = ANY(${compositeIds})
 GROUP BY item->>'productId'
 `,
 // Page views with recency weighting (softer signal: user was interested)
 sql`
 SELECT product_id,
 SUM(CASE WHEN timestamp >= ${sevenDaysAgo}::timestamptz THEN 2
 WHEN timestamp >= ${thirtyDaysAgo}::timestamptz THEN 1
 ELSE 0 END)::int AS score
 FROM product_views
 WHERE product_id = ANY(${compositeIds})
 GROUP BY product_id
 `.catch(() => [] as { product_id: string; score: number }[]),
 ]);

 const scores: Record<number, number> = {};

 // Click scores (high intent: user went to buy)
 for (const row of clickRows) {
 const dbId = compositeIdMap.get(row.product_id as string);
 if (dbId != null) {
 scores[dbId] = (scores[dbId] ?? 0) + (row.score as number);
 }
 }

 // Favorite scores (3 pts each)
 for (const [dbId, count] of Object.entries(favCounts)) {
 const id = Number(dbId);
 scores[id] = (scores[id] ?? 0) + count * 3;
 }

 // Conversion scores (5 pts each)
 for (const row of conversionRows) {
 const dbId = compositeIdMap.get(row.product_id as string);
 if (dbId != null) {
 scores[dbId] = (scores[dbId] ?? 0) + (row.count as number) * 5;
 }
 }

 // Page view scores (lower weight than clicks — interest signal only)
 for (const row of viewRows) {
 const dbId = compositeIdMap.get((row as { product_id: string; score: number }).product_id);
 if (dbId != null) {
 scores[dbId] = (scores[dbId] ?? 0) + ((row as { product_id: string; score: number }).score ?? 0);
 }
 }

 return scores;
}

export async function getStoreAnalytics(storeSlug: string, range: string) {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();

 let cutoff: string | null = null;
 if (range === "7d") {
 cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
 } else if (range === "30d") {
 cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
 }

 const [clickCountRows, viewCountRows, topProductRows, recentClickRows, conversionRows, itemsSoldRows, topSearchRows] = await Promise.all([
 cutoff
 ? sql`SELECT COUNT(*)::int AS total FROM clicks WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff}`
 : sql`SELECT COUNT(*)::int AS total FROM clicks WHERE store_slug = ${storeSlug}`,
 cutoff
 ? sql`SELECT COUNT(*)::int AS total FROM product_views pv JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id WHERE p.store_slug = ${storeSlug} AND pv.timestamp >= ${cutoff}`
 : sql`SELECT COUNT(*)::int AS total FROM product_views pv JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id WHERE p.store_slug = ${storeSlug}`,
 cutoff
 ? sql`SELECT product_name, COUNT(*)::int AS count FROM clicks WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff} GROUP BY product_name ORDER BY count DESC LIMIT 10`
 : sql`SELECT product_name, COUNT(*)::int AS count FROM clicks WHERE store_slug = ${storeSlug} GROUP BY product_name ORDER BY count DESC LIMIT 10`,
 cutoff
 ? sql`SELECT * FROM clicks WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff} ORDER BY timestamp DESC LIMIT 20`
 : sql`SELECT * FROM clicks WHERE store_slug = ${storeSlug} ORDER BY timestamp DESC LIMIT 20`,
 cutoff
 ? sql`SELECT * FROM conversions WHERE REGEXP_REPLACE(store_slug, '[^a-z0-9-]', '', 'g') = ${storeSlug} AND order_total > 0 AND (returned IS NULL OR returned = false) AND timestamp >= ${cutoff} ORDER BY timestamp DESC`
 : sql`SELECT * FROM conversions WHERE REGEXP_REPLACE(store_slug, '[^a-z0-9-]', '', 'g') = ${storeSlug} AND order_total > 0 AND (returned IS NULL OR returned = false) ORDER BY timestamp DESC`,
 cutoff
 ? sql`SELECT item->>'productName' AS product_name, SUM((item->>'quantity')::int)::int AS total_qty FROM conversions, jsonb_array_elements(items) AS item WHERE REGEXP_REPLACE(store_slug, '[^a-z0-9-]', '', 'g') = ${storeSlug} AND order_total > 0 AND (returned IS NULL OR returned = false) AND timestamp >= ${cutoff} GROUP BY item->>'productName' ORDER BY total_qty DESC LIMIT 100`
 : sql`SELECT item->>'productName' AS product_name, SUM((item->>'quantity')::int)::int AS total_qty FROM conversions, jsonb_array_elements(items) AS item WHERE REGEXP_REPLACE(store_slug, '[^a-z0-9-]', '', 'g') = ${storeSlug} AND order_total > 0 AND (returned IS NULL OR returned = false) GROUP BY item->>'productName' ORDER BY total_qty DESC LIMIT 100`,
 // Top searches are site-wide — useful context for stores regardless of range.
 // Normalise (trim/lower) and drop sub-3-char fragments so noisy keystroke
 // prefixes don't outrank real queries; merge case/spacing variants.
 cutoff
 ? sql`SELECT lower(trim(query)) AS query, COUNT(*)::int AS count FROM searches WHERE timestamp >= ${cutoff} AND length(trim(query)) >= 3 GROUP BY lower(trim(query)) ORDER BY count DESC LIMIT 20`.catch(() => [])
 : sql`SELECT lower(trim(query)) AS query, COUNT(*)::int AS count FROM searches WHERE length(trim(query)) >= 3 GROUP BY lower(trim(query)) ORDER BY count DESC LIMIT 20`.catch(() => []),
 ]);

 const totalClicks = clickCountRows[0].total as number;
 const totalViews = viewCountRows[0].total as number;
 const topProducts = topProductRows.map((row) => ({
 name: row.product_name as string,
 count: row.count as number,
 }));
 const recentClicks = recentClickRows.map(mapClickRow);
 const conversions = conversionRows.map(mapConversionRow);
 const totalConversions = conversions.length;
 const totalRevenue = conversions.reduce((sum, c) => sum + c.orderTotal, 0);
 const recentConversions = conversions.slice(0, 20);

 // VYA commission for this store — computed from each order's total in the
 // conversions table, tiered PER ORDER (not on cumulative revenue). Per-order is
 // correct because each sale's rate depends on that order's size, and it lines up
 // with what stores actually earn (e.g. Shopify Collabs payouts).
 const storeCfg = stores.find((s) => s.slug === storeSlug) as { commissionRates?: { upTo?: number; rate: number }[] } | undefined;
 const commissionRates = storeCfg?.commissionRates ?? [{ upTo: 1000, rate: 0.07 }, { upTo: 5000, rate: 0.05 }, { rate: 0.03 }];
 const tieredCommission = (total: number): number => {
 if (!(total > 0)) return 0;
 for (const tier of commissionRates) {
 if (tier.upTo === undefined || total < tier.upTo) return total * tier.rate;
 }
 return total * commissionRates[commissionRates.length - 1].rate;
 };
 const commissionEarned = Math.round(
 conversionRows.reduce((sum, r) => sum + tieredCommission(Number(r.order_total)), 0) * 100
 ) / 100;
 const itemsSold = itemsSoldRows.map((r) => ({
 name: r.product_name as string,
 qty: r.total_qty as number,
 }));
 const topSearches = (topSearchRows as { query: string; count: number }[]).map((r) => ({
 query: r.query,
 count: r.count,
 }));

 // AOV across the WHOLE platform (all stores' orders), not just this store —
 // a benchmark every store sees. Aggregate only, never per-store.
 const aovRows = (await sql`
 SELECT COUNT(*)::int AS n, COALESCE(SUM(order_total), 0)::float AS gmv
 FROM conversions WHERE order_total > 0
 `.catch(() => [{ n: 0, gmv: 0 }])) as Array<{ n: number; gmv: number }>;
 const aov = (aovRows[0]?.n ?? 0) > 0 ? aovRows[0].gmv / aovRows[0].n : 0;

 // What shoppers currently have in their carts from this store (active = added
 // in the last 14 days). Aggregated per product — never a shopper's identity.
 const cartRows = (await sql`
 SELECT product_id, MAX(product_title) AS product_title, MAX(product_image) AS product_image,
  MAX(price) AS price, MAX(currency) AS currency, COUNT(*)::int AS in_carts
 FROM user_cart_items
 WHERE REGEXP_REPLACE(store_slug, '[^a-z0-9-]', '', 'g') = ${storeSlug}
  AND added_at >= NOW() - INTERVAL '14 days'
 GROUP BY product_id
 ORDER BY in_carts DESC, MAX(added_at) DESC
 LIMIT 50
 `.catch(() => [])) as Array<{ product_id: number; product_title: string; product_image: string; price: number; currency: string; in_carts: number }>;
 // Cart prices are shown to the store in USD — convert from each item's own
 // currency (a no-op for USD), so non-US stores see USD just like their revenue.
 const cartItems = cartRows.map((r) => ({
 productId: r.product_id,
 title: r.product_title,
 image: r.product_image,
 price: convertCurrencyToUSD(r.price != null ? Number(r.price) : 0, r.currency ?? "USD"),
 currency: "USD",
 inCarts: r.in_carts,
 }));
 const cartCount = cartItems.reduce((s, i) => s + i.inCarts, 0);
 const cartValue = cartItems.reduce((s, i) => s + i.price * i.inCarts, 0);

 // Per-sale list for the store portal: item(s), buyer email, total, and the VYA
 // commission on that order. Buyer email comes from the order cache (captured on the
 // Shopify/Wix order webhook) joined by order_id — the store sees the email only for
 // its OWN sales (it fulfils the order), never another store's data.
 const emailRows = (await sql`
 SELECT order_id, email FROM shopify_order_cache
 WHERE REGEXP_REPLACE(store_slug, '[^a-z0-9-]', '', 'g') = ${storeSlug} AND email IS NOT NULL
 `.catch(() => [])) as Array<{ order_id: string; email: string }>;
 const emailByOrder = new Map(emailRows.map((r) => [String(r.order_id), r.email]));

 // The matched buyer's VYA account is the most reliable email source — resolve it for
 // every order that attributed to a logged-in shopper. (Buyer of this store's own sale.)
 const userIds = [...new Set(conversions.map((c) => c.userId).filter(Boolean))] as string[];
 const userRows = userIds.length
 ? ((await sql`SELECT id, email FROM users WHERE id::text = ANY(${userIds})`.catch(() => [])) as Array<{ id: string; email: string }>)
 : [];
 const emailByUser = new Map(userRows.map((r) => [String(r.id), r.email]));

 const sales = conversions.slice(0, 200).map((c) => {
 // Item name: prefer the line items; fall back to the matched click's product name
 // (orders synced without line items still know which piece was bought).
 // When Collabs didn't itemize the order, the line item is a generic placeholder
 // ("Item via Shopify Collabs"). If we matched the buyer's click, that click knows
 // the real piece — prefer it over the placeholder.
 const GENERIC_ITEM = "Item via Shopify Collabs";
 const clickProduct = c.matchedClickData?.productName ?? null;
 const items = (c.items ?? []).length
 ? c.items.map((it) => ({
 name: it.productName && it.productName !== GENERIC_ITEM ? it.productName : (clickProduct ?? it.productName),
 quantity: it.quantity,
 }))
 : clickProduct
 ? [{ name: clickProduct, quantity: 1 }]
 : [];
 const customerEmail =
 c.customerEmail ??
 c.matchedClickData?.buyerEmail ??
 (c.userId ? emailByUser.get(String(c.userId)) : null) ??
 emailByOrder.get(String(c.orderId)) ??
 null;
 return {
 conversionId: c.conversionId,
 timestamp: c.timestamp,
 orderId: c.orderId,
 items,
 customerEmail,
 orderTotal: c.orderTotal,
 currency: c.currency,
 commission: Math.round(tieredCommission(c.orderTotal) * 100) / 100,
 };
 });

 return {
 totalClicks,
 totalViews,
 totalConversions,
 totalRevenue,
 aov,
 commissionEarned,
 cartItems,
 cartCount,
 cartValue,
 topProducts,
 recentClicks,
 recentConversions,
 itemsSold,
 topSearches,
 sales,
 range,
 };
}

function mapClickRow(row: Record<string, unknown>): ClickRecord {
 return {
 clickId: row.click_id as string,
 timestamp: (row.timestamp as Date)?.toISOString?.() || (row.timestamp as string),
 productId: row.product_id as string,
 productName: row.product_name as string,
 store: row.store as string,
 storeSlug: row.store_slug as string,
 externalUrl: row.external_url as string,
 userAgent: row.user_agent as string | undefined,
 userId: row.user_id as string | null | undefined,
 };
}

/**
 * Get a user's full click history (products they browsed and clicked through to buy).
 */
export async function getUserClickHistory(userId: string): Promise<ClickRecord[]> {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();
 const rows = await sql`
 SELECT * FROM clicks
 WHERE user_id = ${userId}
 ORDER BY timestamp DESC
 LIMIT 100
 `;
 return rows.map(mapClickRow);
}

/**
 * Get confirmed purchases (conversions) attributed to a user.
 */
export async function getUserPurchaseHistory(userId: string): Promise<ConversionRecord[]> {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();
 const rows = await sql`
 SELECT * FROM conversions
 WHERE user_id = ${userId}
 ORDER BY timestamp DESC
 `;
 return rows.map(mapConversionRow);
}

export type CustomerSummary = {
 userId: string;
 email: string | null;
 name: string | null;
 clickCount: number;
 purchaseCount: number;
 totalSpend: number;
 lastSeen: string;
 firstSeen: string;
};

/**
 * Admin: all users who have at least one tracked click, with purchase stats.
 * Joins clicks/conversions against the users table.
 */
export async function getCustomerSummaries(): Promise<CustomerSummary[]> {
 const sql = neon(getDatabaseUrl());
 await initAnalyticsTables();

 const rows = await sql`
 SELECT
 u.id AS user_id,
 u.email,
 u.name,
 COUNT(DISTINCT c.click_id)::int AS click_count,
 COUNT(DISTINCT cv.conversion_id)::int AS purchase_count,
 COALESCE(SUM(cv.order_total), 0)::numeric AS total_spend,
 MAX(GREATEST(c.timestamp, COALESCE(cv.timestamp, c.timestamp)))::text AS last_seen,
 MIN(c.timestamp)::text AS first_seen
 FROM users u
 LEFT JOIN clicks c ON c.user_id = u.id
 LEFT JOIN conversions cv ON cv.user_id = u.id
 WHERE c.user_id IS NOT NULL
 GROUP BY u.id, u.email, u.name
 ORDER BY purchase_count DESC, click_count DESC
 `;

 return rows.map((row) => ({
 userId: row.user_id as string,
 email: row.email as string | null,
 name: row.name as string | null,
 clickCount: row.click_count as number,
 purchaseCount: row.purchase_count as number,
 totalSpend: Number(row.total_spend),
 lastSeen: row.last_seen as string,
 firstSeen: row.first_seen as string,
 }));
}

export type InventoryStats = {
 productCount: number;
 inventoryValue: number;
 potentialCommission: number;
 tier1Count: number; // < $1k @ 7%
 tier2Count: number; // $1k–$5k @ 5%
 tier3Count: number; // > $5k @ 3%
 byStore: Array<{
 storeSlug: string;
 productCount: number;
 inventoryValue: number;
 potentialCommission: number;
 }>;
};

export async function getInventoryStats(): Promise<InventoryStats> {
 const sql = neon(getDatabaseUrl());

 const [summaryRows, storeRows] = await Promise.all([
 sql`
 WITH converted AS (
 SELECT
 store_slug,
 price * CASE currency
 WHEN 'GBP' THEN 1.26
 WHEN 'EUR' THEN 1.08
 WHEN 'CAD' THEN 0.74
 WHEN 'AUD' THEN 0.65
 ELSE 1
 END AS price_usd
 FROM products
 WHERE price > 0
 )
 SELECT
 COUNT(*)::int AS product_count,
 COALESCE(SUM(price_usd), 0)::numeric AS inventory_value,
 COALESCE(SUM(
 CASE
 WHEN price_usd < 1000 THEN price_usd * 0.07
 WHEN price_usd <= 5000 THEN price_usd * 0.05
 ELSE price_usd * 0.03
 END
 ), 0)::numeric AS potential_commission,
 COUNT(CASE WHEN price_usd < 1000 THEN 1 END)::int AS tier1_count,
 COUNT(CASE WHEN price_usd >= 1000 AND price_usd <= 5000 THEN 1 END)::int AS tier2_count,
 COUNT(CASE WHEN price_usd > 5000 THEN 1 END)::int AS tier3_count
 FROM converted
 `,
 sql`
 WITH converted AS (
 SELECT
 store_slug,
 price * CASE currency
 WHEN 'GBP' THEN 1.26
 WHEN 'EUR' THEN 1.08
 WHEN 'CAD' THEN 0.74
 WHEN 'AUD' THEN 0.65
 ELSE 1
 END AS price_usd
 FROM products
 WHERE price > 0
 )
 SELECT
 store_slug,
 COUNT(*)::int AS product_count,
 COALESCE(SUM(price_usd), 0)::numeric AS inventory_value,
 COALESCE(SUM(
 CASE
 WHEN price_usd < 1000 THEN price_usd * 0.07
 WHEN price_usd <= 5000 THEN price_usd * 0.05
 ELSE price_usd * 0.03
 END
 ), 0)::numeric AS potential_commission
 FROM converted
 GROUP BY store_slug
 ORDER BY inventory_value DESC
 `,
 ]);

 const s = summaryRows[0];
 return {
 productCount: s.product_count as number,
 inventoryValue: Number(s.inventory_value),
 potentialCommission: Number(s.potential_commission),
 tier1Count: s.tier1_count as number,
 tier2Count: s.tier2_count as number,
 tier3Count: s.tier3_count as number,
 byStore: storeRows.map((r) => ({
 storeSlug: r.store_slug as string,
 productCount: r.product_count as number,
 inventoryValue: Number(r.inventory_value),
 potentialCommission: Number(r.potential_commission),
 })),
 };
}

// ── Cohort Retention ─────────────────────────────────────────────────────────

export type CohortPoint = {
 cohort: string;       // "2025-03"
 period: number;       // months since first purchase (0 = acquisition month)
 activeUsers: number;  // users in this cohort who purchased in this period
 cohortSize: number;   // total users in the cohort
 retentionPct: number; // activeUsers / cohortSize * 100
};

/**
 * Compute monthly cohort retention from the conversions table.
 * Groups buyers by their first-purchase month, then tracks what % return
 * in each subsequent month. Period 0 is always 100% (the acquisition month).
 */
export async function getCohortRetention(): Promise<CohortPoint[]> {
 const sql = neon(getDatabaseUrl());
 try {
 const rows = await sql`
  WITH first_purchase AS (
   SELECT
    user_id,
    DATE_TRUNC('month', MIN(timestamp)) AS cohort_month
   FROM conversions
   WHERE user_id IS NOT NULL
   GROUP BY user_id
  ),
  cohort_sizes AS (
   SELECT cohort_month, COUNT(*) AS cohort_size
   FROM first_purchase
   GROUP BY cohort_month
  ),
  activity AS (
   SELECT
    fp.user_id,
    fp.cohort_month,
    DATE_TRUNC('month', c.timestamp) AS activity_month
   FROM first_purchase fp
   JOIN conversions c ON c.user_id = fp.user_id
   GROUP BY fp.user_id, fp.cohort_month, DATE_TRUNC('month', c.timestamp)
  ),
  retention AS (
   SELECT
    a.cohort_month,
    (
     (DATE_PART('year', a.activity_month) - DATE_PART('year', a.cohort_month)) * 12 +
     (DATE_PART('month', a.activity_month) - DATE_PART('month', a.cohort_month))
    )::integer AS period,
    COUNT(DISTINCT a.user_id) AS active_users
   FROM activity a
   GROUP BY a.cohort_month, period
  )
  SELECT
   TO_CHAR(r.cohort_month, 'YYYY-MM') AS cohort,
   r.period,
   r.active_users::integer AS active_users,
   cs.cohort_size::integer AS cohort_size,
   ROUND(r.active_users::numeric / cs.cohort_size * 100, 1) AS retention_pct
  FROM retention r
  JOIN cohort_sizes cs ON cs.cohort_month = r.cohort_month
  WHERE r.period >= 0
  ORDER BY r.cohort_month, r.period
 `;
 return rows.map((r) => ({
  cohort: r.cohort as string,
  period: r.period as number,
  activeUsers: r.active_users as number,
  cohortSize: r.cohort_size as number,
  retentionPct: parseFloat(r.retention_pct as string),
 }));
 } catch {
 return [];
 }
}

function mapConversionRow(row: Record<string, unknown>): ConversionRecord {
 return {
 conversionId: row.conversion_id as string,
 timestamp: (row.timestamp as Date)?.toISOString?.() || (row.timestamp as string),
 orderId: row.order_id as string,
 orderTotal: Number(row.order_total),
 currency: row.currency as string,
 items: (row.items || []) as ConversionItem[],
 viaClickId: row.via_click_id as string | null,
 storeSlug: row.store_slug as string,
 storeName: row.store_name as string,
 matched: row.matched as boolean,
 userId: row.user_id as string | null | undefined,
 customerEmail: (row.customer_email as string | null) ?? null,
 matchedClickData: row.matched_click_data as ConversionRecord["matchedClickData"],
 };
}
