import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { LEGACY_NON_SOURCES, canonicalSource, normalizeStoredSource, sourceChannel } from "@/app/lib/traffic-source";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function getDb() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

function hashPassword(password: string): string {
 return crypto.createHash("sha256").update(password).digest("hex");
}

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 return !!adminToken && adminToken === hashPassword(adminPassword);
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
 const sql = getDb();

 // Diagnostic: where do the "customers" come from? Reveals whether the count is real
 // (waitlist/pilot rows) or inflated by a fan-out JOIN (many users sharing one email).
 if (new URL(request.url).searchParams.get("debug") === "counts") {
 const [wl, pa, us, dup, ac] = await Promise.all([
 sql`SELECT count(*)::int AS n FROM waitlist`.catch(() => [{ n: -1 }]),
 sql`SELECT count(*)::int AS n FROM pilot_access`.catch(() => [{ n: -1 }]),
 sql`SELECT count(*)::int AS n, count(DISTINCT LOWER(email))::int AS distinct_email FROM users`.catch(() => [{ n: -1, distinct_email: -1 }]),
 sql`SELECT COALESCE(MAX(c),0)::int AS max_users_per_email, COUNT(*)::int AS emails_with_dupes FROM (SELECT COUNT(*) c FROM users WHERE email IS NOT NULL GROUP BY LOWER(email) HAVING COUNT(*) > 1) t`.catch(() => [{ max_users_per_email: -1, emails_with_dupes: -1 }]),
 sql`SELECT count(*)::int AS n FROM (SELECT email FROM pilot_access UNION SELECT email FROM waitlist w WHERE LOWER(w.email) NOT IN (SELECT LOWER(email) FROM pilot_access)) x`.catch(() => [{ n: -1 }]),
 ]) as { n: number; distinct_email?: number; max_users_per_email?: number; emails_with_dupes?: number }[][];
 /* eslint-disable @typescript-eslint/no-explicit-any */
 const [distinct, bySource, byStatus, recent, dupEmails] = await Promise.all([
 sql`SELECT count(DISTINCT LOWER(email))::int AS n FROM pilot_access`.catch(() => [{ n: -1 }]),
 sql`SELECT COALESCE(source,'(null)') AS source, count(*)::int AS n FROM pilot_access GROUP BY source ORDER BY n DESC LIMIT 10`.catch(() => []),
 sql`SELECT COALESCE(status,'(null)') AS status, count(*)::int AS n FROM pilot_access GROUP BY status ORDER BY n DESC LIMIT 10`.catch(() => []),
 sql`SELECT count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS d1, count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS d7, count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS d30 FROM pilot_access`.catch(() => [{ d1: -1, d7: -1, d30: -1 }]),
 sql`SELECT LOWER(email) AS email, count(*)::int AS n FROM pilot_access GROUP BY LOWER(email) ORDER BY n DESC LIMIT 5`.catch(() => []),
 ]) as any[][];
 return NextResponse.json({
 waitlist_rows: wl[0].n,
 pilot_access_rows: pa[0].n,
 pilot_access_distinct_emails: distinct[0].n,
 all_customers_union: ac[0].n,
 users_rows: us[0].n, users_distinct_emails: us[0].distinct_email,
 max_users_sharing_one_email: dup[0].max_users_per_email,
 pilot_access_by_source: bySource,
 pilot_access_by_status: byStatus,
 pilot_access_created: recent[0],
 top_duplicated_emails: dupEmails,
 });
 }

 // Ensure the pilot_access.source column exists (registration captures it now) so
 // the query below can read it even before any new registration has created it.
 await sql`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS source VARCHAR(50)`;

 // Union pilot_access + waitlist, deduped by email (pilot_access takes priority)
 // Then join with users/accounts for login method
 const rows = await sql`
 WITH all_customers AS (
 SELECT
 pa.email,
 pa.first_name,
 pa.last_name,
 pa.phone,
 pa.status,
 pa.created_at,
 pa.approved_at,
 pa.referral_code,
 pa.referred_by,
 pa.email_subscribe,
 pa.source
 FROM pilot_access pa
 UNION
 SELECT
 w.email,
 NULL AS first_name,
 NULL AS last_name,
 NULL AS phone,
 'waitlist' AS status,
 w.signup_date AS created_at,
 NULL AS approved_at,
 NULL AS referral_code,
 NULL AS referred_by,
 FALSE AS email_subscribe,
 NULL AS source
 FROM waitlist w
 WHERE LOWER(w.email) NOT IN (SELECT LOWER(email) FROM pilot_access)
 ),
 fav_counts AS (SELECT user_id::text AS uid, COUNT(*) AS cnt, MAX(created_at) AS last_at FROM product_favorites WHERE user_id IS NOT NULL GROUP BY user_id::text),
 cart_counts AS (SELECT user_id::text AS uid, COUNT(*) AS cnt, MAX(added_at) AS last_at FROM user_cart_items WHERE user_id IS NOT NULL GROUP BY user_id::text),
 -- The high-volume event tables (clicks, views, page-views) are bounded to the last year so the
 -- aggregate uses the timestamp index instead of scanning the whole history on every request —
 -- otherwise this page gets slower as those tables grow and eventually hangs.
 click_counts AS (SELECT user_id::text AS uid, COUNT(*) AS cnt, MAX(timestamp) AS last_at FROM clicks WHERE user_id IS NOT NULL AND timestamp >= now() - interval '365 days' GROUP BY user_id::text),
 view_counts AS (SELECT user_id::text AS uid, COUNT(*) AS cnt, MAX(timestamp) AS last_at FROM product_views WHERE user_id IS NOT NULL AND timestamp >= now() - interval '365 days' GROUP BY user_id::text),
 order_counts AS (SELECT user_id::text AS uid, COUNT(*) AS cnt, MAX(timestamp) AS last_at FROM conversions WHERE order_total > 0 AND user_id IS NOT NULL GROUP BY user_id::text),
 page_counts AS (SELECT user_id::text AS uid, COUNT(*) AS cnt, MAX(timestamp) AS last_at FROM page_type_views WHERE user_id IS NOT NULL AND timestamp >= now() - interval '365 days' GROUP BY user_id::text),
 ltv_amounts AS (SELECT user_id::text AS uid, SUM(order_total) AS total FROM conversions WHERE order_total > 0 AND user_id IS NOT NULL GROUP BY user_id::text),
 -- Prefer the earliest NON-direct source: ordinary return visits get logged as
 -- "direct", so picking strictly the earliest visit would mask a real source we
 -- captured on another visit. Real sources sort first; "direct" only wins if it's
 -- genuinely all we have.
 first_source AS (
  SELECT DISTINCT ON (user_id) user_id AS uid, utm_source AS source
  FROM utm_visits
  WHERE user_id IS NOT NULL
  ORDER BY user_id,
   CASE
    WHEN utm_source IS NULL OR btrim(utm_source) = '' THEN 2
    -- Browser names and placeholders, from ONE shared list (app/lib/traffic-source.ts)
    -- rather than a literal that drifts away from the other three copies.
    WHEN lower(utm_source) = ANY(${LEGACY_NON_SOURCES}) THEN 1
    ELSE 0
   END,
   timestamp ASC
 ),
 -- Waitlist/giveaway signups store their captured acquisition source here (the
 -- page tracker sends it on submit), but these folks often have no user_id, so the
 -- utm_visits join above misses them. Read it by email as a fallback.
 wl_source AS (
  SELECT LOWER(email) AS email, MAX(source) AS source
  FROM waitlist
  WHERE source IS NOT NULL AND lower(source) NOT IN ('waitlist', '', 'unknown')
  GROUP BY LOWER(email)
 )
 SELECT
 ac.email,
 ac.first_name,
 ac.last_name,
 ac.phone,
 ac.status,
 ac.created_at,
 ac.approved_at,
 ac.referral_code,
 ac.referred_by,
 ac.email_subscribe,
 u.name AS user_name,
 u.id AS user_id,
 STRING_AGG(DISTINCT a.provider, ',') AS providers,
 COALESCE(MAX(fav.cnt), 0) +
 COALESCE(MAX(cart.cnt), 0) +
 COALESCE(MAX(clk.cnt), 0) +
 COALESCE(MAX(vw.cnt), 0) +
 COALESCE(MAX(ord.cnt), 0) AS activity_score,
 COALESCE(MAX(clk.cnt), 0) AS click_count,
 COALESCE(MAX(vw.cnt), 0) AS view_count,
 COALESCE(MAX(fav.cnt), 0) AS favorite_count,
 COALESCE(MAX(cart.cnt), 0) AS cart_count,
 COALESCE(MAX(ord.cnt), 0) AS order_count,
 COALESCE(MAX(pg.cnt), 0) AS page_view_count,
 COALESCE(MAX(ltv.total), 0) AS total_spend,
 -- Prefer a REAL source wherever we have one, in order of trustworthiness:
 -- what the signup form captured, then the earliest real utm_visit, then the
 -- waitlist row, and only then whatever is left (which normalizes to "Direct").
 -- The exclusion list is shared with every other reader, so it cannot drift.
 COALESCE(
  CASE WHEN lower(MAX(ac.source)) <> ALL(${LEGACY_NON_SOURCES}) THEN MAX(ac.source) END,
  CASE WHEN lower(MAX(fs.source)) <> ALL(${LEGACY_NON_SOURCES}) THEN MAX(fs.source) END,
  MAX(wl.source),
  MAX(fs.source)
 ) AS source,
 GREATEST(
 MAX(clk.last_at),
 MAX(vw.last_at),
 MAX(fav.last_at),
 MAX(cart.last_at),
 MAX(ord.last_at),
 MAX(pg.last_at)
 ) AS last_active_at
 FROM all_customers ac
 LEFT JOIN users u ON LOWER(u.email) = LOWER(ac.email)
 LEFT JOIN accounts a ON a.user_id = u.id
 LEFT JOIN fav_counts fav ON fav.uid = u.id::text
 LEFT JOIN cart_counts cart ON cart.uid = u.id::text
 LEFT JOIN click_counts clk ON clk.uid = u.id::text
 LEFT JOIN view_counts vw ON vw.uid = u.id::text
 LEFT JOIN order_counts ord ON ord.uid = u.id::text
 LEFT JOIN page_counts pg ON pg.uid = u.id::text
 LEFT JOIN ltv_amounts ltv ON ltv.uid = u.id::text
 LEFT JOIN first_source fs ON fs.uid = u.id::text
 LEFT JOIN wl_source wl ON wl.email = LOWER(ac.email)
 GROUP BY
 ac.email, ac.first_name, ac.last_name, ac.phone,
 ac.status, ac.created_at, ac.approved_at,
 ac.referral_code, ac.referred_by, ac.email_subscribe,
 u.name, u.id

 ORDER BY last_active_at DESC NULLS LAST, activity_score DESC, ac.created_at DESC
 `;

 const customers = rows.map((r) => {
 const firstName = (r.first_name as string | null) ?? "";
 const lastName = (r.last_name as string | null) ?? "";
 const displayName =
 [firstName, lastName].filter(Boolean).join(" ") ||
 (r.user_name as string | null) ||
 null;

 const providers = ((r.providers as string | null) ?? "").split(",").filter(Boolean);
 const loginMethod = providers.includes("google") ? "Google" : "Email";

 return {
 email: r.email as string,
 name: displayName,
 phone: (r.phone as string | null) ?? null,
 status: r.status as string,
 signedUpAt: r.created_at as string,
 approvedAt: (r.approved_at as string | null) ?? null,
 referralCode: (r.referral_code as string | null) ?? null,
 referredBy: (r.referred_by as string | null) ?? null,
 // Three fields, because the UI needs all three: the raw slug for CSV/debugging,
 // a display label ("TikTok", "Direct"), and the channel the filter chips group by.
 source: (() => {
 const raw = (r.source as string | null) ?? (r.referred_by ? "referral" : null);
 return raw ? canonicalSource(raw) : null;
 })(),
 sourceLabel: normalizeStoredSource((r.source as string | null) ?? (r.referred_by ? "referral" : null)),
 sourceChannel: sourceChannel((r.source as string | null) ?? (r.referred_by ? "referral" : null)),
 loginMethod,
 emailSubscribe: r.email_subscribe as boolean,
 activityScore: Number(r.activity_score ?? 0),
 clickCount: Number(r.click_count ?? 0),
 viewCount: Number(r.view_count ?? 0),
 favoriteCount: Number(r.favorite_count ?? 0),
 cartCount: Number(r.cart_count ?? 0),
 orderCount: Number(r.order_count ?? 0),
 pageViewCount: Number(r.page_view_count ?? 0),
 totalSpend: Number(r.total_spend ?? 0),
 lastActiveAt: (r.last_active_at as string | null) ?? null,
 };
 });

 return NextResponse.json({ customers }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
 } catch (error) {
 console.error("[admin/customers]", error);
 return NextResponse.json({ error: "Failed to load customers" }, { status: 500 });
 }
}
