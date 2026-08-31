import { neon } from "@neondatabase/serverless";
import { getTopViewed, getTopFavorited, storeViewFavoriteTotals, getTopSearches, type RankedItem } from "./store-favorites-db";
import { SOLD_STATUSES } from "./analytics/core";

// A store's OWN business analytics (its recommerce sales, inventory, customers, traffic)
// — not its presence on the VYA marketplace. Everything is scoped to the seller behind
// a store slug and wrapped defensively so a fresh store just shows zeros.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export type StoreAnalytics = {
 periodDays: number | "all";
 revenueCents: number;
 orders: number;
 aovCents: number;
 revenueByDay: { day: string; cents: number }[];
 inventory: { active: number; draft: number; sold: number; activeValueCents: number };
 topBrands: { brand: string; sold: number; revenueCents: number }[];
 topCategories: { category: string; sold: number; revenueCents: number }[];
 recentSales: { title: string; amountCents: number; at: string | null }[];
 customers: number;
 buyers: number;
 newBuyers: number;
 returningBuyers: number;
 prior: { revenueCents: number; orders: number };
 sessions: number;
 productViews: number;
 favorites: number;
 topViewed: RankedItem[];
 topFavorited: RankedItem[];
 topSearches: { query: string; count: number }[];
};

// One definition of "sold" across every surface — see analytics/core.ts. (This
// previously omitted "fulfilled", so a fulfilled order was missing from GMV here
// while counting elsewhere.)
const SOLD = SOLD_STATUSES;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getStoreAnalytics(slug: string, days: number | null = 30): Promise<StoreAnalytics> {
 const sql = db();
 // Always a real cutoff — epoch for "all time" — so no conditional SQL fragments.
 const cutoffMs = days ? Date.now() - days * 86400000 : 0;
 const cutoff = new Date(cutoffMs).toISOString();
 // Prior window of equal length, for period-over-period deltas (empty for all-time).
 const priorCutoff = new Date(days ? cutoffMs - days * 86400000 : 0).toISOString();
 const nil = <T>(): T[] => [] as T[];

 const [totals, byDay, inv, brands, cats, recent, custRows, buyerRows, newRet, prior, sessRows] = await Promise.all([
 sql`SELECT COUNT(*)::int AS orders, COALESCE(SUM(o.amount_cents), 0)::int AS revenue_cents
 FROM orders o JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD}) AND o.paid_at >= ${cutoff}`.catch(nil),
 sql`SELECT to_char(date_trunc('day', o.paid_at), 'MM-DD') AS day, SUM(o.amount_cents)::int AS cents
 FROM orders o JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD}) AND o.paid_at >= ${cutoff}
 GROUP BY 1 ORDER BY MIN(o.paid_at)`.catch(nil),
 sql`SELECT
 COUNT(*) FILTER (WHERE i.status = 'active')::int AS active,
 COUNT(*) FILTER (WHERE i.status = 'draft')::int AS draft,
 COUNT(*) FILTER (WHERE i.status = 'sold')::int AS sold,
 COALESCE(SUM(i.price_cents) FILTER (WHERE i.status = 'active'), 0)::int AS active_value_cents
 FROM items i JOIN sellers s ON s.id = i.seller_id WHERE s.slug = ${slug}`.catch(nil),
 sql`SELECT COALESCE(NULLIF(i.brand, ''), 'Unbranded') AS brand, COUNT(*)::int AS sold, SUM(o.amount_cents)::int AS revenue_cents
 FROM orders o JOIN items i ON i.id = o.item_id JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD}) AND o.paid_at >= ${cutoff}
 GROUP BY 1 ORDER BY revenue_cents DESC LIMIT 6`.catch(nil),
 sql`SELECT COALESCE(NULLIF(i.category, ''), 'Other') AS category, COUNT(*)::int AS sold, SUM(o.amount_cents)::int AS revenue_cents
 FROM orders o JOIN items i ON i.id = o.item_id JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD}) AND o.paid_at >= ${cutoff}
 GROUP BY 1 ORDER BY revenue_cents DESC LIMIT 6`.catch(nil),
 sql`SELECT COALESCE(i.title, 'Item') AS title, o.amount_cents::int AS amount_cents, o.paid_at AS at
 FROM orders o LEFT JOIN items i ON i.id = o.item_id JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD})
 ORDER BY o.paid_at DESC NULLS LAST LIMIT 6`.catch(nil),
 sql`SELECT COUNT(*)::int AS n FROM store_customers WHERE store_slug = ${slug}`.catch(nil),
 sql`SELECT COUNT(DISTINCT lower(o.buyer_email))::int AS n
 FROM orders o JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD}) AND o.buyer_email IS NOT NULL AND o.buyer_email <> ''`.catch(nil),
 sql`WITH firstorder AS (
 SELECT lower(o.buyer_email) AS email, MIN(o.paid_at) AS first_at
 FROM orders o JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD}) AND o.buyer_email IS NOT NULL AND o.buyer_email <> ''
 GROUP BY 1
 ), periodbuyers AS (
 SELECT DISTINCT lower(o.buyer_email) AS email
 FROM orders o JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD}) AND o.paid_at >= ${cutoff} AND o.buyer_email IS NOT NULL AND o.buyer_email <> ''
 )
 SELECT COUNT(*) FILTER (WHERE f.first_at >= ${cutoff})::int AS new_buyers,
 COUNT(*) FILTER (WHERE f.first_at < ${cutoff})::int AS returning_buyers
 FROM periodbuyers p JOIN firstorder f ON f.email = p.email`.catch(nil),
 sql`SELECT COUNT(*)::int AS orders, COALESCE(SUM(o.amount_cents), 0)::int AS revenue_cents
 FROM orders o JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD}) AND o.paid_at >= ${priorCutoff} AND o.paid_at < ${cutoff}`.catch(nil),
 sql`SELECT COUNT(*)::int AS n FROM store_visits WHERE store_slug = ${slug} AND timestamp >= ${cutoff}`.catch(nil),
 ]) as any[][];

 const [topViewed, topFavorited, vfTotals, topSearches] = await Promise.all([
 getTopViewed(slug, cutoff, 6).catch(() => []),
 getTopFavorited(slug, cutoff, 6).catch(() => []),
 storeViewFavoriteTotals(slug, cutoff).catch(() => ({ views: 0, favorites: 0 })),
 getTopSearches(slug, cutoff, 8).catch(() => []),
 ]);

 const revenueCents = Number(totals[0]?.revenue_cents || 0);
 const orders = Number(totals[0]?.orders || 0);
 const invRow = inv[0] || {};

 return {
 periodDays: days ?? "all",
 revenueCents,
 orders,
 aovCents: orders ? Math.round(revenueCents / orders) : 0,
 revenueByDay: byDay.map((r) => ({ day: String(r.day), cents: Number(r.cents) })),
 inventory: { active: Number(invRow.active || 0), draft: Number(invRow.draft || 0), sold: Number(invRow.sold || 0), activeValueCents: Number(invRow.active_value_cents || 0) },
 topBrands: brands.map((r) => ({ brand: String(r.brand), sold: Number(r.sold), revenueCents: Number(r.revenue_cents) })),
 topCategories: cats.map((r) => ({ category: String(r.category), sold: Number(r.sold), revenueCents: Number(r.revenue_cents) })),
 recentSales: recent.map((r) => ({ title: String(r.title), amountCents: Number(r.amount_cents), at: r.at ? new Date(r.at).toISOString() : null })),
 customers: Number(custRows[0]?.n || 0),
 buyers: Number(buyerRows[0]?.n || 0),
 newBuyers: Number(newRet[0]?.new_buyers || 0),
 returningBuyers: Number(newRet[0]?.returning_buyers || 0),
 prior: { revenueCents: Number(prior[0]?.revenue_cents || 0), orders: Number(prior[0]?.orders || 0) },
 sessions: Number(sessRows[0]?.n || 0),
 productViews: vfTotals.views,
 favorites: vfTotals.favorites,
 topViewed,
 topFavorited,
 topSearches,
 };
}
