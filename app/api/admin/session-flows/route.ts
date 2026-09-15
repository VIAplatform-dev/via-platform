import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

async function isAuthorized(request: NextRequest): Promise<boolean> {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (!adminToken) return false;
 const encoder = new TextEncoder();
 const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(adminPassword));
 const expected = Array.from(new Uint8Array(hashBuffer))
 .map((b) => b.toString(16).padStart(2, "0"))
 .join("");
 return adminToken === expected;
}

export async function GET(request: NextRequest) {
 if (!(await isAuthorized(request))) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database URL" }, { status: 500 });

 const { searchParams } = new URL(request.url);
 const range = searchParams.get("range") ?? "7d";

 let cutoff: string | null = null;
 if (range === "7d") {
 const d = new Date();
 d.setDate(d.getDate() - 7);
 cutoff = d.toISOString();
 } else if (range === "30d") {
 const d = new Date();
 d.setDate(d.getDate() - 30);
 cutoff = d.toISOString();
 }

 const sql = neon(dbUrl);

 // Ensure new columns exist (idempotent)
 try {
 await sql`ALTER TABLE page_type_views ADD COLUMN IF NOT EXISTS session_id TEXT`;
 await sql`ALTER TABLE page_type_views ADD COLUMN IF NOT EXISTS full_path TEXT`;
 await sql`ALTER TABLE page_type_views ADD COLUMN IF NOT EXISTS referrer_path TEXT`;
 await sql`ALTER TABLE page_type_views ADD COLUMN IF NOT EXISTS time_on_page_ms INTEGER`;
 } catch { /* table may not exist yet */ }

 const safe = async (fn: () => Promise<unknown[]>): Promise<unknown[]> => {
 try { return await fn(); } catch { return []; }
 };

 const [summaryRows, funnelRows, transitionRows, topPathRows, exitRateRows, timeOnPageRows] =
 await Promise.all([

 // 1. Summary
 safe(() => sql`
 WITH pv AS (
 SELECT user_id, page_type, timestamp, session_id, time_on_page_ms
 FROM page_type_views
 WHERE user_id IS NOT NULL
 AND (${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz)
 ),
 gapped AS (
 SELECT *,
 LAG(session_id) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_sid,
 LAG(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_ts
 FROM pv
 ),
 numbered AS (
 SELECT *,
 SUM(CASE
 WHEN session_id IS NOT NULL AND (prev_sid IS NULL OR prev_sid <> session_id) THEN 1
 WHEN session_id IS NULL AND (prev_ts IS NULL OR timestamp - prev_ts > INTERVAL '30 minutes') THEN 1
 ELSE 0
 END) OVER (PARTITION BY user_id ORDER BY timestamp ROWS UNBOUNDED PRECEDING) AS snum
 FROM gapped
 ),
 sessions AS (
 SELECT user_id,
 COALESCE(session_id, 'i-' || user_id || '-' || snum::text) AS sess_id,
 page_type, timestamp, time_on_page_ms
 FROM numbered
 ),
 session_agg AS (
 SELECT sess_id, user_id,
 COUNT(*)::int AS depth,
 EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp)))::float AS duration_s
 FROM sessions GROUP BY sess_id, user_id
 )
 SELECT
 COUNT(*)::int AS total_sessions,
 COUNT(DISTINCT user_id)::int AS unique_users,
 AVG(depth)::float AS avg_depth,
 AVG(duration_s)::float AS avg_duration_s,
 (SUM(CASE WHEN depth = 1 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)) AS bounce_rate
 FROM session_agg
 `),

 // 2. Funnel: session-based for top 3 stages, direct table counts for clicks/orders
 safe(() => sql`
 WITH pv AS (
 SELECT user_id, page_type, timestamp, session_id
 FROM page_type_views
 WHERE user_id IS NOT NULL
 AND (${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz)
 ),
 gapped AS (
 SELECT *,
 LAG(session_id) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_sid,
 LAG(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_ts
 FROM pv
 ),
 numbered AS (
 SELECT *,
 SUM(CASE
 WHEN session_id IS NOT NULL AND (prev_sid IS NULL OR prev_sid <> session_id) THEN 1
 WHEN session_id IS NULL AND (prev_ts IS NULL OR timestamp - prev_ts > INTERVAL '30 minutes') THEN 1
 ELSE 0
 END) OVER (PARTITION BY user_id ORDER BY timestamp ROWS UNBOUNDED PRECEDING) AS snum
 FROM gapped
 ),
 sessions AS (
 SELECT user_id,
 COALESCE(session_id, 'i-' || user_id || '-' || snum::text) AS sess_id,
 page_type, timestamp
 FROM numbered
 ),
 session_agg AS (
 SELECT sess_id,
 MAX(CASE WHEN page_type IN ('browse','new-arrivals','search','store','stores-list','collection','collections-list','brands','brand','category','categories-list','editors-picks','you-might-like') THEN 1 ELSE 0 END) AS browsed,
 MAX(CASE WHEN page_type = 'product' THEN 1 ELSE 0 END) AS viewed_product
 FROM sessions GROUP BY sess_id
 )
 SELECT
 COUNT(*)::int AS total,
 SUM(browsed)::int AS browsed_count,
 SUM(viewed_product)::int AS product_view_count,
 (SELECT COUNT(*)::int FROM clicks
 WHERE ${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz) AS clicked_count,
 (SELECT COUNT(*)::int FROM conversions
 WHERE order_total > 0 AND (returned IS NULL OR returned = false)
 AND (${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz)) AS ordered_count
 FROM session_agg
 `),

 // 3. Transitions
 safe(() => sql`
 WITH pv AS (
 SELECT user_id, page_type, timestamp, session_id
 FROM page_type_views
 WHERE user_id IS NOT NULL
 AND (${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz)
 ),
 gapped AS (
 SELECT *,
 LAG(session_id) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_sid,
 LAG(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_ts
 FROM pv
 ),
 numbered AS (
 SELECT *,
 SUM(CASE
 WHEN session_id IS NOT NULL AND (prev_sid IS NULL OR prev_sid <> session_id) THEN 1
 WHEN session_id IS NULL AND (prev_ts IS NULL OR timestamp - prev_ts > INTERVAL '30 minutes') THEN 1
 ELSE 0
 END) OVER (PARTITION BY user_id ORDER BY timestamp ROWS UNBOUNDED PRECEDING) AS snum
 FROM gapped
 ),
 sessions AS (
 SELECT user_id,
 COALESCE(session_id, 'i-' || user_id || '-' || snum::text) AS sess_id,
 page_type, timestamp
 FROM numbered
 ),
 ordered AS (
 SELECT sess_id, page_type, timestamp,
 LEAD(page_type) OVER (PARTITION BY sess_id ORDER BY timestamp) AS next_page
 FROM sessions
 )
 SELECT
 page_type AS from_page,
 COALESCE(next_page, 'exit') AS to_page,
 COUNT(*)::int AS count
 FROM ordered
 GROUP BY from_page, to_page
 ORDER BY from_page, count DESC
 `),

 // 4. Top Paths
 safe(() => sql`
 WITH pv AS (
 SELECT user_id, page_type, timestamp, session_id
 FROM page_type_views
 WHERE user_id IS NOT NULL
 AND (${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz)
 ),
 gapped AS (
 SELECT *,
 LAG(session_id) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_sid,
 LAG(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_ts
 FROM pv
 ),
 numbered AS (
 SELECT *,
 SUM(CASE
 WHEN session_id IS NOT NULL AND (prev_sid IS NULL OR prev_sid <> session_id) THEN 1
 WHEN session_id IS NULL AND (prev_ts IS NULL OR timestamp - prev_ts > INTERVAL '30 minutes') THEN 1
 ELSE 0
 END) OVER (PARTITION BY user_id ORDER BY timestamp ROWS UNBOUNDED PRECEDING) AS snum
 FROM gapped
 ),
 sessions AS (
 SELECT user_id,
 COALESCE(session_id, 'i-' || user_id || '-' || snum::text) AS sess_id,
 page_type, timestamp
 FROM numbered
 ),
 path_agg AS (
 SELECT sess_id,
 ARRAY_TO_STRING((ARRAY_AGG(page_type ORDER BY timestamp))[1:5], ' → ') AS path
 FROM sessions
 GROUP BY sess_id
 HAVING COUNT(*) >= 2
 )
 SELECT path, COUNT(*)::int AS count
 FROM path_agg
 GROUP BY path
 ORDER BY count DESC
 LIMIT 20
 `),

 // 5. Exit Rates
 safe(() => sql`
 WITH pv AS (
 SELECT user_id, page_type, timestamp, session_id
 FROM page_type_views
 WHERE user_id IS NOT NULL
 AND (${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz)
 ),
 gapped AS (
 SELECT *,
 LAG(session_id) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_sid,
 LAG(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_ts
 FROM pv
 ),
 numbered AS (
 SELECT *,
 SUM(CASE
 WHEN session_id IS NOT NULL AND (prev_sid IS NULL OR prev_sid <> session_id) THEN 1
 WHEN session_id IS NULL AND (prev_ts IS NULL OR timestamp - prev_ts > INTERVAL '30 minutes') THEN 1
 ELSE 0
 END) OVER (PARTITION BY user_id ORDER BY timestamp ROWS UNBOUNDED PRECEDING) AS snum
 FROM gapped
 ),
 sessions AS (
 SELECT user_id,
 COALESCE(session_id, 'i-' || user_id || '-' || snum::text) AS sess_id,
 page_type, timestamp
 FROM numbered
 ),
 last_pages AS (
 SELECT DISTINCT ON (sess_id) sess_id, page_type
 FROM sessions ORDER BY sess_id, timestamp DESC
 ),
 all_visits AS (
 SELECT page_type, COUNT(*)::int AS total_visits FROM sessions GROUP BY page_type
 ),
 exit_counts AS (
 SELECT page_type, COUNT(*)::int AS exits FROM last_pages GROUP BY page_type
 )
 SELECT
 av.page_type AS page,
 COALESCE(ec.exits, 0)::int AS exits,
 av.total_visits,
 (COALESCE(ec.exits, 0)::float / NULLIF(av.total_visits, 0)) AS exit_rate
 FROM all_visits av
 LEFT JOIN exit_counts ec ON ec.page_type = av.page_type
 ORDER BY exit_rate DESC
 `),

 // 6. Time on Page
 safe(() => sql`
 WITH pv AS (
 SELECT user_id, page_type, timestamp, session_id, time_on_page_ms
 FROM page_type_views
 WHERE user_id IS NOT NULL
 AND (${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz)
 ),
 gapped AS (
 SELECT *,
 LAG(session_id) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_sid,
 LAG(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) AS prev_ts
 FROM pv
 ),
 numbered AS (
 SELECT *,
 SUM(CASE
 WHEN session_id IS NOT NULL AND (prev_sid IS NULL OR prev_sid <> session_id) THEN 1
 WHEN session_id IS NULL AND (prev_ts IS NULL OR timestamp - prev_ts > INTERVAL '30 minutes') THEN 1
 ELSE 0
 END) OVER (PARTITION BY user_id ORDER BY timestamp ROWS UNBOUNDED PRECEDING) AS snum
 FROM gapped
 ),
 sessions AS (
 SELECT user_id,
 COALESCE(session_id, 'i-' || user_id || '-' || snum::text) AS sess_id,
 page_type, time_on_page_ms
 FROM numbered
 )
 SELECT
 page_type AS page,
 AVG(time_on_page_ms)::float AS avg_ms,
 COUNT(*)::int AS sample_size
 FROM sessions
 WHERE time_on_page_ms IS NOT NULL AND time_on_page_ms > 0 AND time_on_page_ms < 600000
 GROUP BY page_type
 ORDER BY avg_ms DESC
 `),

 ]);

 // Shape responses
 const sr = summaryRows[0] as Record<string, unknown> | undefined;
 const summary = {
 totalSessions: Number(sr?.total_sessions ?? 0),
 uniqueUsers: Number(sr?.unique_users ?? 0),
 avgDepth: Number(sr?.avg_depth ?? 0),
 avgDurationSeconds: Number(sr?.avg_duration_s ?? 0),
 bounceRate: Number(sr?.bounce_rate ?? 0),
 };

 const fr = funnelRows[0] as Record<string, unknown> | undefined;
 const total = Number(fr?.total ?? 0);
 const browsedCount = Number(fr?.browsed_count ?? 0);
 const productViewCount = Number(fr?.product_view_count ?? 0);
 const clickedCount = Number(fr?.clicked_count ?? 0);
 const orderedCount = Number(fr?.ordered_count ?? 0);
 const funnel = [
 { stage: "All Sessions", sessions: total, pct: 100 },
 { stage: "Browsed Listings", sessions: browsedCount, pct: total > 0 ? (browsedCount / total) * 100 : 0 },
 { stage: "Viewed Product", sessions: productViewCount, pct: total > 0 ? (productViewCount / total) * 100 : 0 },
 { stage: "Clicked Through", sessions: clickedCount, pct: total > 0 ? (clickedCount / total) * 100 : 0 },
 { stage: "Ordered", sessions: orderedCount, pct: total > 0 ? (orderedCount / total) * 100 : 0 },
 ];

 const transitions = (transitionRows as Array<Record<string, unknown>>).map((r) => ({
 fromPage: String(r.from_page ?? ""),
 toPage: String(r.to_page ?? ""),
 count: Number(r.count ?? 0),
 }));

 const topPaths = (topPathRows as Array<Record<string, unknown>>).map((r) => ({
 path: String(r.path ?? ""),
 count: Number(r.count ?? 0),
 }));

 const exitRates = (exitRateRows as Array<Record<string, unknown>>).map((r) => ({
 page: String(r.page ?? ""),
 exits: Number(r.exits ?? 0),
 totalVisits: Number(r.total_visits ?? 0),
 exitRate: Number(r.exit_rate ?? 0),
 }));

 const timeOnPage = (timeOnPageRows as Array<Record<string, unknown>>).map((r) => ({
 page: String(r.page ?? ""),
 avgMs: Number(r.avg_ms ?? 0),
 sampleSize: Number(r.sample_size ?? 0),
 }));

 return NextResponse.json({ summary, funnel, transitions, topPaths, exitRates, timeOnPage });
}
