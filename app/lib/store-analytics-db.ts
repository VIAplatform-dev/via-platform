import { neon } from "@neondatabase/serverless";
import { getTopViewed, getTopFavorited, storeViewFavoriteTotals, getTopSearches, type RankedItem } from "./store-favorites-db";
import { SOLD_STATUSES } from "./analytics/core";
import { countsAsSale, mergeByDay, mergeRecent } from "./analytics/imported-history";
import { channelLabel, fromOrderChannel, fromImportSource, fromPlatform, rollUp, type ChannelKey, type ChannelTotal } from "./analytics/channels";

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
 recentSales: { title: string; amountCents: number; at: string | null; channel: ChannelKey; channelLabel: string }[];
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
 /** Revenue and orders per channel — her shop, in person, Depop, the Shopify she came from. This
  *  is what "includes £X you brought over" became: a sale says where it came from, and history she
  *  imported is simply another channel rather than a footnote. See analytics/channels.ts.
  *  `brandsAreVyaOnly` because an imported order has a free-text title and no brand to group by. */
 byChannel: ChannelTotal[];
 brandsAreVyaOnly: boolean;
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

 const [totals, byDay, inv, brands, cats, recent, custRows, buyerRows, newRet, prior, sessRows,
  ownForChannel, mktRows, mktPrior, impRows, impPrior, impRecent, impBuyers] = await Promise.all([
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
 sql`SELECT COALESCE(i.title, 'Item') AS title, o.amount_cents::int AS amount_cents, o.paid_at AS at, o.channel, o.tender
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
 sql`SELECT o.amount_cents::int AS amount_cents, o.channel, o.tender
 FROM orders o JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${slug} AND o.status = ANY(${SOLD}) AND o.paid_at >= ${cutoff}`.catch(nil),
 // ── Sold on a marketplace ────────────────────────────────────────────────────────────────────
 //
 // Depop, eBay and Vestiaire sales live in their own table: the money went to her through them, so
 // there is no VYA order and no payout — just the fact that the piece went, and for how much.
 //
 // EXCEPT platform 'vya'. The same endpoint records a row when a piece sells on VYA itself, and
 // that sale ALREADY exists in `orders`. Counting both would inflate her revenue with a duplicate
 // of her own storefront takings — the one number on this page nobody would think to doubt.
 sql`SELECT c.price_cents, c.platform, c.sold_at,
  COALESCE(NULLIF(c.item_title, ''), NULLIF(i.title, ''), 'A piece') AS title
 FROM cross_listing_sales c LEFT JOIN items i ON i.id::text = c.item_id
 WHERE c.store_slug = ${slug} AND c.platform <> 'vya' AND c.sold_at >= ${cutoff}`.catch(nil),
 sql`SELECT price_cents FROM cross_listing_sales
 WHERE store_slug = ${slug} AND platform <> 'vya' AND sold_at >= ${priorCutoff} AND sold_at < ${cutoff}`.catch(nil),
 // ── Her history from before VYA ──────────────────────────────────────────────────────────────
 // Same windows, same shapes, from the table the CSV importer fills. A store that has imported
 // nothing gets empty arrays and every figure below is unchanged. Statuses are filtered in JS
 // rather than SQL because an export spells "refunded" a dozen ways — see countsAsSale.
 sql`SELECT amount_cents, order_date, status, source FROM imported_orders
 WHERE store_slug = ${slug} AND order_date >= ${cutoff}`.catch(nil),
 sql`SELECT amount_cents, order_date, status FROM imported_orders
 WHERE store_slug = ${slug} AND order_date >= ${priorCutoff} AND order_date < ${cutoff}`.catch(nil),
 sql`SELECT COALESCE(NULLIF(item_title, ''), 'Item') AS title, amount_cents, order_date AS at, status, source
 FROM imported_orders WHERE store_slug = ${slug}
 ORDER BY order_date DESC NULLS LAST LIMIT 12`.catch(nil),
 sql`SELECT lower(buyer_email) AS email, MIN(order_date) AS first_at, MAX(order_date) AS last_at, status
 FROM imported_orders WHERE store_slug = ${slug} AND buyer_email IS NOT NULL AND buyer_email <> ''
 GROUP BY 1, 4`.catch(nil),
 ]) as any[][];

 const [topViewed, topFavorited, vfTotals, topSearches] = await Promise.all([
 getTopViewed(slug, cutoff, 6).catch(() => []),
 getTopFavorited(slug, cutoff, 6).catch(() => []),
 storeViewFavoriteTotals(slug, cutoff).catch(() => ({ views: 0, favorites: 0 })),
 getTopSearches(slug, cutoff, 8).catch(() => []),
 ]);

 // ── Mix her history in ───────────────────────────────────────────────────────────────────────
 // One continuous line: her shop did what it did in March, whether the money arrived through
 // Shopify or through VYA. Two numbers and "please add them up" is showing her our plumbing.
 const sales = (rows: any[]) => (rows || []).filter((r) => countsAsSale(r?.status));
 const sum = (rows: any[]) => rows.reduce((n, r) => n + (Number(r.amount_cents) || 0), 0);
 const dayKey = (d: unknown) => { const t = d ? new Date(d as string) : null; return t && !isNaN(t.getTime()) ? t.toISOString().slice(5, 10).replace("-", "-") : ""; };

 const impSales = sales(impRows);
 const importedRevenueCents = sum(impSales);
 const importedOrders = impSales.length;

 // A marketplace sale has no status to filter — the row exists only because the piece sold.
 const mkt = (mktRows || []) as any[];
 const mktRevenueCents = mkt.reduce((n, r) => n + (Number(r.price_cents) || 0), 0);

 const revenueCents = Number(totals[0]?.revenue_cents || 0) + importedRevenueCents + mktRevenueCents;
 const orders = Number(totals[0]?.orders || 0) + importedOrders + mkt.length;
 const invRow = inv[0] || {};

 const impPriorSales = sales(impPrior);
 const impByDay = mergeByDay(
  impSales.map((r) => ({ day: dayKey(r.order_date), cents: Number(r.amount_cents) || 0 })),
  mkt.map((r) => ({ day: dayKey(r.sold_at), cents: Number(r.price_cents) || 0 })),
 );
 const withChannel = (c: ChannelKey) => ({ channel: c, channelLabel: channelLabel(c) });
 const impRecentSales = sales(impRecent).map((r) => ({
  title: String(r.title),
  amountCents: Number(r.amount_cents) || 0,
  at: r.at ? new Date(r.at).toISOString() : null,
  ...withChannel(fromImportSource(r.source)),
 }));

 const mktRecent = mkt.map((r) => ({
  title: String(r.title),
  amountCents: Number(r.price_cents) || 0,
  at: r.sold_at ? new Date(r.sold_at).toISOString() : null,
  ...withChannel(fromPlatform(r.platform)),
 }));

 // Every sale in the window under one label each: her shop, her market stall, the marketplaces she
 // cross-lists to, and the shop she came from.
 const byChannel = rollUp([
  ...(ownForChannel || []).map((r: any) => ({ channel: fromOrderChannel(r.channel, r.tender), amountCents: Number(r.amount_cents) || 0 })),
  ...mkt.map((r: any) => ({ channel: fromPlatform(r.platform), amountCents: Number(r.price_cents) || 0 })),
  ...impSales.map((r: any) => ({ channel: fromImportSource(r.source), amountCents: Number(r.amount_cents) || 0 })),
 ]);

 // Buyers, new and returning, across both. Somebody who bought on Shopify in 2024 and again on VYA
 // last week is RETURNING — counting her as new is the single most flattering lie a dashboard can
 // tell a seller about her own business.
 const impBuyerRows = sales(impBuyers);
 const firstSeen = new Map<string, number>();
 for (const r of impBuyerRows) {
  const email = String(r.email || "").toLowerCase();
  const t = r.first_at ? Date.parse(r.first_at) : NaN;
  if (!email || isNaN(t)) continue;
  firstSeen.set(email, Math.min(firstSeen.get(email) ?? Infinity, t));
 }
 const boughtInWindow = new Set(
  impBuyerRows
   .filter((r) => r.last_at && Date.parse(r.last_at) >= cutoffMs)
   .map((r) => String(r.email || "").toLowerCase())
   .filter(Boolean),
 );
 let impNew = 0;
 let impReturning = 0;
 for (const email of boughtInWindow) {
  ((firstSeen.get(email) ?? 0) >= cutoffMs ? () => impNew++ : () => impReturning++)();
 }

 return {
 periodDays: days ?? "all",
 revenueCents,
 orders,
 aovCents: orders ? Math.round(revenueCents / orders) : 0,
 revenueByDay: mergeByDay(byDay.map((r) => ({ day: String(r.day), cents: Number(r.cents) })), impByDay),
 inventory: { active: Number(invRow.active || 0), draft: Number(invRow.draft || 0), sold: Number(invRow.sold || 0), activeValueCents: Number(invRow.active_value_cents || 0) },
 topBrands: brands.map((r) => ({ brand: String(r.brand), sold: Number(r.sold), revenueCents: Number(r.revenue_cents) })),
 topCategories: cats.map((r) => ({ category: String(r.category), sold: Number(r.sold), revenueCents: Number(r.revenue_cents) })),
 recentSales: mergeRecent(
  recent.map((r) => ({
   title: String(r.title), amountCents: Number(r.amount_cents),
   at: r.at ? new Date(r.at).toISOString() : null,
   ...withChannel(fromOrderChannel(r.channel, r.tender)),
  })),
  mergeRecent(impRecentSales, mktRecent, 12), 6),
 customers: Number(custRows[0]?.n || 0),
 buyers: Number(buyerRows[0]?.n || 0) + firstSeen.size,
 newBuyers: Number(newRet[0]?.new_buyers || 0) + impNew,
 returningBuyers: Number(newRet[0]?.returning_buyers || 0) + impReturning,
 prior: {
  revenueCents: Number(prior[0]?.revenue_cents || 0) + sum(impPriorSales) + (mktPrior || []).reduce((n: number, r: any) => n + (Number(r.price_cents) || 0), 0),
  orders: Number(prior[0]?.orders || 0) + impPriorSales.length + (mktPrior || []).length,
 },
 sessions: Number(sessRows[0]?.n || 0),
 productViews: vfTotals.views,
 favorites: vfTotals.favorites,
 topViewed,
 topFavorited,
 topSearches,
 // Mixed into every figure above, and said out loud here so the dashboard can add a line of small
 // type. Mixed is what she asked for; silent would be VYA taking credit for her old shop.
 byChannel,
 brandsAreVyaOnly: importedOrders > 0,
 };
}
