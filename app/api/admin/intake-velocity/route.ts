/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Read-only. Measures how many NEW listings appear per month and across how many stores, so we can
// derive "new items per active store per month" for the pricing model. Admin-gated by middleware.
// Two sources:
//   • products  — the marketplace catalog synced from the ~45 onboarded Shopify stores (created_at
//                 is set at sync time, so it ≈ when the store listed the piece; older rows are NULL).
//   • items     — VYA-native seller-OS listings created through intake (the future subscription flow).
function getSql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function GET() {
 const sql = getSql();
 try {
 const [prodMonthly, prodTotals, itemMonthly, itemTotals] = await Promise.all([
 sql`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS new_listings, COUNT(DISTINCT store_slug)::int AS active_stores
      FROM products WHERE created_at IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 12`.catch(() => []),
 sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE created_at IS NULL)::int AS undated, COUNT(DISTINCT store_slug)::int AS stores FROM products`.catch(() => [{}]),
 sql`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS new_listings, COUNT(DISTINCT seller_id)::int AS active_stores
      FROM items WHERE created_at IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 12`.catch(() => []),
 sql`SELECT COUNT(*)::int AS total, COUNT(DISTINCT seller_id)::int AS sellers FROM items`.catch(() => [{}]),
 ]) as [any[], any[], any[], any[]];

 // Per-month "new listings per active store", plus a 3-month average that skips the newest (often
 // partial) month and any obvious one-time bulk-import spike.
 const withPerStore = (rows: any[]) =>
 rows.map((r) => ({
 month: r.month,
 newListings: Number(r.new_listings) || 0,
 activeStores: Number(r.active_stores) || 0,
 perActiveStore: r.active_stores ? round1(Number(r.new_listings) / Number(r.active_stores)) : 0,
 }));

 const products = withPerStore(prodMonthly);
 const items = withPerStore(itemMonthly);

 // Steady-state estimate: mean of perActiveStore over months 2–4 (skip newest partial month).
 const steady = (arr: { perActiveStore: number }[]) => {
 const window = arr.slice(1, 4).map((m) => m.perActiveStore).filter((n) => n > 0);
 return window.length ? round1(window.reduce((a, b) => a + b, 0) / window.length) : null;
 };

 return NextResponse.json({
 ok: true,
 note: "products = marketplace catalog synced from onboarded stores (best proxy for listing velocity). items = seller-OS intake. created_at NULL rows (pre-tracking) are excluded from the monthly counts.",
 marketplace_products: {
 total: prodTotals[0]?.total ?? 0,
 undated_pre_tracking: prodTotals[0]?.undated ?? 0,
 distinct_stores: prodTotals[0]?.stores ?? 0,
 monthly: products,
 est_new_listings_per_active_store_per_month: steady(products),
 },
 seller_os_items: {
 total: itemTotals[0]?.total ?? 0,
 distinct_sellers: itemTotals[0]?.sellers ?? 0,
 monthly: items,
 est_new_listings_per_active_store_per_month: steady(items),
 },
 });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
