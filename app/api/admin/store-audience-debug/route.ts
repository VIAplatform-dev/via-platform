import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

function isAuthorized(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  if (request.headers.get("authorization") === `Bearer ${adminPassword}`) return true;
  const token = request.cookies.get("via_admin_token")?.value;
  return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

// GET /api/admin/store-audience-debug?store=vintage-girlfriend&title=Chrome+Hearts+Heart+Orbit
//   favoriters: VYA users who favorited the product matching `title` (works even after it sold —
//               resolves the deleted products.id via product_history + the favorite snapshot).
//   clickers:   VYA users who clicked out to `store` all-time (identified + an anonymous count).
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const store = request.nextUrl.searchParams.get("store");
  const title = request.nextUrl.searchParams.get("title")?.trim() ?? "";
  if (!store) return NextResponse.json({ error: "store is required" }, { status: 400 });

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
  const sql = neon(dbUrl);
  const pattern = `%${title}%`;

  // Favoriters — match the (now-deleted) product by history id OR by the snapshot title stored
  // on the favorite. Scoped to the store so a title substring can't leak another store's favorites.
  const favoriters = title
    ? await sql`
        SELECT u.email, u.name, u.notification_emails_enabled, pf.created_at,
               pf.product_snapshot->>'title' AS snapshot_title
        FROM product_favorites pf
        JOIN users u ON u.id = pf.user_id
        WHERE pf.product_id IN (
                SELECT id FROM product_history WHERE store_slug = ${store} AND title ILIKE ${pattern}
              )
           OR ( (pf.product_snapshot->>'store_slug') = ${store}
                AND (pf.product_snapshot->>'title') ILIKE ${pattern} )
        ORDER BY pf.created_at DESC
      `
    : [];

  // All-time click-outs to this store, grouped by identified user.
  const clickers = await sql`
    SELECT u.email, u.name,
           COUNT(*)::int AS clicks,
           COUNT(DISTINCT c.product_name)::int AS distinct_products,
           MIN(c.timestamp) AS first_click,
           MAX(c.timestamp) AS last_click
    FROM clicks c
    JOIN users u ON u.id::text = c.user_id
    WHERE c.store_slug = ${store}
    GROUP BY u.email, u.name
    ORDER BY clicks DESC, last_click DESC
  `;

  const totals = await sql`
    SELECT
      COUNT(*)::int AS total_clicks,
      COUNT(*) FILTER (WHERE c.user_id IS NULL OR c.user_id = '')::int AS anonymous_clicks,
      COUNT(DISTINCT c.user_id) FILTER (WHERE c.user_id IS NOT NULL AND c.user_id <> '')::int AS distinct_identified_users
    FROM clicks c
    WHERE c.store_slug = ${store}
  `;

  // Slug/name fragmentation check: the Collabs sync mis-slugs this store, so clicks may be split
  // across variants. Show every girlfriend-ish bucket so we can see where clicks actually landed.
  const fuzzy = request.nextUrl.searchParams.get("fuzzy") ?? "girlfriend";
  const fuzzyPattern = `%${fuzzy}%`;
  const slugBreakdown = await sql`
    SELECT c.store_slug, c.store, COUNT(*)::int AS clicks,
           MIN(c.timestamp) AS first_click, MAX(c.timestamp) AS last_click
    FROM clicks c
    WHERE c.store_slug ILIKE ${fuzzyPattern} OR c.store ILIKE ${fuzzyPattern}
    GROUP BY c.store_slug, c.store
    ORDER BY clicks DESC
  `;

  // Clicks in the Collabs attribution window (default 30 days) before the Aug 7 order — the buyer
  // that earned the commission must have clicked in here. Includes ALL girlfriend-ish variants.
  const orderIso = request.nextUrl.searchParams.get("orderIso") ?? "2026-08-07T04:33:11Z";
  const windowDaysRaw = parseInt(request.nextUrl.searchParams.get("attributionDays") ?? "30", 10);
  const attributionDays = Number.isFinite(windowDaysRaw) ? Math.min(Math.max(windowDaysRaw, 1), 120) : 30;
  const windowClicks = await sql`
    SELECT c.timestamp, c.store_slug, c.store, c.product_name, c.user_id,
           c.user_agent, c.utm_source, c.utm_medium, c.external_url,
           u.email, u.name
    FROM clicks c
    LEFT JOIN users u ON u.id::text = c.user_id
    WHERE (c.store_slug ILIKE ${fuzzyPattern} OR c.store ILIKE ${fuzzyPattern})
      AND c.timestamp BETWEEN (${orderIso}::timestamptz - (${attributionDays} || ' days')::interval)
                          AND (${orderIso}::timestamptz)
    ORDER BY c.timestamp DESC
  `;

  return NextResponse.json({
    store,
    title: title || null,
    favoritersCount: favoriters.length,
    favoriters,
    clickers: {
      identifiedUserCount: clickers.length,
      totals: totals[0] ?? null,
      rows: clickers,
    },
    slugBreakdown,
    attributionWindow: { orderIso, attributionDays, count: windowClicks.length, clicks: windowClicks },
  });
}
