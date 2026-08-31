import { NextRequest, NextResponse } from "next/server";
import { LEGACY_NON_SOURCES, normalizeStoredSource, rollUpBySource } from "@/app/lib/traffic-source";
import { neon } from "@neondatabase/serverless";

export const runtime = "edge";

async function isAuthorized(request: NextRequest): Promise<boolean> {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (!adminToken) return false;
 const encoder = new TextEncoder();
 const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(adminPassword));
 const expected = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
 return adminToken === expected;
}

function getCutoff(range: string): Date | null {
 const now = new Date();
 if (range === "7d") {
 return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
 }
 if (range === "30d") {
 return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
 }
 return null;
}

export async function GET(request: NextRequest) {
 if (!(await isAuthorized(request))) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const { searchParams } = new URL(request.url);
 const range = searchParams.get("range") ?? "7d";

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) {
 return NextResponse.json({ error: "No database URL configured" }, { status: 500 });
 }

 const sql = neon(dbUrl);
 const cutoff = getCutoff(range);
 const cutoffIso = cutoff ? cutoff.toISOString() : null;

 // Ensure utm_source column exists — migration normally runs inside saveClick,
 // but if no click has fired since deployment the column won't exist yet and
 // the clicksBySource query would silently return [] via .catch(() => []).
 await sql`ALTER TABLE clicks ADD COLUMN IF NOT EXISTS utm_source TEXT`.catch(() => {});

 // ── KPIs ─────────────────────────────────────────────────────────────────

 const [
 kpiClicksResult,
 kpiViewsResult,
 kpiRevenueResult,
 kpiCustomersResult,
 kpiSignupsResult,
 kpiCommissionResult,
 topClicksResult,
 topViewsResult,
 topStoresResult,
 signupsByDayResult,
 referralResult,
 recentActivityResult,
 recentConversionsResult,
 inventorySummaryResult,
 inventoryByStoreResult,
 collabsDataResult,
 topSearchesResult,
 pageFunnelResult,
 trafficSourcesResult,
 dropOffProductsResult,
 clicksBySourceResult,
 conversionsBySourceResult,
 ] = await Promise.all([
 // totalClicks
 cutoffIso
 ? sql`SELECT COUNT(*)::int AS total FROM clicks WHERE timestamp >= ${cutoffIso}`
 : sql`SELECT COUNT(*)::int AS total FROM clicks`,

 // totalViews
 cutoffIso
 ? sql`SELECT COUNT(*)::int AS total FROM product_views WHERE timestamp >= ${cutoffIso}`
 : sql`SELECT COUNT(*)::int AS total FROM product_views`,

 // totalRevenue + totalConversions + matched breakdown — always all-time, excluding returned orders
 sql`SELECT COALESCE(SUM(order_total), 0)::float AS revenue, COUNT(*)::int AS conversions, COUNT(*) FILTER (WHERE matched = true)::int AS matched, COUNT(*) FILTER (WHERE matched = false OR matched IS NULL)::int AS unmatched FROM conversions WHERE order_total > 0 AND (returned IS NULL OR returned = false)`,

 // totalCustomers — registered accounts (users table) + pilot/waitlist breakdown
 sql`
 SELECT
 (SELECT COUNT(*)::int FROM users)::int AS total,
 (SELECT COUNT(*) FROM pilot_access WHERE status = 'approved')::int AS approved,
 (SELECT COUNT(*) FROM pilot_access)::int AS pilot_total,
 (SELECT COUNT(*) FROM waitlist
 WHERE LOWER(email) NOT IN (SELECT LOWER(email) FROM pilot_access))::int AS waitlist_only
 `,

 // newSignupsInPeriod — new registered accounts from the users table
 cutoffIso
 ? sql`SELECT COUNT(*)::int AS total FROM users WHERE created_at >= ${cutoffIso}`
 : sql`SELECT COUNT(*)::int AS total FROM users`,

 // totalCommission — tiered commission on all conversions, always all-time, excluding returned orders
 sql`SELECT COALESCE(SUM(CASE WHEN order_total < 1000 THEN order_total * 0.07 WHEN order_total <= 5000 THEN order_total * 0.05 ELSE order_total * 0.03 END), 0)::float AS commission FROM conversions WHERE order_total > 0 AND (returned IS NULL OR returned = false)`,

 // topProductsByClicks
 cutoffIso
 ? sql`
 SELECT
 product_id AS "productId",
 product_name AS name,
 store,
 COUNT(*)::int AS clicks
 FROM clicks
 WHERE timestamp >= ${cutoffIso}
 GROUP BY product_id, product_name, store
 ORDER BY clicks DESC
 LIMIT 15
 `
 : sql`
 SELECT
 product_id AS "productId",
 product_name AS name,
 store,
 COUNT(*)::int AS clicks
 FROM clicks
 GROUP BY product_id, product_name, store
 ORDER BY clicks DESC
 LIMIT 15
 `,

 // topProductsByViews — falls back to clicks table for name/store when product is sold out/removed
 cutoffIso
 ? sql`
 SELECT
 pv.product_id AS "productId",
 COALESCE(p.title, lc.product_name) AS name,
 COALESCE(p.store_name, lc.store) AS store,
 COUNT(*)::int AS views
 FROM product_views pv
 LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 LEFT JOIN LATERAL (
 SELECT product_name, store FROM clicks
 WHERE product_id = pv.product_id
 ORDER BY timestamp DESC LIMIT 1
 ) lc ON true
 WHERE pv.timestamp >= ${cutoffIso}
 GROUP BY pv.product_id, p.title, p.store_name, lc.product_name, lc.store
 ORDER BY views DESC
 LIMIT 15
 `
 : sql`
 SELECT
 pv.product_id AS "productId",
 COALESCE(p.title, lc.product_name) AS name,
 COALESCE(p.store_name, lc.store) AS store,
 COUNT(*)::int AS views
 FROM product_views pv
 LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 LEFT JOIN LATERAL (
 SELECT product_name, store FROM clicks
 WHERE product_id = pv.product_id
 ORDER BY timestamp DESC LIMIT 1
 ) lc ON true
 GROUP BY pv.product_id, p.title, p.store_name, lc.product_name, lc.store
 ORDER BY views DESC
 LIMIT 15
 `,

 // topStores — product views on VYA + conversions + revenue joined by store slug
 // sorted by revenue DESC so highest-earning stores appear first
 cutoffIso
 ? sql`
 WITH view_counts AS (
 SELECT p.store_slug, MAX(p.store_name) AS store_name, COUNT(*)::int AS views
 FROM product_views pv
 JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 WHERE pv.timestamp >= ${cutoffIso}
 GROUP BY p.store_slug
 ),
 conv_stats AS (
 SELECT store_slug, MAX(store_name) AS store_name,
 COUNT(*)::int AS conversions,
 COALESCE(SUM(order_total), 0)::float AS revenue
 FROM conversions
 WHERE order_total > 0
 AND (returned IS NULL OR returned = false)
 AND timestamp >= ${cutoffIso}
 GROUP BY store_slug
 )
 SELECT
 COALESCE(v.store_slug, c.store_slug) AS store,
 COALESCE(v.store_name, c.store_name, v.store_slug, c.store_slug) AS store_display,
 COALESCE(v.views, 0) AS clicks,
 COALESCE(c.conversions, 0) AS conversions,
 COALESCE(c.revenue, 0) AS revenue
 FROM conv_stats c
 FULL OUTER JOIN view_counts v ON v.store_slug = c.store_slug
 ORDER BY revenue DESC, clicks DESC
 `
 : sql`
 WITH view_counts AS (
 SELECT p.store_slug, MAX(p.store_name) AS store_name, COUNT(*)::int AS views
 FROM product_views pv
 JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 GROUP BY p.store_slug
 ),
 conv_stats AS (
 SELECT store_slug, MAX(store_name) AS store_name,
 COUNT(*)::int AS conversions,
 COALESCE(SUM(order_total), 0)::float AS revenue
 FROM conversions
 WHERE order_total > 0
 AND (returned IS NULL OR returned = false)
 GROUP BY store_slug
 )
 SELECT
 COALESCE(v.store_slug, c.store_slug) AS store,
 COALESCE(v.store_name, c.store_name, v.store_slug, c.store_slug) AS store_display,
 COALESCE(v.views, 0) AS clicks,
 COALESCE(c.conversions, 0) AS conversions,
 COALESCE(c.revenue, 0) AS revenue
 FROM conv_stats c
 FULL OUTER JOIN view_counts v ON v.store_slug = c.store_slug
 ORDER BY revenue DESC, clicks DESC
 `,

 // signupsByDay — for "all" use last 60 days, otherwise use cutoff
 (() => {
 const dayCutoff = range === "all"
 ? new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
 : cutoffIso;

 return dayCutoff
 ? sql`
 SELECT
 TO_CHAR(day::date, 'YYYY-MM-DD') AS date,
 COUNT(*)::int AS count
 FROM (
 SELECT created_at AS day, email FROM pilot_access WHERE created_at >= ${dayCutoff}
 UNION
 SELECT signup_date AS day, email FROM waitlist WHERE signup_date >= ${dayCutoff}
 ) AS combined
 GROUP BY day::date
 ORDER BY day::date ASC
 `
 : sql`
 SELECT
 TO_CHAR(day::date, 'YYYY-MM-DD') AS date,
 COUNT(*)::int AS count
 FROM (
 SELECT created_at AS day, email FROM pilot_access
 UNION
 SELECT signup_date AS day, email FROM waitlist
 ) AS combined
 GROUP BY day::date
 ORDER BY day::date ASC
 `;
 })(),

 // referralLeaderboard
 sql`
 SELECT
 pa.referral_code AS code,
 pa.email,
 pa.first_name AS "firstName",
 pa.last_name AS "lastName",
 COUNT(ref.id)::int AS "referralCount"
 FROM pilot_access pa
 LEFT JOIN pilot_access ref ON ref.referred_by = pa.referral_code
 WHERE pa.referral_code IS NOT NULL
 GROUP BY pa.referral_code, pa.email, pa.first_name, pa.last_name
 HAVING COUNT(ref.id) > 0
 ORDER BY "referralCount" DESC
 LIMIT 15
 `,

 // recentActivity — last 50 product views (clicking a product on VYA)
 sql`
 SELECT
 pv.timestamp,
 pv.product_id AS "productId",
 COALESCE(p.title, pv.product_id) AS "productName",
 COALESCE(p.store_name, '') AS store
 FROM product_views pv
 LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 ORDER BY pv.timestamp DESC
 LIMIT 50
 `,

 // recentConversions — all orders with attribution + buyer identity
 cutoffIso
 ? sql`
 SELECT
 c.conversion_id,
 c.timestamp,
 c.order_id,
 c.order_total::float,
 c.store_slug,
 c.store_name,
 c.matched,
 c.via_click_id,
 c.matched_click_data,
 c.user_id,
 c.returned,
 c.returned_at,
 u.email AS buyer_email,
 u.name AS buyer_name
 FROM conversions c
 LEFT JOIN users u ON u.id::text = c.user_id
 WHERE c.order_total > 0 AND c.timestamp >= ${cutoffIso}
 ORDER BY c.timestamp DESC
 LIMIT 10000
 `
 : sql`
 SELECT
 c.conversion_id,
 c.timestamp,
 c.order_id,
 c.order_total::float,
 c.store_slug,
 c.store_name,
 c.matched,
 c.via_click_id,
 c.matched_click_data,
 c.user_id,
 c.returned,
 c.returned_at,
 u.email AS buyer_email,
 u.name AS buyer_name
 FROM conversions c
 LEFT JOIN users u ON u.id::text = c.user_id
 WHERE c.order_total > 0
 ORDER BY c.timestamp DESC
 LIMIT 10000
 `,

 // inventorySummary
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

 // inventoryByStore
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

 // collabsData from settings cache
 sql`SELECT value FROM app_settings WHERE key = 'collabs_data'`.catch(() => []),

 // topSearches
 cutoffIso
 ? sql`SELECT query, COUNT(*)::int AS count FROM searches WHERE timestamp >= ${cutoffIso} GROUP BY query ORDER BY count DESC LIMIT 25`.catch(() => [])
 : sql`SELECT query, COUNT(*)::int AS count FROM searches GROUP BY query ORDER BY count DESC LIMIT 25`.catch(() => []),

 // pageFunnel — views by page type so we can see UX drop-off
 cutoffIso
 ? sql`
 SELECT page_type, COUNT(*)::int AS views
 FROM page_type_views
 WHERE timestamp >= ${cutoffIso}
 GROUP BY page_type
 `.catch(() => [])
 : sql`
 SELECT page_type, COUNT(*)::int AS views
 FROM page_type_views
 GROUP BY page_type
 `.catch(() => []),

 // trafficSources — UTM visits grouped by source + medium + campaign
 cutoffIso
 ? sql`
 SELECT
 utm_source,
 utm_medium,
 utm_campaign,
 COUNT(*)::int AS visits,
 COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS known_users
 FROM utm_visits
 WHERE timestamp >= ${cutoffIso}
 GROUP BY utm_source, utm_medium, utm_campaign
 ORDER BY visits DESC
 LIMIT 50
 `.catch(() => [])
 : sql`
 SELECT
 utm_source,
 utm_medium,
 utm_campaign,
 COUNT(*)::int AS visits,
 COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS known_users
 FROM utm_visits
 GROUP BY utm_source, utm_medium, utm_campaign
 ORDER BY visits DESC
 LIMIT 50
 `.catch(() => []),

 // dropOffProducts — products with the most views relative to clicks (browsed but not bought)
 cutoffIso
 ? sql`
 SELECT
 pv.product_id AS "productId",
 COALESCE(p.title, pv.product_id) AS name,
 COALESCE(p.store_name, '') AS store,
 COUNT(DISTINCT pv.id)::int AS views,
 COUNT(DISTINCT c.click_id)::int AS clicks
 FROM product_views pv
 LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 LEFT JOIN clicks c ON c.product_id = pv.product_id AND c.timestamp >= ${cutoffIso}
 WHERE pv.timestamp >= ${cutoffIso}
 GROUP BY pv.product_id, p.title, p.store_name
 HAVING COUNT(DISTINCT pv.id) >= 2
 ORDER BY (COUNT(DISTINCT pv.id) - COUNT(DISTINCT c.click_id)) DESC, views DESC
 LIMIT 15
 `.catch(() => [])
 : sql`
 SELECT
 pv.product_id AS "productId",
 COALESCE(p.title, pv.product_id) AS name,
 COALESCE(p.store_name, '') AS store,
 COUNT(DISTINCT pv.id)::int AS views,
 COUNT(DISTINCT c.click_id)::int AS clicks
 FROM product_views pv
 LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 LEFT JOIN clicks c ON c.product_id = pv.product_id
 GROUP BY pv.product_id, p.title, p.store_name
 HAVING COUNT(DISTINCT pv.id) >= 2
 ORDER BY (COUNT(DISTINCT pv.id) - COUNT(DISTINCT c.click_id)) DESC, views DESC
 LIMIT 15
 `.catch(() => []),

 // clicksBySource — store clicks grouped by utm_source
 cutoffIso
 ? sql`
 SELECT utm_source, COUNT(*)::int AS clicks
 FROM clicks
 WHERE utm_source IS NOT NULL AND timestamp >= ${cutoffIso}
 GROUP BY utm_source
 ORDER BY clicks DESC
 `.catch(() => [])
 : sql`
 SELECT utm_source, COUNT(*)::int AS clicks
 FROM clicks
 WHERE utm_source IS NOT NULL
 GROUP BY utm_source
 ORDER BY clicks DESC
 `.catch(() => []),

 // conversionsBySource — ONE ROW PER ORDER, carrying every attribution candidate,
 // so first-touch and last-touch can both be computed without running the join twice.
 // There are fewer than a hundred orders, so aggregating in JS is cheaper than two
 // GROUP BY passes and keeps the two definitions provably consistent.
 //
 // Orders with NO source at all are no longer dropped (the old query had
 // `WHERE ... IS NOT NULL`, which silently hid them and made the column totals
 // disagree with the Orders KPI). They normalize to "Direct", which is what they are.
 cutoffIso
 ? sql`
 SELECT
 conv.id,
 conv.order_total,
 c.utm_source AS click_source,
 fv.utm_source AS first_visit_source,
 lv.utm_source AS last_visit_source
 FROM conversions conv
 LEFT JOIN clicks c ON c.click_id = conv.via_click_id
 LEFT JOIN LATERAL (
 SELECT utm_source FROM utm_visits
 WHERE user_id = conv.user_id AND utm_source IS NOT NULL
  AND lower(utm_source) <> ALL(${LEGACY_NON_SOURCES})
 ORDER BY timestamp ASC LIMIT 1
 ) fv ON true
 LEFT JOIN LATERAL (
 SELECT utm_source FROM utm_visits
 WHERE user_id = conv.user_id AND utm_source IS NOT NULL
 ORDER BY timestamp DESC LIMIT 1
 ) lv ON true
 WHERE (conv.returned IS NULL OR conv.returned = false)
  AND conv.order_total > 0
  AND conv.timestamp >= ${cutoffIso}
 `.catch(() => [])
 : sql`
 SELECT
 conv.id,
 conv.order_total,
 c.utm_source AS click_source,
 fv.utm_source AS first_visit_source,
 lv.utm_source AS last_visit_source
 FROM conversions conv
 LEFT JOIN clicks c ON c.click_id = conv.via_click_id
 LEFT JOIN LATERAL (
 SELECT utm_source FROM utm_visits
 WHERE user_id = conv.user_id AND utm_source IS NOT NULL
  AND lower(utm_source) <> ALL(${LEGACY_NON_SOURCES})
 ORDER BY timestamp ASC LIMIT 1
 ) fv ON true
 LEFT JOIN LATERAL (
 SELECT utm_source FROM utm_visits
 WHERE user_id = conv.user_id AND utm_source IS NOT NULL
 ORDER BY timestamp DESC LIMIT 1
 ) lv ON true
 WHERE (conv.returned IS NULL OR conv.returned = false)
  AND conv.order_total > 0
 `.catch(() => []),
 ]);

 // Parse Shopify Collabs cached data (all-time totals — for the Collabs tab display only)
 let collabsTotalOrders = 0;
 let collabsEstimatedRevenue = 0;
 let collabsTotalCommission = 0;
 try {
 const rawCollabs = collabsDataResult[0]?.value as string | undefined;
 if (rawCollabs) {
 const partnerships = JSON.parse(rawCollabs) as Array<{
 totalOrders: number;
 totalCommissionEarned: string;
 }>;
 for (const p of partnerships) {
 collabsTotalOrders += p.totalOrders ?? 0;
 const commissionNum = parseFloat((p.totalCommissionEarned ?? "").replace(/[^0-9.]/g, ""));
 if (!isNaN(commissionNum) && commissionNum > 0) {
 collabsTotalCommission += commissionNum;
 collabsEstimatedRevenue += commissionNum / 0.07;
 }
 }
 }
 } catch {}

 // Main KPIs come directly from the conversions table (which now includes Collabs-sourced records)
 const kpis = {
 totalClicks: (kpiClicksResult[0]?.total as number) ?? 0,
 totalViews: (kpiViewsResult[0]?.total as number) ?? 0,
 totalRevenue: (kpiRevenueResult[0]?.revenue as number) ?? 0,
 totalConversions: (kpiRevenueResult[0]?.conversions as number) ?? 0,
 matchedConversions: (kpiRevenueResult[0]?.matched as number) ?? 0,
 unmatchedConversions: (kpiRevenueResult[0]?.unmatched as number) ?? 0,
 totalCustomers: (kpiCustomersResult[0]?.total as number) ?? 0,
 approvedCustomers: (kpiCustomersResult[0]?.approved as number) ?? 0,
 pilotTotal: (kpiCustomersResult[0]?.pilot_total as number) ?? 0,
 waitlistOnly: (kpiCustomersResult[0]?.waitlist_only as number) ?? 0,
 newSignupsThisWeek: (kpiSignupsResult[0]?.total as number) ?? 0,
 collabsTotalOrders,
 collabsEstimatedRevenue: Math.round(collabsEstimatedRevenue * 100) / 100,
 collabsTotalCommission: Math.round(collabsTotalCommission * 100) / 100,
 totalCommission: Math.round(((kpiCommissionResult[0]?.commission as number) ?? 0) * 100) / 100,
 };

 const invS = inventorySummaryResult[0];
 const inventory = {
 productCount: (invS?.product_count as number) ?? 0,
 inventoryValue: Number(invS?.inventory_value ?? 0),
 potentialCommission: Number(invS?.potential_commission ?? 0),
 tier1Count: (invS?.tier1_count as number) ?? 0,
 tier2Count: (invS?.tier2_count as number) ?? 0,
 tier3Count: (invS?.tier3_count as number) ?? 0,
 byStore: inventoryByStoreResult.map((r) => ({
 storeSlug: r.store_slug as string,
 productCount: r.product_count as number,
 inventoryValue: Number(r.inventory_value),
 potentialCommission: Number(r.potential_commission),
 })),
 };

 const response = NextResponse.json({
 kpis,
 topProductsByClicks: topClicksResult,
 topProductsByViews: topViewsResult,
 topStores: (topStoresResult as { store: string; store_display: string; clicks: number; conversions: number; revenue: number }[]).map((r) => ({
 store: r.store_display || r.store,
 clicks: r.clicks,
 conversions: r.conversions,
 revenue: r.revenue,
 })),
 signupsByDay: signupsByDayResult,
 referralLeaderboard: referralResult.map((r) => ({
 name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email,
 email: r.email,
 code: r.code,
 referralCount: r.referralCount,
 })),
 recentActivity: recentActivityResult,
 topSearches: (topSearchesResult as { query: string; count: number }[]).map((r) => ({
 query: r.query,
 count: r.count,
 })),
 pageFunnel: (pageFunnelResult as { page_type: string; views: number }[]).map((r) => ({
 pageType: r.page_type,
 views: r.views,
 })),
// Rolled up through normalizeStoredSource so legacy browser-name rows (chrome,
 // safari, edge — written by the old user-agent fallback in GlobalPageTracker)
 // collapse into a single honest "Direct" row instead of showing as four fake
 // sources. Same helper the customers list uses, so the two now reconcile.
 trafficSources: rollUpBySource(
  (trafficSourcesResult as { utm_source: string; utm_medium: string | null; utm_campaign: string | null; visits: number; known_users: number }[]).map((r) => ({
   source: r.utm_source,
   medium: r.utm_medium,
   campaign: r.utm_campaign,
   visits: r.visits,
   knownUsers: r.known_users,
  })),
  "source",
  ["visits", "knownUsers"],
 ).sort((a, b) => b.visits - a.visits),
 clicksBySource: rollUpBySource(
  (clicksBySourceResult as { utm_source: string; clicks: number }[]).map((r) => ({ source: r.utm_source, clicks: r.clicks })),
  "source",
  ["clicks"],
 ),
 // FIRST touch  = the earliest REAL channel this customer ever arrived through.
 //                (Same rule the customer list uses, so the two pages agree.)
 // LAST touch   = the click that carried them to the order, else their most recent visit.
 //                (What the panel showed before, and all it showed.)
 // Both are computed from the SAME order rows, so the two columns always sum to the
 // same order count and the same revenue — they only disagree about who gets credit.
 ...(() => {
  const orderRows = conversionsBySourceResult as {
   order_total: number;
   click_source: string | null;
   first_visit_source: string | null;
   last_visit_source: string | null;
  }[];
  const tally = (pick: (r: (typeof orderRows)[number]) => string | null) =>
   rollUpBySource(
    orderRows.map((r) => ({ source: normalizeStoredSource(pick(r)), conversions: 1, revenue: Number(r.order_total) || 0 })),
    "source",
    ["conversions", "revenue"],
   ).sort((a, b) => b.revenue - a.revenue);

  const firstTouch = tally((r) => r.first_visit_source ?? r.click_source ?? r.last_visit_source);
  const lastTouch = tally((r) => r.click_source ?? r.last_visit_source);
  // conversionsBySource stays on last touch so any existing consumer is unaffected.
  return { conversionsByFirstTouch: firstTouch, conversionsByLastTouch: lastTouch, conversionsBySource: lastTouch };
 })(),
 dropOffProducts: (dropOffProductsResult as { productId: string; name: string; store: string; views: number; clicks: number }[]).map((r) => ({
 productId: r.productId,
 name: r.name,
 store: r.store,
 views: r.views,
 clicks: r.clicks,
 })),
 recentConversions: recentConversionsResult.map((r) => ({
 conversionId: r.conversion_id as string,
 timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp as string,
 orderId: r.order_id as string,
 orderTotal: r.order_total as number,
 storeSlug: r.store_slug as string,
 storeName: r.store_name as string,
 matched: r.matched as boolean,
 viaClickId: r.via_click_id as string | null,
 clickedProduct: (r.matched_click_data as { productName?: string } | null)?.productName ?? null,
 userId: r.user_id as string | null,
 buyerEmail: r.buyer_email as string | null,
 buyerName: r.buyer_name as string | null,
 returned: (r.returned as boolean) ?? false,
 returnedAt: r.returned_at ? (r.returned_at instanceof Date ? r.returned_at.toISOString() : r.returned_at as string) : null,
 })),
 inventory,
 });
 response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
 return response;
 } catch (err) {
 console.error("[analytics-deep] error:", err);
 return NextResponse.json(
 { error: "Internal server error", details: String(err) },
 { status: 500 }
 );
 }
}
