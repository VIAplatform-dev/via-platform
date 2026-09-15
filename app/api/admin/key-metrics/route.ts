import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${adminPassword}`) return true;
  const token = request.cookies.get("via_admin_token")?.value;
  return token === hashPassword(adminPassword);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

  const sql = neon(dbUrl);

  await sql`ALTER TABLE product_views ADD COLUMN IF NOT EXISTS user_id TEXT`.catch(() => {});
  await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS returned BOOLEAN DEFAULT FALSE`.catch(() => {});
  await sql`ALTER TABLE conversions ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ`.catch(() => {});

  // VYA launch date: March 19, 2026
  const LAUNCH = new Date(Date.UTC(2026, 2, 19)); // 2026-03-19 00:00 UTC

  const monthParam = request.nextUrl.searchParams.get("month");
  const allTimeParam = request.nextUrl.searchParams.get("alltime") === "true";
  const now = new Date();

  let pStart: Date, pEnd: Date, prevPStart: Date, prevPEnd: Date;
  let shortStart: Date, shortEnd: Date, shortPrevStart: Date, shortPrevEnd: Date;
  let mauForPrevWeekStart: Date, mauForPrevWeekEnd: Date;
  let periodLabel: string;
  let isMonth = false;

  if (allTimeParam) {
    // All Time, from launch to now; WAU = rolling last 7 days
    pStart = LAUNCH;
    pEnd = now;
    prevPStart = LAUNCH; prevPEnd = LAUNCH; // no meaningful prev
    periodLabel = "All Time";
    shortEnd = now;
    shortStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    shortPrevEnd = shortStart;
    shortPrevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    mauForPrevWeekStart = new Date(now.getTime() - 37 * 24 * 60 * 60 * 1000);
    mauForPrevWeekEnd = shortStart;
  } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    isMonth = true;
    const [y, m] = monthParam.split("-").map(Number);
    // March 2026 starts from launch date, not the 1st
    const calStart = new Date(Date.UTC(y, m - 1, 1));
    pStart = calStart < LAUNCH ? LAUNCH : calStart;
    pEnd = new Date(Date.UTC(y, m, 1));
    // Previous period: prior calendar month (or nothing if before launch)
    const calPrevStart = new Date(Date.UTC(y, m - 2, 1));
    prevPStart = calPrevStart < LAUNCH ? LAUNCH : calPrevStart;
    prevPEnd = pStart;
    periodLabel = calStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    // WAU = last 7 days of the month, capped at now
    const effectivePEnd = pEnd > now ? now : pEnd;
    shortEnd = effectivePEnd;
    shortStart = new Date(effectivePEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (shortStart < pStart) shortStart = pStart;
    shortPrevEnd = shortStart;
    shortPrevStart = new Date(effectivePEnd.getTime() - 14 * 24 * 60 * 60 * 1000);
    if (shortPrevStart < LAUNCH) shortPrevStart = LAUNCH;
    mauForPrevWeekStart = new Date(effectivePEnd.getTime() - 37 * 24 * 60 * 60 * 1000);
    if (mauForPrevWeekStart < LAUNCH) mauForPrevWeekStart = LAUNCH;
    mauForPrevWeekEnd = shortStart;
  } else {
    // Rolling windows (default)
    periodLabel = "Last 30 days";
    pEnd = now;
    pStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    prevPEnd = pStart;
    prevPStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    shortEnd = now;
    shortStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    shortPrevEnd = shortStart;
    shortPrevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    mauForPrevWeekStart = new Date(now.getTime() - 37 * 24 * 60 * 60 * 1000);
    mauForPrevWeekEnd = shortStart;
  }

  const [
    gmvRows,
    clickRows,
    conversionRows,
    wauMauRows,
    saverRows,
    saverBuyerRows,
    revenuePerUserRows,
    gmvByWeekRows,
    registeredUsersRows,
    waitlistRows,
    commissionRows,
    waitlistByMonthRows,
    activityBreakdownRows,
    churnRows,
    retentionWindowRows,
    emailCtrRows,
    emailFpClickRows,
    returningUsersRows,
    favoritesVolumeRows,
  ] = await Promise.all([
    // GMV: all time + period windows
    sql`
      SELECT
        COALESCE(SUM(order_total), 0)::float                                                                                AS total_gmv,
        COALESCE(SUM(order_total) FILTER (WHERE timestamp >= ${shortStart}    AND timestamp < ${shortEnd}),    0)::float   AS gmv_7d,
        COALESCE(SUM(order_total) FILTER (WHERE timestamp >= ${shortPrevStart} AND timestamp < ${shortPrevEnd}), 0)::float AS gmv_prev_7d,
        COALESCE(SUM(order_total) FILTER (WHERE timestamp >= ${pStart}        AND timestamp < ${pEnd}),        0)::float   AS gmv_30d,
        COALESCE(SUM(order_total) FILTER (WHERE timestamp >= ${prevPStart}    AND timestamp < ${prevPEnd}),    0)::float   AS gmv_prev_30d
      FROM conversions WHERE order_total > 0 AND (returned IS NULL OR returned = false)
    `,

    // Clicks
    sql`
      SELECT
        COUNT(*)::int                                                                                                   AS total_clicks,
        COUNT(*) FILTER (WHERE timestamp >= ${shortStart}     AND timestamp < ${shortEnd})::int                        AS clicks_7d,
        COUNT(*) FILTER (WHERE timestamp >= ${shortPrevStart} AND timestamp < ${shortPrevEnd})::int                    AS clicks_prev_7d,
        COUNT(*) FILTER (WHERE timestamp >= ${pStart}         AND timestamp < ${pEnd})::int                            AS clicks_30d,
        COUNT(*) FILTER (WHERE timestamp >= ${prevPStart}     AND timestamp < ${prevPEnd})::int                        AS clicks_prev_30d
      FROM clicks
    `,

    // Conversions
    sql`
      SELECT
        COUNT(*)::int                                                                                                   AS total_conversions,
        COUNT(*) FILTER (WHERE timestamp >= ${shortStart}     AND timestamp < ${shortEnd})::int                        AS conversions_7d,
        COUNT(*) FILTER (WHERE timestamp >= ${shortPrevStart} AND timestamp < ${shortPrevEnd})::int                    AS conversions_prev_7d,
        COUNT(*) FILTER (WHERE timestamp >= ${pStart}         AND timestamp < ${pEnd})::int                            AS conversions_30d,
        COUNT(*) FILTER (WHERE timestamp >= ${prevPStart}     AND timestamp < ${prevPEnd})::int                        AS conversions_prev_30d
      FROM conversions WHERE order_total > 0 AND (returned IS NULL OR returned = false)
    `,

    // WAU / MAU
    // mau_rolling_30d is always the 30-day window ending at shortEnd. Used for stickiness
    // in every mode so the denominator is consistent (not "since launch" for all-time).
    sql`
      SELECT
        COUNT(DISTINCT a.uid)::int                                                                                                                  AS total_ever_active,
        COUNT(DISTINCT a.uid) FILTER (WHERE a.ts >= ${shortStart}                                   AND a.ts < ${shortEnd})::int                   AS wau,
        COUNT(DISTINCT a.uid) FILTER (WHERE a.ts >= ${shortPrevStart}                               AND a.ts < ${shortPrevEnd})::int               AS wau_prev,
        COUNT(DISTINCT a.uid) FILTER (WHERE a.ts >= ${pStart}                                       AND a.ts < ${pEnd})::int                       AS mau,
        COUNT(DISTINCT a.uid) FILTER (WHERE a.ts >= ${prevPStart}                                   AND a.ts < ${prevPEnd})::int                   AS mau_prev,
        COUNT(DISTINCT a.uid) FILTER (WHERE a.ts >= ${mauForPrevWeekStart}                          AND a.ts < ${mauForPrevWeekEnd})::int           AS mau_for_prev_week,
        COUNT(DISTINCT a.uid) FILTER (WHERE a.ts >= ${new Date(shortEnd.getTime() - 30 * 24 * 60 * 60 * 1000)} AND a.ts < ${shortEnd})::int        AS mau_rolling_30d
      FROM (
        SELECT user_id::text AS uid, timestamp  AS ts FROM clicks            WHERE user_id IS NOT NULL
        UNION ALL
        SELECT user_id::text,        timestamp  AS ts FROM product_views     WHERE user_id IS NOT NULL
        UNION ALL
        SELECT user_id::text,        created_at AS ts FROM product_favorites WHERE user_id IS NOT NULL
        UNION ALL
        SELECT user_id::text,        created_at AS ts FROM store_favorites   WHERE user_id IS NOT NULL
        UNION ALL
        SELECT user_id::text,        timestamp  AS ts FROM conversions       WHERE user_id IS NOT NULL
        UNION ALL
        SELECT user_id::text,        timestamp  AS ts FROM page_type_views   WHERE user_id IS NOT NULL AND page_type != 'other'
      ) a
    `,

    // Save-to-purchase: scoped to the selected period
    sql`
      SELECT COUNT(DISTINCT user_id::text)::int AS total_savers FROM (
        SELECT user_id FROM product_favorites WHERE user_id IS NOT NULL
          AND created_at >= ${pStart} AND created_at < ${pEnd}
        UNION
        SELECT user_id FROM store_favorites WHERE user_id IS NOT NULL
          AND created_at >= ${pStart} AND created_at < ${pEnd}
      ) period_savers
    `,

    sql`
      SELECT COUNT(DISTINCT c.user_id)::int AS savers_who_bought
      FROM conversions c
      WHERE c.user_id IS NOT NULL
        AND c.order_total > 0
        AND (c.returned IS NULL OR c.returned = false)
        AND c.timestamp >= ${pStart} AND c.timestamp < ${pEnd}
        AND (
          EXISTS (SELECT 1 FROM product_favorites pf
            WHERE pf.user_id::text = c.user_id
            AND pf.created_at >= ${pStart} AND pf.created_at < ${pEnd})
          OR EXISTS (SELECT 1 FROM store_favorites sf
            WHERE sf.user_id::text = c.user_id
            AND sf.created_at >= ${pStart} AND sf.created_at < ${pEnd})
        )
    `,

    // Revenue / orders / buyers. Scoped to the selected period AND all-time for context.
    // Adds order counts so we can compute true AOV (revenue / orders), not just
    // revenue / unique buyers.
    sql`
      SELECT
        COALESCE(SUM(order_total), 0)::float                                                                                                      AS total_gmv,
        COUNT(*)::int                                                                                                                              AS total_orders,
        (COUNT(DISTINCT user_id) + COUNT(*) FILTER (WHERE user_id IS NULL))::int                                                                  AS buying_users,
        COALESCE(SUM(order_total) FILTER (WHERE timestamp >= ${pStart} AND timestamp < ${pEnd}), 0)::float                                        AS period_gmv,
        COUNT(*) FILTER (WHERE timestamp >= ${pStart} AND timestamp < ${pEnd})::int                                                                AS period_orders,
        (COUNT(DISTINCT user_id) FILTER (WHERE timestamp >= ${pStart} AND timestamp < ${pEnd})
         + COUNT(*) FILTER (WHERE user_id IS NULL AND timestamp >= ${pStart} AND timestamp < ${pEnd}))::int                                       AS period_buying_users,
        COALESCE(SUM(order_total) FILTER (WHERE timestamp >= ${prevPStart} AND timestamp < ${prevPEnd}), 0)::float                                AS prev_period_gmv,
        COUNT(*) FILTER (WHERE timestamp >= ${prevPStart} AND timestamp < ${prevPEnd})::int                                                       AS prev_period_orders,
        (COUNT(DISTINCT user_id) FILTER (WHERE timestamp >= ${prevPStart} AND timestamp < ${prevPEnd})
         + COUNT(*) FILTER (WHERE user_id IS NULL AND timestamp >= ${prevPStart} AND timestamp < ${prevPEnd}))::int                               AS prev_period_buying_users
      FROM conversions
      WHERE order_total > 0
        AND (returned IS NULL OR returned = false)
    `,

    // GMV by week sparkline. Always last 10 weeks for context
    sql`
      SELECT
        DATE_TRUNC('week', timestamp)::date::text  AS week,
        COALESCE(SUM(order_total), 0)::float       AS gmv
      FROM conversions
      WHERE order_total > 0 AND (returned IS NULL OR returned = false) AND timestamp >= NOW() - INTERVAL '10 weeks'
      GROUP BY 1
      ORDER BY 1 ASC
    `,

    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= ${pStart} AND created_at < ${pEnd})::int AS period_new,
        COUNT(*) FILTER (WHERE created_at >= ${prevPStart} AND created_at < ${prevPEnd})::int AS prev_period_new,
        COUNT(*) FILTER (WHERE created_at >= ${shortStart} AND created_at < ${shortEnd})::int AS week_new,
        COUNT(*) FILTER (WHERE created_at >= ${shortPrevStart} AND created_at < ${shortPrevEnd})::int AS prev_week_new
      FROM users
    `,
    sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'approved')::int AS approved FROM pilot_access`,
    // Total commission, per-store tiered rates, excluding returned orders
    sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN store_slug = 'sheer-vintage' THEN
            CASE WHEN order_total < 1000 THEN order_total * 0.05
                 WHEN order_total < 5000 THEN order_total * 0.04
                 ELSE order_total * 0.03 END
          WHEN store_slug = 'vintage-girlfriend' THEN
            CASE WHEN order_total < 1000 THEN order_total * 0.05
                 ELSE order_total * 0.03 END
          ELSE
            CASE WHEN order_total < 1000 THEN order_total * 0.07
                 WHEN order_total < 5000 THEN order_total * 0.05
                 ELSE order_total * 0.03 END
        END
      ), 0)::float AS commission
      FROM conversions
      WHERE order_total > 0 AND (returned IS NULL OR returned = false)
    `,

    // Waitlist growth by month
    sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS signups,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
      FROM pilot_access
      GROUP BY 1
      ORDER BY 1 ASC
    `,

    // Activity breakdown, for the selected period
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM users)                                                                                                                   AS registered,
        (SELECT COUNT(DISTINCT user_id::text)::int FROM clicks WHERE user_id IS NOT NULL AND timestamp >= ${pStart} AND timestamp < ${pEnd})              AS clickers,
        (SELECT COUNT(DISTINCT user_id::text)::int FROM product_favorites WHERE user_id IS NOT NULL AND created_at >= ${pStart} AND created_at < ${pEnd}) AS product_savers,
        (SELECT COUNT(DISTINCT user_id::text)::int FROM store_favorites   WHERE user_id IS NOT NULL AND created_at >= ${pStart} AND created_at < ${pEnd}) AS store_savers,
        (SELECT COUNT(DISTINCT user_id::text)::int FROM conversions WHERE user_id IS NOT NULL AND order_total > 0 AND (returned IS NULL OR returned = false) AND timestamp >= ${pStart} AND timestamp < ${pEnd}) AS buyers
    `,

    // Buyer retention: scoped to selected period
    sql`
      WITH period_buyers AS (
        SELECT
          user_id::text AS uid,
          MIN(timestamp) AS first_purchase_at
        FROM conversions
        WHERE user_id IS NOT NULL
          AND order_total > 0
          AND (returned IS NULL OR returned = false)
          AND timestamp >= ${pStart} AND timestamp < ${pEnd}
        GROUP BY user_id
      ),
      post_purchase_activity AS (
        SELECT user_id::text AS uid, timestamp AS ts FROM clicks        WHERE user_id IS NOT NULL
        UNION ALL
        SELECT user_id::text,        timestamp AS ts FROM product_views  WHERE user_id IS NOT NULL
        UNION ALL
        SELECT user_id::text,        timestamp AS ts FROM page_type_views WHERE user_id IS NOT NULL AND page_type != 'other'
      ),
      returned_buyers AS (
        SELECT DISTINCT pb.uid
        FROM period_buyers pb
        JOIN post_purchase_activity a ON a.uid = pb.uid AND a.ts > pb.first_purchase_at
      ),
      repeat_buyers AS (
        SELECT DISTINCT pb.uid
        FROM period_buyers pb
        WHERE EXISTS (
          SELECT 1 FROM conversions c
          WHERE c.user_id::text = pb.uid
            AND c.order_total > 0
            AND (c.returned IS NULL OR c.returned = false)
            AND c.timestamp > pb.first_purchase_at
        )
      )
      SELECT
        COUNT(DISTINCT pb.uid)::int  AS total_buyers,
        COUNT(DISTINCT rb.uid)::int  AS returned_after_purchase,
        COUNT(DISTINCT rep.uid)::int AS bought_again
      FROM period_buyers pb
      LEFT JOIN returned_buyers rb  ON rb.uid  = pb.uid
      LEFT JOIN repeat_buyers   rep ON rep.uid = pb.uid
    `,

    // N-day retention across multiple windows (7, 14, 30, since launch 2026-03-19).
    // Definition: of buyers whose first purchase was N+ days ago (so they had a
    // full N-day window to come back), what % made a second purchase within
    // N days of that first purchase. "Since launch" = % of all-time buyers
    // who have ever bought 2+ times.
    sql`
      WITH buyer_purchases AS (
        SELECT
          user_id::text AS uid,
          timestamp,
          MIN(timestamp) OVER (PARTITION BY user_id) AS first_at
        FROM conversions
        WHERE user_id IS NOT NULL
          AND order_total > 0
          AND (returned IS NULL OR returned = false)
      ),
      buyer_flags AS (
        SELECT
          uid,
          first_at,
          MAX(CASE WHEN timestamp > first_at AND timestamp <= first_at + INTERVAL '7 days'  THEN 1 ELSE 0 END) AS retained_7d,
          MAX(CASE WHEN timestamp > first_at AND timestamp <= first_at + INTERVAL '14 days' THEN 1 ELSE 0 END) AS retained_14d,
          MAX(CASE WHEN timestamp > first_at AND timestamp <= first_at + INTERVAL '30 days' THEN 1 ELSE 0 END) AS retained_30d,
          MAX(CASE WHEN timestamp > first_at                                                 THEN 1 ELSE 0 END) AS retained_ever
        FROM buyer_purchases
        GROUP BY uid, first_at
      )
      SELECT
        COUNT(*) FILTER (WHERE first_at <= NOW() - INTERVAL '7 days')::int                AS cohort_7d,
        COALESCE(SUM(retained_7d)  FILTER (WHERE first_at <= NOW() - INTERVAL '7 days'),  0)::int AS retained_7d,
        COUNT(*) FILTER (WHERE first_at <= NOW() - INTERVAL '14 days')::int               AS cohort_14d,
        COALESCE(SUM(retained_14d) FILTER (WHERE first_at <= NOW() - INTERVAL '14 days'), 0)::int AS retained_14d,
        COUNT(*) FILTER (WHERE first_at <= NOW() - INTERVAL '30 days')::int               AS cohort_30d,
        COALESCE(SUM(retained_30d) FILTER (WHERE first_at <= NOW() - INTERVAL '30 days'), 0)::int AS retained_30d,
        COUNT(*)::int                                                                      AS cohort_all,
        COALESCE(SUM(retained_ever), 0)::int                                              AS retained_all
      FROM buyer_flags
    `,

    // Email stats, from email_events table (created by Resend webhook)
    sql`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'email.opened'    AND created_at >= ${shortStart}     AND created_at < ${shortEnd})::int      AS opens_7d,
        COUNT(*) FILTER (WHERE event_type = 'email.clicked'   AND created_at >= ${shortStart}     AND created_at < ${shortEnd})::int      AS clicks_7d,
        COUNT(*) FILTER (WHERE event_type = 'email.delivered' AND created_at >= ${shortStart}     AND created_at < ${shortEnd})::int      AS delivered_7d,
        COUNT(*) FILTER (WHERE event_type = 'email.opened'    AND created_at >= ${shortPrevStart} AND created_at < ${shortPrevEnd})::int  AS opens_prev_7d,
        COUNT(*) FILTER (WHERE event_type = 'email.clicked'   AND created_at >= ${shortPrevStart} AND created_at < ${shortPrevEnd})::int  AS clicks_prev_7d,
        COUNT(*) FILTER (WHERE event_type = 'email.delivered' AND created_at >= ${shortPrevStart} AND created_at < ${shortPrevEnd})::int  AS delivered_prev_7d,
        COUNT(*) FILTER (WHERE event_type = 'email.opened'    AND created_at >= ${pStart}         AND created_at < ${pEnd})::int          AS opens_period,
        COUNT(*) FILTER (WHERE event_type = 'email.clicked'   AND created_at >= ${pStart}         AND created_at < ${pEnd})::int          AS clicks_period,
        COUNT(*) FILTER (WHERE event_type = 'email.delivered' AND created_at >= ${pStart}         AND created_at < ${pEnd})::int          AS delivered_period,
        COUNT(*) FILTER (WHERE event_type = 'email.opened')::int   AS opens_all,
        COUNT(*) FILTER (WHERE event_type = 'email.clicked')::int  AS clicks_all,
        COUNT(*) FILTER (WHERE event_type = 'email.delivered')::int AS delivered_all
      FROM email_events
      WHERE category NOT IN ('magic_link', 'internal_alert')
    `.catch(() => [{ opens_7d: 0, clicks_7d: 0, delivered_7d: 0, opens_prev_7d: 0, clicks_prev_7d: 0, delivered_prev_7d: 0, opens_period: 0, clicks_period: 0, delivered_period: 0, opens_all: 0, clicks_all: 0, delivered_all: 0 }]),

    // First-party email clicks. Counted from our own utm-tagged landings
    // (every email link carries utm_source=email via withUtm), NOT from Resend's
    // email.clicked webhook. Resend click-tracking is off, so email.clicked is
    // always 0; this is the reliable click signal. One row per email landing.
    sql`
      SELECT
        COUNT(*) FILTER (WHERE timestamp >= ${shortStart}     AND timestamp < ${shortEnd})::int      AS clicks_7d,
        COUNT(*) FILTER (WHERE timestamp >= ${shortPrevStart} AND timestamp < ${shortPrevEnd})::int  AS clicks_prev_7d,
        COUNT(*) FILTER (WHERE timestamp >= ${pStart}         AND timestamp < ${pEnd})::int          AS clicks_period,
        COUNT(*)::int                                                                                AS clicks_all
      FROM utm_visits
      WHERE lower(utm_source) = 'email' OR lower(utm_medium) = 'email'
    `.catch(() => [{ clicks_7d: 0, clicks_prev_7d: 0, clicks_period: 0, clicks_all: 0 }]),

    // Returning users. Scoped to the selected period
    sql`
      SELECT
        COUNT(DISTINCT user_id) FILTER (WHERE visit_days_period >= 2)::int AS returning_30d,
        COUNT(DISTINCT user_id) FILTER (WHERE visit_days_short  >= 2)::int AS returning_7d
      FROM (
        SELECT
          a.user_id,
          COUNT(DISTINCT DATE(a.ts)) FILTER (WHERE a.ts >= ${pStart}     AND a.ts < ${pEnd})     AS visit_days_period,
          COUNT(DISTINCT DATE(a.ts)) FILTER (WHERE a.ts >= ${shortStart} AND a.ts < ${shortEnd}) AS visit_days_short
        FROM (
          SELECT user_id::text, timestamp  AS ts FROM clicks            WHERE user_id IS NOT NULL
          UNION ALL
          SELECT user_id::text, timestamp  AS ts FROM product_views     WHERE user_id IS NOT NULL
          UNION ALL
          SELECT user_id::text, created_at AS ts FROM product_favorites WHERE user_id IS NOT NULL
          UNION ALL
          SELECT user_id::text, created_at AS ts FROM store_favorites   WHERE user_id IS NOT NULL
          UNION ALL
          SELECT user_id::text, timestamp  AS ts FROM conversions       WHERE user_id IS NOT NULL
          UNION ALL
          SELECT user_id::text, timestamp  AS ts FROM page_type_views   WHERE user_id IS NOT NULL AND page_type != 'other'
        ) a
        INNER JOIN users u ON u.id::text = a.user_id
        GROUP BY a.user_id
      ) sub
    `,

    // Product favorites volume: how many favorites were added per period
    sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= ${pStart}         AND created_at < ${pEnd})::int         AS period,
        COUNT(*) FILTER (WHERE created_at >= ${prevPStart}     AND created_at < ${prevPEnd})::int      AS prev_period,
        COUNT(*) FILTER (WHERE created_at >= ${shortStart}     AND created_at < ${shortEnd})::int      AS week,
        COUNT(*) FILTER (WHERE created_at >= ${shortPrevStart} AND created_at < ${shortPrevEnd})::int  AS prev_week
      FROM product_favorites
    `.catch(() => [{ period: 0, prev_period: 0, week: 0, prev_week: 0 }]),
  ]);

  const g = gmvRows[0];
  const cl = clickRows[0];
  const co = conversionRows[0];
  const wm = wauMauRows[0];
  const rev = revenuePerUserRows[0];

  const totalRegisteredUsers = registeredUsersRows[0]?.total ?? 0;
  const totalWaitlist = waitlistRows[0]?.total ?? 0;
  const totalApproved = waitlistRows[0]?.approved ?? 0;
  const totalCommission = Math.round(((commissionRows[0]?.commission as number) ?? 0) * 100) / 100;
  const waitlistByMonth = (waitlistByMonthRows as { month: string; signups: number; approved: number }[]).map((r) => ({
    month: r.month,
    signups: r.signups,
    approved: r.approved,
  }));
  const ab = activityBreakdownRows?.[0];
  const activityBreakdown = ab ? {
    clickers: (ab.clickers as number) ?? 0,
    productSavers: (ab.product_savers as number) ?? 0,
    storeSavers: (ab.store_savers as number) ?? 0,
    buyers: (ab.buyers as number) ?? 0,
  } : undefined;
  const totalSavers = saverRows[0]?.total_savers ?? 0;
  const saversBought = saverBuyerRows[0]?.savers_who_bought ?? 0;

  // Conversion rate = orders / unique visitors (industry standard)
  // Using total_ever_active / mau / wau as the visitor denominator since
  // VYA is a gated platform where all meaningful visitors are logged-in users.
  const convRate = (wm.total_ever_active as number) > 0 ? co.total_conversions / (wm.total_ever_active as number) : 0;
  const convRate7d = (wm.wau as number) > 0 ? co.conversions_7d / (wm.wau as number) : 0;
  const convRatePrev7d = (wm.wau_prev as number) > 0 ? co.conversions_prev_7d / (wm.wau_prev as number) : 0;

  // Stickiness = WAU / MAU using the same period MAU shown on the dashboard card.
  const stickinessMAU = (wm.mau as number) ?? 0;
  const stickiness = stickinessMAU > 0 ? (wm.wau as number) / stickinessMAU : 0;
  const stickinessPrev = (wm.mau_prev as number) > 0
    ? (wm.wau_prev as number) / (wm.mau_prev as number)
    : 0;

  const ecRaw = (emailCtrRows as { opens_7d: number; clicks_7d: number; delivered_7d: number; opens_prev_7d: number; clicks_prev_7d: number; delivered_prev_7d: number; opens_period: number; clicks_period: number; delivered_period: number; opens_all: number; clicks_all: number; delivered_all: number }[])[0] ?? { opens_7d: 0, clicks_7d: 0, delivered_7d: 0, opens_prev_7d: 0, clicks_prev_7d: 0, delivered_prev_7d: 0, opens_period: 0, clicks_period: 0, delivered_period: 0, opens_all: 0, clicks_all: 0, delivered_all: 0 };
  // Override clicks with the first-party utm signal (Resend email.clicked is off → always 0).
  const fp = (emailFpClickRows as { clicks_7d: number; clicks_prev_7d: number; clicks_period: number; clicks_all: number }[])[0] ?? { clicks_7d: 0, clicks_prev_7d: 0, clicks_period: 0, clicks_all: 0 };
  const ec = { ...ecRaw, clicks_7d: fp.clicks_7d, clicks_prev_7d: fp.clicks_prev_7d, clicks_period: fp.clicks_period, clicks_all: fp.clicks_all };

  const fv = (favoritesVolumeRows as { period: number; prev_period: number; week: number; prev_week: number }[])[0] ?? { period: 0, prev_period: 0, week: 0, prev_week: 0 };
  const ru = registeredUsersRows[0] as { total: number; period_new: number; prev_period_new: number; week_new: number; prev_week_new: number };

  // ── Email-attributed sales: orders whose originating click was utm_source='email'
  // (every VYA email link is utm-tagged). Resilient, never breaks the page.
  const emailSalesRows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE c.timestamp >= ${pStart} AND c.timestamp < ${pEnd})::int AS orders_period,
      COALESCE(SUM(c.order_total) FILTER (WHERE c.timestamp >= ${pStart} AND c.timestamp < ${pEnd}), 0)::float AS revenue_period,
      COUNT(*)::int AS orders_all,
      COALESCE(SUM(c.order_total), 0)::float AS revenue_all
    FROM conversions c
    JOIN clicks ck ON ck.click_id = c.via_click_id
    WHERE lower(ck.utm_source) = 'email'
      AND c.order_total > 0
      AND (c.returned IS NULL OR c.returned = false)
  `.catch(() => [{ orders_period: 0, revenue_period: 0, orders_all: 0, revenue_all: 0 }])) as Array<{ orders_period: number; revenue_period: number; orders_all: number; revenue_all: number }>;
  const es = emailSalesRows[0] ?? { orders_period: 0, revenue_period: 0, orders_all: 0, revenue_all: 0 };

  // ── Approval → first purchase: avg/median time from pilot approval to a buyer's
  // first order (only counts purchases made after approval).
  const approvalPurchaseRows = (await sql`
    WITH approved AS (
      SELECT u.id::text AS user_id, pa.approved_at
      FROM pilot_access pa
      JOIN users u ON lower(u.email) = lower(pa.email)
      WHERE pa.status = 'approved' AND pa.approved_at IS NOT NULL
    ),
    first_purchase AS (
      SELECT user_id::text AS user_id, MIN(timestamp) AS first_ts
      FROM conversions
      WHERE user_id IS NOT NULL AND order_total > 0 AND (returned IS NULL OR returned = false)
      GROUP BY user_id
    )
    SELECT
      COUNT(*)::int AS buyers,
      AVG(EXTRACT(EPOCH FROM (fp.first_ts - a.approved_at)))::float AS avg_seconds,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fp.first_ts - a.approved_at)))::float AS median_seconds
    FROM approved a
    JOIN first_purchase fp ON fp.user_id = a.user_id
    WHERE fp.first_ts >= a.approved_at
  `.catch(() => [{ buyers: 0, avg_seconds: null, median_seconds: null }])) as Array<{ buyers: number; avg_seconds: number | null; median_seconds: number | null }>;
  const ap = approvalPurchaseRows[0] ?? { buyers: 0, avg_seconds: null, median_seconds: null };

  return NextResponse.json({
    gmv: {
      total: g.total_gmv,
      last7d: g.gmv_7d,
      prev7d: g.gmv_prev_7d,
      last30d: g.gmv_30d,
      prev30d: g.gmv_prev_30d,
    },
    clicks: {
      total: cl.total_clicks,
      last7d: cl.clicks_7d,
      prev7d: cl.clicks_prev_7d,
      last30d: cl.clicks_30d,
      prev30d: cl.clicks_prev_30d,
    },
    totalOrders: {
      allTime: co.total_conversions,
      last7d: co.conversions_7d,
      prev7d: co.conversions_prev_7d,
      last30d: co.conversions_30d,
      prev30d: co.conversions_prev_30d,
    },
    conversionRate: {
      allTime: convRate,
      last7d: convRate7d,
      prev7d: convRatePrev7d,
      totalVisitors: wm.total_ever_active,
      totalConversions: co.total_conversions,
      periodVisitors: wm.mau,
      periodConversions: co.conversions_30d,
      periodRate: (wm.mau as number) > 0 ? (co.conversions_30d as number) / (wm.mau as number) : 0,
    },
    wau: { current: wm.wau, prev: wm.wau_prev },
    mau: { current: wm.mau, prev: wm.mau_prev, totalEverActive: wm.total_ever_active, rolling30d: wm.mau_rolling_30d },
    stickiness: { current: stickiness, prev: stickinessPrev, mauUsed: stickinessMAU },
    saveToPurchase: {
      rate: totalSavers > 0 ? saversBought / totalSavers : 0,
      totalSavers,
      saversBought,
    },
    // True AOV = revenue / orders. Includes legacy buyingUsers fields so the
    // frontend that wants "per-buyer" math still has them.
    revenuePerUser: {
      value: (rev.period_orders as number) > 0
        ? (rev.period_gmv as number) / (rev.period_orders as number)
        : 0,
      orders: rev.period_orders as number,
      buyingUsers: rev.period_buying_users as number,
      allTimeValue: (rev.total_orders as number) > 0
        ? (rev.total_gmv as number) / (rev.total_orders as number)
        : 0,
      allTimeOrders: rev.total_orders as number,
      allTimeBuyingUsers: rev.buying_users as number,
      prevPeriodValue: (rev.prev_period_orders as number) > 0
        ? (rev.prev_period_gmv as number) / (rev.prev_period_orders as number)
        : 0,
      prevPeriodOrders: rev.prev_period_orders as number,
      prevPeriodBuyingUsers: rev.prev_period_buying_users as number,
    },
    gmvByWeek: gmvByWeekRows,
    totalCommission,
    newUsers: {
      period: ru?.period_new ?? 0,
      prevPeriod: ru?.prev_period_new ?? 0,
      week: ru?.week_new ?? 0,
      prevWeek: ru?.prev_week_new ?? 0,
    },
    favoritesVolume: {
      period: fv.period,
      prevPeriod: fv.prev_period,
      week: fv.week,
      prevWeek: fv.prev_week,
    },
    users: { registered: totalRegisteredUsers, waitlist: totalWaitlist, approved: totalApproved },
    waitlistByMonth,
    activityBreakdown,
    returningUsers: {
      last7d: (returningUsersRows[0]?.returning_7d as number) ?? 0,
      last30d: (returningUsersRows[0]?.returning_30d as number) ?? 0,
    },
    buyerRetention: {
      totalBuyers: (churnRows[0]?.total_buyers as number) ?? 0,
      returnedAfterPurchase: (churnRows[0]?.returned_after_purchase as number) ?? 0,
      boughtAgain: (churnRows[0]?.bought_again as number) ?? 0,
      returnRate: (churnRows[0]?.total_buyers as number) > 0
        ? (churnRows[0]?.returned_after_purchase as number) / (churnRows[0]?.total_buyers as number)
        : null,
      repeatPurchaseRate: (churnRows[0]?.total_buyers as number) > 0
        ? (churnRows[0]?.bought_again as number) / (churnRows[0]?.total_buyers as number)
        : null,
    },
    retentionByWindow: (() => {
      const r = retentionWindowRows?.[0] ?? {};
      const make = (cohort: number, retained: number) => ({
        cohort,
        retained,
        rate: cohort > 0 ? retained / cohort : null,
      });
      return [
        { window: "7d",    label: "7-day",         ...make((r.cohort_7d as number) ?? 0,   (r.retained_7d as number) ?? 0) },
        { window: "14d",   label: "14-day",        ...make((r.cohort_14d as number) ?? 0,  (r.retained_14d as number) ?? 0) },
        { window: "30d",   label: "30-day",        ...make((r.cohort_30d as number) ?? 0,  (r.retained_30d as number) ?? 0) },
        { window: "all",   label: "Since launch",  ...make((r.cohort_all as number) ?? 0,  (r.retained_all as number) ?? 0) },
      ];
    })(),
    emailCtr: {
      opens7d: ec.opens_7d,
      clicks7d: ec.clicks_7d,
      delivered7d: ec.delivered_7d,
      // CTR = clicks / delivered (industry standard click-through rate)
      ctr7d: ec.delivered_7d > 0 ? ec.clicks_7d / ec.delivered_7d : 0,
      opensPrev7d: ec.opens_prev_7d,
      clicksPrev7d: ec.clicks_prev_7d,
      ctrPrev7d: ec.delivered_prev_7d > 0 ? ec.clicks_prev_7d / ec.delivered_prev_7d : 0,
      opensPeriod: ec.opens_period,
      clicksPeriod: ec.clicks_period,
      deliveredPeriod: ec.delivered_period,
      ctrPeriod: ec.delivered_period > 0 ? ec.clicks_period / ec.delivered_period : 0,
      opensAll: ec.opens_all,
      clicksAll: ec.clicks_all,
      deliveredAll: ec.delivered_all,
      ctrAll: ec.delivered_all > 0 ? ec.clicks_all / ec.delivered_all : 0,
    },
    emailSales: {
      ordersPeriod: es.orders_period,
      revenuePeriod: es.revenue_period,
      ordersAll: es.orders_all,
      revenueAll: es.revenue_all,
    },
    approvalToPurchase: {
      buyers: ap.buyers,
      avgDays: ap.avg_seconds != null ? ap.avg_seconds / 86400 : null,
      medianDays: ap.median_seconds != null ? ap.median_seconds / 86400 : null,
    },
    period: {
      start: pStart.toISOString(),
      end: (pEnd > now ? now : pEnd).toISOString(),
      isMonth,
      isAllTime: allTimeParam,
      label: periodLabel,
    },
  });
}
