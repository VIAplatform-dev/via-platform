import { neon } from "@neondatabase/serverless";

const getDatabaseUrl = () => {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) {
 throw new Error("DATABASE_URL or POSTGRES_URL environment variable is not set.");
 }
 return url;
};

let tablesInitialized = false;

export async function initNotificationTables() {
 if (tablesInitialized) return;
 const sql = neon(getDatabaseUrl());

 await sql`
 CREATE TABLE IF NOT EXISTS favorite_notifications (
 id SERIAL PRIMARY KEY,
 user_id UUID NOT NULL,
 product_id INT NOT NULL,
 sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 click_count_at_send INT NOT NULL DEFAULT 0
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_fav_notif_user_product ON favorite_notifications(user_id, product_id)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_fav_notif_sent_at ON favorite_notifications(sent_at)`;

 // All other per-user send tables. Kept here so the cross-flow 48h frequency
 // check (which UNIONs all of them) always has tables to reference.
 await sql`
 CREATE TABLE IF NOT EXISTS trending_notifications (
 id SERIAL PRIMARY KEY,
 user_id UUID NOT NULL,
 product_id INT NOT NULL,
 sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 UNIQUE(user_id, product_id)
 )
 `;
 await sql`
 CREATE TABLE IF NOT EXISTS winback_emails (
 id SERIAL PRIMARY KEY,
 user_id UUID NOT NULL,
 tier TEXT NOT NULL,
 sent_at TIMESTAMPTZ DEFAULT NOW()
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_winback_user_tier ON winback_emails(user_id, tier, sent_at DESC)`;
 // "Last seen" heartbeat column. Stamped on any authenticated browse so winback
 // sees browse-only sessions (not just product taps). See touchLastActive.
 await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`;
 await sql`CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at) WHERE last_active_at IS NOT NULL`;
 await sql`
 CREATE TABLE IF NOT EXISTS viewed_item_reminders (
 id SERIAL PRIMARY KEY,
 user_id UUID NOT NULL,
 product_id INT NOT NULL,
 sent_at TIMESTAMPTZ DEFAULT NOW(),
 UNIQUE(user_id, product_id)
 )
 `;
 await sql`
 CREATE TABLE IF NOT EXISTS store_digest_sends (
 id SERIAL PRIMARY KEY,
 user_id UUID NOT NULL,
 sent_at TIMESTAMPTZ DEFAULT NOW()
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_digest_user ON store_digest_sends(user_id, sent_at DESC)`;
 await sql`
 CREATE TABLE IF NOT EXISTS last_chance_notifications (
 id SERIAL PRIMARY KEY,
 user_id UUID NOT NULL,
 product_id INT NOT NULL,
 sent_at TIMESTAMPTZ DEFAULT NOW(),
 UNIQUE(user_id, product_id)
 )
 `;

 tablesInitialized = true;
}

export type NotificationCandidate = {
 user_id: string;
 email: string;
 product_id: number;
 product_title: string;
 product_image: string | null;
 store_name: string;
 store_slug: string;
 price: number;
 currency: string;
 recent_click_count: number;
};

/**
 * Find products that have favorites AND recent clicks since last notification.
 * A product qualifies if it has 3+ clicks since the user was last notified
 * (or since they favorited it, if never notified).
 */
export async function getFavoriteNotificationCandidates(): Promise<NotificationCandidate[]> {
 await initNotificationTables();
 const sql = neon(getDatabaseUrl());

 // The clicks table stores product_id as composite string "store-slug-123"
 // We need to join with products by extracting the numeric ID
 const rows = await sql`
 SELECT
 pf.user_id,
 u.email,
 p.id AS product_id,
 p.title AS product_title,
 p.image AS product_image,
 p.store_name,
 p.store_slug,
 p.price,
 p.currency,
 COUNT(c.id) AS recent_click_count
 FROM product_favorites pf
 JOIN users u ON u.id = pf.user_id
 JOIN products p ON p.id = pf.product_id
 JOIN clicks c ON c.product_id = CONCAT(p.store_slug, '-', p.id::text)
 AND c.timestamp > COALESCE(
 (SELECT MAX(fn.sent_at) FROM favorite_notifications fn
 WHERE fn.user_id = pf.user_id AND fn.product_id = pf.product_id),
 pf.created_at
 )
 WHERE COALESCE(u.notification_emails_enabled, TRUE) = TRUE
 GROUP BY pf.user_id, u.email, p.id, p.title, p.image, p.store_name, p.store_slug, p.price, p.currency
 HAVING COUNT(c.id) >= 3
 `;

 return rows as NotificationCandidate[];
}

/**
 * Record that a notification was sent to a user for a product.
 */
export async function recordNotificationSent(
 userId: string,
 productId: number,
 clickCount: number
): Promise<void> {
 await initNotificationTables();
 const sql = neon(getDatabaseUrl());

 await sql`
 INSERT INTO favorite_notifications (user_id, product_id, click_count_at_send)
 VALUES (${userId}, ${productId}, ${clickCount})
 `;
}

export type TrendingCandidate = {
 user_id: string;
 email: string;
 product_id: number;
 product_title: string;
 product_image: string | null;
 store_name: string;
 store_slug: string;
 price: number;
 currency: string;
 favorite_count: number;
 view_count: number;
};

/**
 * Find favorited products that are trending (3+ total favorites OR 5+ total views)
 * where the user hasn't received a trending email yet.
 */
export async function getTrendingCandidates(): Promise<TrendingCandidate[]> {
 await initNotificationTables();
 const sql = neon(getDatabaseUrl());

 const rows = await sql`
 SELECT
 pf.user_id,
 u.email,
 p.id AS product_id,
 p.title AS product_title,
 p.image AS product_image,
 p.store_name,
 p.store_slug,
 p.price,
 p.currency,
 COALESCE(fav_counts.favorite_count, 0) AS favorite_count,
 COALESCE(view_counts.view_count, 0) AS view_count
 FROM product_favorites pf
 JOIN users u ON u.id = pf.user_id
 JOIN products p ON p.id = pf.product_id
 LEFT JOIN (
 SELECT product_id, COUNT(*) AS favorite_count
 FROM product_favorites
 GROUP BY product_id
 ) fav_counts ON fav_counts.product_id = pf.product_id
 LEFT JOIN (
 SELECT product_id, COUNT(*) AS view_count
 FROM product_views
 GROUP BY product_id
 ) view_counts ON view_counts.product_id = CONCAT(p.store_slug, '-', p.id::text)
 WHERE COALESCE(u.notification_emails_enabled, TRUE) = TRUE
 AND (
 COALESCE(fav_counts.favorite_count, 0) >= 3
 OR COALESCE(view_counts.view_count, 0) >= 5
 )
 AND NOT EXISTS (
 SELECT 1 FROM trending_notifications tn
 WHERE tn.user_id = pf.user_id AND tn.product_id = pf.product_id
 )
 AND NOT EXISTS (
 SELECT 1 FROM (
 SELECT user_id, sent_at FROM favorite_notifications
 UNION ALL SELECT user_id, sent_at FROM trending_notifications
 UNION ALL SELECT user_id, sent_at FROM winback_emails
 UNION ALL SELECT user_id, sent_at FROM viewed_item_reminders
 UNION ALL SELECT user_id, sent_at FROM store_digest_sends
 UNION ALL SELECT user_id, sent_at FROM last_chance_notifications
 UNION ALL SELECT user_id, email_sent_at AS sent_at FROM user_cart_items WHERE email_sent_at IS NOT NULL
 ) _freq
 WHERE _freq.user_id = pf.user_id
 AND _freq.sent_at > NOW() - INTERVAL '48 hours'
 )
 `;

 return rows as TrendingCandidate[];
}

export async function recordTrendingNotificationSent(userId: string, productId: number): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await sql`
 INSERT INTO trending_notifications (user_id, product_id)
 VALUES (${userId}, ${productId})
 ON CONFLICT (user_id, product_id) DO NOTHING
 `;
}

/**
 * Atomically claim trending notification slots for a user's products.
 * Returns the product IDs that were successfully claimed (inserted).
 * If another cron instance already claimed them, those IDs are excluded.
 * Use this BEFORE sending to prevent duplicate emails from concurrent runs.
 */
export async function claimTrendingNotificationSlots(userId: string, productIds: number[]): Promise<number[]> {
 if (productIds.length === 0) return [];
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 INSERT INTO trending_notifications (user_id, product_id)
 SELECT ${userId}, unnest(${productIds}::int[])
 ON CONFLICT (user_id, product_id) DO NOTHING
 RETURNING product_id
 `;
 return (rows as { product_id: number }[]).map((r) => r.product_id);
}

/**
 * Get how many notification emails a user has received today (for daily cap).
 */
export async function getNotificationsSentTodayCount(userId: string): Promise<number> {
 await initNotificationTables();
 const sql = neon(getDatabaseUrl());

 const rows = await sql`
 SELECT COUNT(*) as count FROM favorite_notifications
 WHERE user_id = ${userId}
 AND sent_at >= CURRENT_DATE
 `;

 return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Price Drop Notifications
// ---------------------------------------------------------------------------

export type PriceDropNotificationCandidate = {
 user_id: string;
 email: string;
 product_id: number;
 product_title: string;
 product_image: string | null;
 store_name: string;
 store_slug: string;
 old_price: number;
 new_price: number;
};

/**
 * Initialise the price_drop_notifications table (idempotent).
 */
async function ensurePriceDropTable() {
 const sql = neon(getDatabaseUrl());
 await sql`
 CREATE TABLE IF NOT EXISTS price_drop_notifications (
 id SERIAL PRIMARY KEY,
 user_id UUID NOT NULL,
 product_id INT NOT NULL,
 new_price NUMERIC(10,2) NOT NULL,
 sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 UNIQUE (user_id, product_id, new_price)
 )
 `;
}

/**
 * For each price-dropped product, find users who favorited OR viewed it and
 * haven't already received a notification at this exact new price.
 * Respects notification_emails_enabled on the users table.
 */
export async function getPriceDropCandidates(
 priceDrops: Array<{ productId: number; oldPrice: number; newPrice: number; title: string; image: string | null; storeSlug: string; storeName: string }>
): Promise<PriceDropNotificationCandidate[]> {
 if (priceDrops.length === 0) return [];
 await ensurePriceDropTable();
 const sql = neon(getDatabaseUrl());

 const results: PriceDropNotificationCandidate[] = [];

 for (const drop of priceDrops) {
 // Users who favorited OR viewed (deduplicated) and haven't been notified at this price
 const rows = await sql`
 SELECT DISTINCT u.id AS user_id, u.email
 FROM users u
 WHERE COALESCE(u.notification_emails_enabled, TRUE) = TRUE
 AND u.email IS NOT NULL
 AND (
 EXISTS (
 SELECT 1 FROM product_favorites pf
 WHERE pf.user_id = u.id AND pf.product_id = ${drop.productId}
 )
 OR EXISTS (
 SELECT 1 FROM product_views pv
 WHERE pv.user_id = u.id::text AND pv.product_id = ${`${drop.storeSlug}-${drop.productId}`}
 )
 )
 AND NOT EXISTS (
 SELECT 1 FROM price_drop_notifications pdn
 WHERE pdn.user_id = u.id AND pdn.product_id = ${drop.productId} AND pdn.new_price = ${drop.newPrice}
 )
 `;

 for (const row of rows) {
 results.push({
 user_id: row.user_id as string,
 email: row.email as string,
 product_id: drop.productId,
 product_title: drop.title,
 product_image: drop.image,
 store_name: drop.storeName,
 store_slug: drop.storeSlug,
 old_price: drop.oldPrice,
 new_price: drop.newPrice,
 });
 }
 }

 return results;
}

/**
 * Mark price drop notifications as sent so we don't resend them.
 */
export async function recordPriceDropNotificationsSent(
 candidates: Array<{ user_id: string; product_id: number; new_price: number }>
): Promise<void> {
 if (candidates.length === 0) return;
 await ensurePriceDropTable();
 const sql = neon(getDatabaseUrl());
 for (const c of candidates) {
 await sql`
 INSERT INTO price_drop_notifications (user_id, product_id, new_price)
 VALUES (${c.user_id}, ${c.product_id}, ${c.new_price})
 ON CONFLICT (user_id, product_id, new_price) DO NOTHING
 `;
 }
}

// ---------------------------------------------------------------------------
// Win-back Emails
// ---------------------------------------------------------------------------

export type WinbackCandidate = {
 user_id: string;
 email: string;
};

export async function getWinbackCandidates(tier: '14d' | '30d'): Promise<WinbackCandidate[]> {
 await initNotificationTables();
 const sql = neon(getDatabaseUrl());

 let rows;
 if (tier === '14d') {
 rows = await sql`
 WITH last_activity AS (
 SELECT user_id::text, MAX(ts) AS last_active
 FROM (
 SELECT user_id, timestamp AS ts FROM clicks WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id, timestamp AS ts FROM product_views WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id, timestamp AS ts FROM conversions WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id::text AS user_id, created_at AS ts FROM product_favorites WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id::text AS user_id, created_at AS ts FROM store_favorites WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id::text AS user_id, timestamp AS ts FROM page_type_views WHERE user_id IS NOT NULL
 UNION ALL
 SELECT id::text AS user_id, last_active_at AS ts FROM users WHERE last_active_at IS NOT NULL
 ) all_activity
 GROUP BY user_id::text
 )
 SELECT la.user_id, u.email
 FROM last_activity la
 JOIN users u ON u.id::text = la.user_id
 WHERE la.last_active < NOW() - INTERVAL '14 days'
 AND la.last_active >= NOW() - INTERVAL '28 days'
 AND u.email IS NOT NULL
 AND COALESCE(u.notification_emails_enabled, TRUE) = TRUE
 AND NOT EXISTS (
 SELECT 1 FROM winback_emails we
 WHERE we.user_id = u.id
 AND we.sent_at >= NOW() - INTERVAL '30 days'
 )
 AND NOT EXISTS (
 SELECT 1 FROM (
 SELECT user_id, sent_at FROM favorite_notifications
 UNION ALL SELECT user_id, sent_at FROM trending_notifications
 UNION ALL SELECT user_id, sent_at FROM winback_emails
 UNION ALL SELECT user_id, sent_at FROM viewed_item_reminders
 UNION ALL SELECT user_id, sent_at FROM store_digest_sends
 UNION ALL SELECT user_id, sent_at FROM last_chance_notifications
 UNION ALL SELECT user_id, email_sent_at FROM user_cart_items WHERE email_sent_at IS NOT NULL
 ) _freq
 WHERE _freq.user_id = u.id
 AND _freq.sent_at > NOW() - INTERVAL '48 hours'
 )
 `;
 } else {
 rows = await sql`
 WITH last_activity AS (
 SELECT user_id::text, MAX(ts) AS last_active
 FROM (
 SELECT user_id, timestamp AS ts FROM clicks WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id, timestamp AS ts FROM product_views WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id, timestamp AS ts FROM conversions WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id::text AS user_id, created_at AS ts FROM product_favorites WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id::text AS user_id, created_at AS ts FROM store_favorites WHERE user_id IS NOT NULL
 UNION ALL
 SELECT user_id::text AS user_id, timestamp AS ts FROM page_type_views WHERE user_id IS NOT NULL
 UNION ALL
 SELECT id::text AS user_id, last_active_at AS ts FROM users WHERE last_active_at IS NOT NULL
 ) all_activity
 GROUP BY user_id::text
 )
 SELECT la.user_id, u.email
 FROM last_activity la
 JOIN users u ON u.id::text = la.user_id
 WHERE la.last_active < NOW() - INTERVAL '30 days'
 AND la.last_active >= NOW() - INTERVAL '60 days'
 AND u.email IS NOT NULL
 AND COALESCE(u.notification_emails_enabled, TRUE) = TRUE
 AND NOT EXISTS (
 SELECT 1 FROM winback_emails we
 WHERE we.user_id = u.id
 AND we.tier = '30d'
 AND we.sent_at >= NOW() - INTERVAL '60 days'
 )
 AND NOT EXISTS (
 SELECT 1 FROM (
 SELECT user_id, sent_at FROM favorite_notifications
 UNION ALL SELECT user_id, sent_at FROM trending_notifications
 UNION ALL SELECT user_id, sent_at FROM winback_emails
 UNION ALL SELECT user_id, sent_at FROM viewed_item_reminders
 UNION ALL SELECT user_id, sent_at FROM store_digest_sends
 UNION ALL SELECT user_id, sent_at FROM last_chance_notifications
 UNION ALL SELECT user_id, email_sent_at FROM user_cart_items WHERE email_sent_at IS NOT NULL
 ) _freq
 WHERE _freq.user_id = u.id
 AND _freq.sent_at > NOW() - INTERVAL '48 hours'
 )
 `;
 }

 return rows as WinbackCandidate[];
}

let lastActiveEnsured = false;
async function ensureLastActiveColumn(): Promise<void> {
 if (lastActiveEnsured) return;
 const sql = neon(getDatabaseUrl());
 await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`;
 await sql`CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at) WHERE last_active_at IS NOT NULL`;
 lastActiveEnsured = true;
}

/**
 * Best-effort "last seen" heartbeat. Stamps users.last_active_at when a logged-in
 * person uses the site/app, throttled to once per 30 min (the WHERE clause makes
 * it a cheap PK no-op the rest of the time). Never throws. Must not block a
 * request. This is what keeps winback from emailing someone who browsed yesterday.
 */
export async function touchLastActive(userId: string | null | undefined): Promise<void> {
 if (!userId) return;
 try {
 await ensureLastActiveColumn();
 const sql = neon(getDatabaseUrl());
 await sql`
  UPDATE users SET last_active_at = NOW()
  WHERE id::text = ${userId}
  AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '30 minutes')
 `;
 } catch {
 // swallow: a missed heartbeat is harmless (throttled; next request catches it)
 }
}

export async function recordWinbackSent(userId: string, tier: '14d' | '30d'): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await sql`
 INSERT INTO winback_emails (user_id, tier)
 VALUES (${userId}, ${tier})
 `;
}

// ---------------------------------------------------------------------------
// Viewed Item Reminders
// ---------------------------------------------------------------------------

export type ViewedItemCandidate = {
 user_id: string;
 email: string;
 product_id: number;
 product_title: string;
 product_image: string | null;
 store_name: string;
 store_slug: string;
 price: number;
 currency: string;
};

export async function getViewedItemCandidates(): Promise<Map<string, { email: string; items: ViewedItemCandidate[] }>> {
 await initNotificationTables();
 const sql = neon(getDatabaseUrl());

 const rows = await sql`
 SELECT DISTINCT ON (c.user_id, p.id)
 u.id AS user_id,
 u.email,
 p.id AS product_id,
 p.title AS product_title,
 p.image AS product_image,
 p.store_name,
 p.store_slug,
 p.price,
 p.currency,
 c.timestamp AS clicked_at
 FROM clicks c
 JOIN users u ON u.id::text = c.user_id
 JOIN products p ON CONCAT(p.store_slug, '-', p.id::text) = c.product_id
 WHERE c.timestamp < NOW() - INTERVAL '48 hours'
 AND c.timestamp >= NOW() - INTERVAL '10 days'
 AND u.email IS NOT NULL
 AND COALESCE(u.notification_emails_enabled, TRUE) = TRUE
 AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 AND NOT EXISTS (
 SELECT 1 FROM conversions cv
 WHERE cv.user_id = c.user_id
 AND cv.store_slug = p.store_slug
 AND cv.timestamp >= c.timestamp
 AND (cv.returned IS NULL OR cv.returned = FALSE)
 )
 AND NOT EXISTS (
 SELECT 1 FROM viewed_item_reminders vir
 WHERE vir.user_id = u.id AND vir.product_id = p.id
 )
 AND NOT EXISTS (
 SELECT 1 FROM user_cart_items uci
 WHERE uci.user_id = u.id
 AND uci.product_id = p.id
 AND uci.email_sent_at IS NULL
 AND uci.purchased_at IS NULL
 )
 AND NOT EXISTS (
 SELECT 1 FROM (
 SELECT user_id, sent_at FROM favorite_notifications
 UNION ALL SELECT user_id, sent_at FROM trending_notifications
 UNION ALL SELECT user_id, sent_at FROM winback_emails
 UNION ALL SELECT user_id, sent_at FROM viewed_item_reminders
 UNION ALL SELECT user_id, sent_at FROM store_digest_sends
 UNION ALL SELECT user_id, sent_at FROM last_chance_notifications
 UNION ALL SELECT user_id, email_sent_at FROM user_cart_items WHERE email_sent_at IS NOT NULL
 ) _freq
 WHERE _freq.user_id = u.id
 AND _freq.sent_at > NOW() - INTERVAL '48 hours'
 )
 ORDER BY c.user_id, p.id, c.timestamp DESC
 `;

 const result = new Map<string, { email: string; items: ViewedItemCandidate[] }>();
 for (const row of rows) {
 const userId = row.user_id as string;
 if (!result.has(userId)) {
 result.set(userId, { email: row.email as string, items: [] });
 }
 const entry = result.get(userId)!;
 if (entry.items.length < 6) {
 entry.items.push({
 user_id: userId,
 email: row.email as string,
 product_id: row.product_id as number,
 product_title: row.product_title as string,
 product_image: row.product_image as string | null,
 store_name: row.store_name as string,
 store_slug: row.store_slug as string,
 price: row.price as number,
 currency: row.currency as string,
 });
 }
 }

 return result;
}

export async function recordViewedItemReminderSent(userId: string, productIds: number[]): Promise<void> {
 if (productIds.length === 0) return;
 const sql = neon(getDatabaseUrl());
 for (const productId of productIds) {
 await sql`
 INSERT INTO viewed_item_reminders (user_id, product_id)
 VALUES (${userId}, ${productId})
 ON CONFLICT (user_id, product_id) DO NOTHING
 `;
 }
}

// ---------------------------------------------------------------------------
// Store Digest
// ---------------------------------------------------------------------------

export type StoreDigestItem = {
 product_id: number;
 product_title: string;
 product_image: string | null;
 price: number;
 currency: string;
 store_slug: string;
 store_name: string;
};

export type StoreDigestCandidate = {
 user_id: string;
 email: string;
 stores: Array<{ store_slug: string; store_name: string; items: StoreDigestItem[] }>;
};

export async function getStoreDigestCandidates(): Promise<StoreDigestCandidate[]> {
 await initNotificationTables();
 const sql = neon(getDatabaseUrl());

 const rows = await sql`
 SELECT
 sf.user_id,
 u.email,
 p.store_slug,
 p.store_name,
 p.id AS product_id,
 p.title AS product_title,
 p.image AS product_image,
 p.price,
 p.currency,
 p.created_at AS product_created_at
 FROM store_favorites sf
 JOIN users u ON u.id = sf.user_id
 JOIN products p ON p.store_slug = sf.store_slug
 WHERE p.created_at >= NOW() - INTERVAL '7 days'
 AND u.email IS NOT NULL
 AND COALESCE(u.notification_emails_enabled, TRUE) = TRUE
 AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 AND NOT EXISTS (
 SELECT 1 FROM store_digest_sends sds
 WHERE sds.user_id = sf.user_id
 AND sds.sent_at >= NOW() - INTERVAL '7 days'
 )
 AND NOT EXISTS (
 SELECT 1 FROM (
 SELECT user_id, sent_at FROM favorite_notifications
 UNION ALL SELECT user_id, sent_at FROM trending_notifications
 UNION ALL SELECT user_id, sent_at FROM winback_emails
 UNION ALL SELECT user_id, sent_at FROM viewed_item_reminders
 UNION ALL SELECT user_id, sent_at FROM store_digest_sends
 UNION ALL SELECT user_id, sent_at FROM last_chance_notifications
 UNION ALL SELECT user_id, email_sent_at FROM user_cart_items WHERE email_sent_at IS NOT NULL
 ) _freq
 WHERE _freq.user_id = sf.user_id
 AND _freq.sent_at > NOW() - INTERVAL '48 hours'
 )
 ORDER BY sf.user_id, p.store_slug, p.created_at DESC
 `;

 const userMap = new Map<string, { email: string; storeMap: Map<string, { store_name: string; items: StoreDigestItem[] }> }>();

 for (const row of rows) {
 const userId = row.user_id as string;
 if (!userMap.has(userId)) {
 userMap.set(userId, { email: row.email as string, storeMap: new Map() });
 }
 const user = userMap.get(userId)!;
 const storeSlug = row.store_slug as string;
 if (!user.storeMap.has(storeSlug)) {
 if (user.storeMap.size >= 3) continue;
 user.storeMap.set(storeSlug, { store_name: row.store_name as string, items: [] });
 }
 const store = user.storeMap.get(storeSlug)!;
 if (store.items.length < 4) {
 store.items.push({
 product_id: row.product_id as number,
 product_title: row.product_title as string,
 product_image: row.product_image as string | null,
 price: row.price as number,
 currency: row.currency as string,
 store_slug: storeSlug,
 store_name: row.store_name as string,
 });
 }
 }

 const result: StoreDigestCandidate[] = [];
 for (const [userId, { email, storeMap }] of userMap) {
 const stores = Array.from(storeMap.entries()).map(([store_slug, { store_name, items }]) => ({
 store_slug,
 store_name,
 items,
 }));
 if (stores.some((s) => s.items.length > 0)) {
 result.push({ user_id: userId, email, stores });
 }
 }

 return result;
}

export async function recordStoreDigestSent(userId: string): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await sql`
 INSERT INTO store_digest_sends (user_id)
 VALUES (${userId})
 `;
}

// ---------------------------------------------------------------------------
// Last Chance Notifications
// ---------------------------------------------------------------------------

export type LastChanceCandidate = {
 user_id: string;
 email: string;
 product_id: number;
 product_title: string;
 product_image: string | null;
 store_name: string;
 store_slug: string;
 price: number;
 currency: string;
 days_saved: number;
};

export async function getLastChanceCandidates(): Promise<Map<string, { email: string; items: LastChanceCandidate[] }>> {
 await initNotificationTables();
 const sql = neon(getDatabaseUrl());

 const rows = await sql`
 SELECT
 pf.user_id,
 u.email,
 p.id AS product_id,
 p.title AS product_title,
 p.image AS product_image,
 p.store_name,
 p.store_slug,
 p.price,
 p.currency,
 FLOOR(EXTRACT(EPOCH FROM (NOW() - pf.created_at)) / 86400)::int AS days_saved
 FROM product_favorites pf
 JOIN users u ON u.id = pf.user_id
 JOIN products p ON p.id = pf.product_id
 WHERE pf.created_at < NOW() - INTERVAL '21 days'
 AND u.email IS NOT NULL
 AND COALESCE(u.notification_emails_enabled, TRUE) = TRUE
 AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)
 AND NOT EXISTS (
 SELECT 1 FROM conversions cv
 WHERE cv.user_id = pf.user_id::text
 AND cv.store_slug = p.store_slug
 AND (cv.returned IS NULL OR cv.returned = FALSE)
 )
 AND NOT EXISTS (
 SELECT 1 FROM last_chance_notifications lcn
 WHERE lcn.user_id = pf.user_id AND lcn.product_id = pf.product_id
 )
 AND NOT EXISTS (
 SELECT 1 FROM (
 SELECT user_id, sent_at FROM favorite_notifications
 UNION ALL SELECT user_id, sent_at FROM trending_notifications
 UNION ALL SELECT user_id, sent_at FROM winback_emails
 UNION ALL SELECT user_id, sent_at FROM viewed_item_reminders
 UNION ALL SELECT user_id, sent_at FROM store_digest_sends
 UNION ALL SELECT user_id, sent_at FROM last_chance_notifications
 UNION ALL SELECT user_id, email_sent_at FROM user_cart_items WHERE email_sent_at IS NOT NULL
 ) _freq
 WHERE _freq.user_id = pf.user_id
 AND _freq.sent_at > NOW() - INTERVAL '48 hours'
 )
 ORDER BY pf.user_id, pf.created_at ASC
 `;

 const result = new Map<string, { email: string; items: LastChanceCandidate[] }>();
 for (const row of rows) {
 const userId = row.user_id as string;
 if (!result.has(userId)) {
 result.set(userId, { email: row.email as string, items: [] });
 }
 const entry = result.get(userId)!;
 if (entry.items.length < 6) {
 entry.items.push({
 user_id: userId,
 email: row.email as string,
 product_id: row.product_id as number,
 product_title: row.product_title as string,
 product_image: row.product_image as string | null,
 store_name: row.store_name as string,
 store_slug: row.store_slug as string,
 price: row.price as number,
 currency: row.currency as string,
 days_saved: row.days_saved as number,
 });
 }
 }

 return result;
}

export async function recordLastChanceSent(userId: string, productIds: number[]): Promise<void> {
 if (productIds.length === 0) return;
 const sql = neon(getDatabaseUrl());
 for (const productId of productIds) {
 await sql`
 INSERT INTO last_chance_notifications (user_id, product_id)
 VALUES (${userId}, ${productId})
 ON CONFLICT (user_id, product_id) DO NOTHING
 `;
 }
}
