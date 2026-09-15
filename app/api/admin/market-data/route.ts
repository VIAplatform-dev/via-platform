import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
 getMarketSummary,
 getTopDesigners,
 getTopBrands,
 getTopCategories,
 getPriceTierBreakdown,
 getStoreVelocity,
 getWeeklyTrend,
 getRecentSales,
 getRecentPriceChanges,
 getTotalSoldItems,
} from "@/app/lib/market-data-db";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const crypto = require("crypto");
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (adminToken && adminToken === crypto.createHash("sha256").update(adminPassword).digest("hex")) return true;
 return false;
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { searchParams } = new URL(request.url);
 const days = parseInt(searchParams.get("days") ?? "3650", 10);

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const sql = neon(dbUrl);

 await Promise.allSettled([
 sql`CREATE TABLE IF NOT EXISTS sold_items (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 store_name TEXT NOT NULL,
 product_id TEXT,
 title TEXT NOT NULL,
 designer TEXT,
 final_price NUMERIC NOT NULL,
 original_price NUMERIC,
 currency TEXT DEFAULT 'USD',
 image TEXT,
 size TEXT,
 click_count INT DEFAULT 0,
 favorite_count INT DEFAULT 0,
 days_listed INT,
 sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 product_type TEXT
 )`,
 sql`CREATE TABLE IF NOT EXISTS price_history (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 product_id TEXT,
 title TEXT NOT NULL,
 designer TEXT,
 old_price NUMERIC NOT NULL,
 new_price NUMERIC NOT NULL,
 currency TEXT DEFAULT 'USD',
 changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`,
 sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS returned BOOLEAN DEFAULT FALSE`,
 sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ`,
 sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT`,
 sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT`,
 ]);

 try {
 const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
 const prevPeriodStart = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString();
 const now = new Date().toISOString();
 const weeksBack = Math.min(Math.ceil(days / 7), 52);

 const [
 summary, designers, topBrands, topCategories, tiers, storeVelocity, weeklyTrend, recentSales, priceChanges, totalAllTime,
 // Platform
 platformGmvRows, topStoresByGmv,
 userGrowthRows, activeUsersRows, repeatBuyersRows,
 dayOfWeekRows,
 // Demand
 demandStatsRows,
 topClickedProducts,
 topStoresByClicks,
 weeklyClickTrend,
 topDesignersByClicks,
 // Conversions-based analytics
 allConversionStores,
 recentOrderRows,
 conversionTierRows,
 conversionWeeklyRows,
 ] = await Promise.all([
 // Sell-through
 getMarketSummary(days),
 getTopDesigners(days, 25),
 getTopBrands(50),
 getTopCategories(50),
 getPriceTierBreakdown(days),
 getStoreVelocity(days),
 getWeeklyTrend(weeksBack),
 getRecentSales(50),
 getRecentPriceChanges(30, true),
 getTotalSoldItems(),

 // Platform: GMV + orders
 sql`
 SELECT
 COALESCE(SUM(order_total) FILTER (WHERE timestamp >= ${periodStart} AND timestamp < ${now}), 0)::float AS gmv_cur,
 COUNT(*) FILTER (WHERE timestamp >= ${periodStart} AND timestamp < ${now})::int AS orders_cur,
 COALESCE(SUM(order_total) FILTER (WHERE timestamp >= ${prevPeriodStart} AND timestamp < ${periodStart}), 0)::float AS gmv_prev,
 COUNT(*) FILTER (WHERE timestamp >= ${prevPeriodStart} AND timestamp < ${periodStart})::int AS orders_prev
 FROM conversions
 WHERE order_total > 0 AND (returned IS NULL OR returned = false)
 `,

 // Top stores by GMV (grouped by slug to avoid duplicate store_name variants)
 sql`
 SELECT store_slug,
 MAX(store_name) AS store_name,
 SUM(order_total)::float AS gmv,
 COUNT(*)::int AS orders
 FROM conversions
 WHERE order_total > 0
 AND (returned IS NULL OR returned = false)
 AND timestamp >= ${periodStart} AND timestamp < ${now}
 GROUP BY store_slug
 ORDER BY gmv DESC
 LIMIT 10
 `,

 // User growth
 sql`
 SELECT
 COUNT(*) FILTER (WHERE created_at >= ${periodStart} AND created_at < ${now})::int AS new_cur,
 COUNT(*) FILTER (WHERE created_at >= ${prevPeriodStart} AND created_at < ${periodStart})::int AS new_prev,
 COUNT(*)::int AS total
 FROM users
 `,

 // Active users
 sql`
 SELECT
 COUNT(DISTINCT user_id) FILTER (WHERE timestamp >= ${periodStart} AND timestamp < ${now} AND user_id IS NOT NULL)::int AS active_cur,
 COUNT(DISTINCT user_id) FILTER (WHERE timestamp >= ${prevPeriodStart} AND timestamp < ${periodStart} AND user_id IS NOT NULL)::int AS active_prev
 FROM clicks
 `,

 // Repeat buyers. Users with 2+ orders within the selected period
 sql`
 SELECT COUNT(DISTINCT user_id)::int AS repeat_buyers
 FROM conversions
 WHERE order_total > 0
 AND (returned IS NULL OR returned = false)
 AND timestamp >= ${periodStart} AND timestamp < ${now}
 AND user_id IS NOT NULL
 AND user_id IN (
 SELECT user_id FROM conversions
 WHERE order_total > 0
 AND (returned IS NULL OR returned = false)
 AND timestamp >= ${periodStart} AND timestamp < ${now}
 AND user_id IS NOT NULL
 GROUP BY user_id
 HAVING COUNT(*) >= 2
 )
 `,

 // Day-of-week
 sql`
 SELECT EXTRACT(DOW FROM timestamp)::int AS dow, COUNT(*)::int AS clicks
 FROM clicks
 WHERE timestamp >= ${periodStart} AND timestamp < ${now}
 GROUP BY dow ORDER BY dow
 `,

 // Demand: overall view stats from product_views (browsing on VYA)
 sql`
 SELECT
 COUNT(*)::int AS total_clicks,
 COUNT(DISTINCT pv.user_id) FILTER (WHERE pv.user_id IS NOT NULL)::int AS unique_users,
 COUNT(DISTINCT p.store_slug)::int AS stores_active,
 COUNT(DISTINCT pv.product_id)::int AS unique_products
 FROM product_views pv
 LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 WHERE pv.timestamp >= ${periodStart} AND pv.timestamp < ${now}
 `,

 // Demand: top viewed products on VYA (50 for full sourcing view)
 sql`
 SELECT
 COALESCE(p.title, pv.product_id) AS product_name,
 COALESCE(p.store_slug, '') AS store_slug,
 COUNT(*)::int AS clicks,
 COUNT(DISTINCT pv.user_id) FILTER (WHERE pv.user_id IS NOT NULL)::int AS unique_users
 FROM product_views pv
 LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 WHERE pv.timestamp >= ${periodStart} AND pv.timestamp < ${now}
 AND p.title IS NOT NULL
 AND LENGTH(p.title) > 3
 AND LOWER(p.title) NOT IN ('unknown', 'test', 'untitled')
 GROUP BY COALESCE(p.title, pv.product_id), COALESCE(p.store_slug, '')
 ORDER BY clicks DESC
 LIMIT 50
 `,

 // Demand: top stores by product views on VYA
 sql`
 SELECT
 p.store_slug,
 MAX(p.store_name) AS store_name,
 COUNT(*)::int AS clicks,
 COUNT(DISTINCT pv.user_id) FILTER (WHERE pv.user_id IS NOT NULL)::int AS unique_users,
 COUNT(DISTINCT pv.product_id)::int AS unique_products
 FROM product_views pv
 JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 WHERE pv.timestamp >= ${periodStart} AND pv.timestamp < ${now}
 GROUP BY p.store_slug
 ORDER BY clicks DESC
 LIMIT 15
 `,

 // Demand: weekly view trend on VYA
 sql`
 SELECT
 DATE_TRUNC('week', timestamp)::date::text AS week,
 COUNT(*)::int AS clicks,
 COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS unique_users
 FROM product_views
 WHERE timestamp >= ${periodStart} AND timestamp < ${now}
 GROUP BY DATE_TRUNC('week', timestamp)
 ORDER BY DATE_TRUNC('week', timestamp) ASC
 `,

 // Demand: top designers by product views (join product_views -> products)
 sql`
 SELECT
 COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, '')) AS designer,
 COUNT(pv.id)::int AS clicks,
 COUNT(DISTINCT pv.user_id) FILTER (WHERE pv.user_id IS NOT NULL)::int AS unique_users,
 COUNT(DISTINCT pv.product_id)::int AS unique_products
 FROM product_views pv
 JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 WHERE pv.timestamp >= ${periodStart} AND pv.timestamp < ${now}
 AND COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, '')) IS NOT NULL
 GROUP BY COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, ''))
 ORDER BY clicks DESC
 LIMIT 20
 `,

 // Conversions: all stores by GMV (deduplicated by store_slug, for Stores tab)
 sql`
 SELECT store_slug,
 MAX(store_name) AS store_name,
 SUM(order_total)::float AS gmv,
 COUNT(*)::int AS orders,
 AVG(order_total)::float AS avg_order
 FROM conversions
 WHERE order_total > 0
 AND (returned IS NULL OR returned = false)
 AND timestamp >= ${periodStart} AND timestamp < ${now}
 GROUP BY store_slug
 ORDER BY gmv DESC
 `,

 // Conversions: recent 50 orders (for Sales/Orders tab)
 sql`
 SELECT conversion_id, store_name, store_slug,
 order_total::float, currency, timestamp::text, order_id
 FROM conversions
 WHERE order_total > 0
 AND (returned IS NULL OR returned = false)
 ORDER BY timestamp DESC
 LIMIT 50
 `,

 // Conversions: price tiers by order_total (for Price Tiers tab)
 sql`
 SELECT
 CASE
 WHEN order_total < 100 THEN 'Under $100'
 WHEN order_total < 500 THEN '$100–$500'
 WHEN order_total < 1000 THEN '$500–$1,000'
 WHEN order_total < 5000 THEN '$1,000–$5,000'
 ELSE '$5,000+'
 END AS tier,
 CASE
 WHEN order_total < 100 THEN 1
 WHEN order_total < 500 THEN 2
 WHEN order_total < 1000 THEN 3
 WHEN order_total < 5000 THEN 4
 ELSE 5
 END AS sort_order,
 COUNT(*)::int AS count,
 SUM(order_total)::float AS total_gmv,
 AVG(order_total)::float AS avg_order
 FROM conversions
 WHERE order_total > 0
 AND (returned IS NULL OR returned = false)
 AND timestamp >= ${periodStart} AND timestamp < ${now}
 GROUP BY tier, sort_order
 ORDER BY sort_order
 `,

 // Conversions: weekly GMV trend (for Overview chart)
 sql`
 SELECT
 DATE_TRUNC('week', timestamp)::date::text AS week,
 COUNT(*)::int AS orders,
 SUM(order_total)::float AS gmv
 FROM conversions
 WHERE order_total > 0
 AND (returned IS NULL OR returned = false)
 AND timestamp >= ${periodStart} AND timestamp < ${now}
 GROUP BY DATE_TRUNC('week', timestamp)
 ORDER BY DATE_TRUNC('week', timestamp) ASC
 `,
 ]);

 const gmvRow = platformGmvRows[0];
 const userRow = userGrowthRows[0];
 const activeRow = activeUsersRows[0];
 const demandRow = demandStatsRows[0];
 const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
 const maxDow = Math.max(...dayOfWeekRows.map((r) => r.clicks as number), 1);

 // Merge stores that share the same name but have different slug variants in the DB
 function mergeByName<T extends { store_name: string; store_slug: string; gmv: number; orders: number }>(rows: T[]): T[] {
 const map = new Map<string, T>();
 for (const row of rows) {
 const key = row.store_name.trim().toLowerCase();
 if (map.has(key)) {
 const existing = map.get(key)!;
 existing.gmv += row.gmv;
 existing.orders += row.orders;
 } else {
 map.set(key, { ...row });
 }
 }
 return [...map.values()]
 .map((s) => ({ ...s, avg_order: s.orders > 0 ? s.gmv / s.orders : 0 } as T))
 .sort((a, b) => b.gmv - a.gmv);
 }

 const mergedConversionStores = mergeByName(
 allConversionStores as { store_name: string; store_slug: string; gmv: number; orders: number; avg_order: number }[]
 );
 const mergedTopStoresByGmv = mergeByName(
 topStoresByGmv as { store_name: string; store_slug: string; gmv: number; orders: number }[]
 );

 return NextResponse.json({
 summary, designers, topBrands, topCategories, tiers, storeVelocity, weeklyTrend, recentSales, priceChanges, totalAllTime,
 platform: {
 gmvCur: gmvRow.gmv_cur as number,
 gmvPrev: gmvRow.gmv_prev as number,
 ordersCur: gmvRow.orders_cur as number,
 ordersPrev: gmvRow.orders_prev as number,
 newUsersCur: userRow.new_cur as number,
 newUsersPrev: userRow.new_prev as number,
 totalUsers: userRow.total as number,
 activeUsersCur: activeRow.active_cur as number,
 activeUsersPrev: activeRow.active_prev as number,
 repeatBuyers: repeatBuyersRows[0]?.repeat_buyers as number ?? 0,
 topStoresByGmv: mergedTopStoresByGmv,
 dayOfWeek: dayOfWeekRows.map((r) => ({
 label: DOW_LABELS[r.dow as number] ?? String(r.dow),
 clicks: r.clicks as number,
 pct: Math.round(((r.clicks as number) / maxDow) * 100),
 })),
 },
 demand: {
 totalClicks: demandRow.total_clicks as number,
 uniqueUsers: demandRow.unique_users as number,
 storesActive: demandRow.stores_active as number,
 uniqueProducts: demandRow.unique_products as number,
 topProducts: topClickedProducts as { product_name: string; store_slug: string; clicks: number; unique_users: number }[],
 topStores: topStoresByClicks as { store_slug: string; store_name: string; clicks: number; unique_users: number; unique_products: number }[],
 weeklyTrend: weeklyClickTrend as { week: string; clicks: number; unique_users: number }[],
 topDesigners: topDesignersByClicks as { designer: string; clicks: number; unique_users: number; unique_products: number }[],
 },
 days,
 conversionStores: mergedConversionStores,
 recentOrders: recentOrderRows as { conversion_id: string; store_name: string; store_slug: string; order_total: number; currency: string; timestamp: string; order_id: string }[],
 conversionTiers: conversionTierRows as { tier: string; count: number; total_gmv: number; avg_order: number }[],
 conversionWeekly: conversionWeeklyRows as { week: string; orders: number; gmv: number }[],
 });
 } catch (err: unknown) {
 const message = err instanceof Error ? err.message : String(err);
 return NextResponse.json({ error: message }, { status: 500 });
 }
}
