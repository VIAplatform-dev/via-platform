import { sqlRows, safe, int, ratePct, type Row } from "./core";
import { ensureAnalyticsViews } from "./views";
import type { ResolvedPeriod } from "./period";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — product performance.
//
// Which pieces earn, which pieces sit, and which are quietly ageing out of
// relevance. On one-of-one inventory a "best seller" isn't a repeat SKU, it's
// the piece that moved fast at a good price — so ranking is by revenue, and the
// mirror image (worst performers) is judged on attention earned per day live
// rather than on sales a sold-once item never had a second chance at.
//
// Engagement comes from `vya_store_engagement`, the de-duplicated union of the
// capture tables and the event stream (see views.ts), keyed on items.id — so
// views and favourites join the catalog exactly, with no fuzzy matching.
// ───────────────────────────────────────────────────────────────────────────

export type ProductRow = {
 itemId: string;
 title: string;
 image: string | null;
 priceCents: number;
 status: string;
 brand: string | null;
 category: string | null;
 views: number;
 favorites: number;
 checkouts: number;
 revenueCents: number;
 daysLive: number | null;
 daysToSell: number | null;
 soldAt: string | null;
};

export type ProductMetrics = {
 bestSellers: ProductRow[];
 worstPerformers: ProductRow[];
 mostViewed: ProductRow[];
 mostFavorited: ProductRow[];
 aging: { thresholdDays: number; count: number; valueCents: number; shareOfActivePct: number; items: ProductRow[] };
};

const AGING_DAYS = 90; // live this long unsold = the piece to reprice, restage or relist
const ENGAGEMENT_CAP = 300; // enough to rank the top lists; keeps a busy store's payload sane
const FAIR_RUN_DAYS = 14; // below this a listing hasn't had time to prove anything

const EMPTY: ProductMetrics = {
 bestSellers: [], worstPerformers: [], mostViewed: [], mostFavorited: [],
 aging: { thresholdDays: AGING_DAYS, count: 0, valueCents: 0, shareOfActivePct: 0, items: [] },
};

type Engagement = { views: number; favorites: number; checkouts: number };
const NO_ENGAGEMENT: Engagement = { views: 0, favorites: 0, checkouts: 0 };

function toRow(r: Row, e: Engagement, extra: { revenueCents?: number; soldAt?: string | null; daysToSell?: number | null } = {}): ProductRow {
 const images = Array.isArray(r.images) ? (r.images as unknown[]) : [];
 return {
  itemId: String(r.item_id ?? r.id),
  title: r.title ? String(r.title) : "(item removed)",
  image: images.length ? String(images[0]) : null,
  priceCents: int(r.price_cents),
  status: r.status ? String(r.status) : "unknown",
  brand: r.brand ? String(r.brand) : null,
  category: r.category ? String(r.category) : null,
  views: e.views,
  favorites: e.favorites,
  checkouts: e.checkouts,
  revenueCents: extra.revenueCents ?? 0,
  daysLive: r.days_live == null ? null : Math.round(Number(r.days_live)),
  daysToSell: extra.daysToSell ?? null,
  soldAt: extra.soldAt ?? null,
 };
}

export async function getProductMetrics(sellerId: string, slug: string, period: ResolvedPeriod): Promise<ProductMetrics> {
 const { current } = period;

 return safe(async () => {
  await ensureAnalyticsViews();
  const sql = sqlRows();

  // Pass 1 — engagement for the window, per item. Everything below reads from this.
  const engagementRows = (await sql`
   SELECT item_id,
    COUNT(*) FILTER (WHERE event_type = 'view')::int AS views,
    COUNT(*) FILTER (WHERE event_type = 'favorite')::int AS favorites,
    COUNT(*) FILTER (WHERE event_type = 'checkout_start')::int AS checkouts
   FROM vya_store_engagement
   WHERE store_slug = ${slug} AND item_id IS NOT NULL
    AND ts >= ${current.startISO} AND ts < ${current.endISO}
   GROUP BY item_id ORDER BY views DESC LIMIT ${ENGAGEMENT_CAP}
  `);

  const eng = new Map<string, Engagement>(
   engagementRows.map((r) => [String(r.item_id), { views: int(r.views), favorites: int(r.favorites), checkouts: int(r.checkouts) }]),
  );
  const engagedIds = [...eng.keys()];

  // Pass 2 — the catalog context, in one round trip.
  const [soldRows, activeRows, engagedRows, agingRows, activeTotals] = await Promise.all([
   sql`
    SELECT i.id AS item_id, i.title, i.images, i.price_cents, i.status, i.brand, i.category,
     SUM(s.amount_cents)::bigint AS revenue_cents,
     MAX(s.sold_at) AS sold_at,
     AVG(EXTRACT(EPOCH FROM (s.sold_at - i.created_at)) / 86400.0)::float AS days_to_sell
    FROM vya_store_sales s JOIN items i ON i.id = s.item_id
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    GROUP BY i.id ORDER BY revenue_cents DESC LIMIT 10
   `,
   sql`
    SELECT i.id AS item_id, i.title, i.images, i.price_cents, i.status, i.brand, i.category,
     EXTRACT(EPOCH FROM (now() - i.created_at)) / 86400.0 AS days_live
    FROM items i WHERE i.seller_id = ${sellerId}::uuid AND i.status = 'active'
   `,
   // Anything with engagement this window that isn't necessarily still active — so a
   // piece that sold last quarter but is being viewed today keeps its real title.
   engagedIds.length
    ? sql`
     SELECT i.id AS item_id, i.title, i.images, i.price_cents, i.status, i.brand, i.category,
      EXTRACT(EPOCH FROM (now() - i.created_at)) / 86400.0 AS days_live
     FROM items i WHERE i.seller_id = ${sellerId}::uuid AND i.id::text = ANY(${engagedIds})
    `
    : Promise.resolve([] as Row[]),
   sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(price_cents), 0)::bigint AS value_cents
    FROM items
    WHERE seller_id = ${sellerId}::uuid AND status = 'active'
     AND created_at < now() - make_interval(days => ${AGING_DAYS})
   `,
   sql`SELECT COUNT(*)::int AS n FROM items WHERE seller_id = ${sellerId}::uuid AND status = 'active'`,
  ]);

  const catalog = new Map<string, Row>();
  for (const r of [...activeRows, ...engagedRows]) catalog.set(String(r.item_id), r);

  const active = activeRows.map((r) => toRow(r, eng.get(String(r.item_id)) ?? NO_ENGAGEMENT));

  const bestSellers = soldRows.map((r) => toRow(r, eng.get(String(r.item_id)) ?? NO_ENGAGEMENT, {
   revenueCents: int(r.revenue_cents),
   soldAt: r.sold_at ? new Date(r.sold_at as string).toISOString() : null,
   daysToSell: r.days_to_sell == null ? null : Math.round(Number(r.days_to_sell) * 10) / 10,
  }));

  // Worst performers: live long enough to have had a fair run, ranked by the least
  // attention earned per day on the shelf. Cheap and expensive pieces compete on the
  // same footing because the measure is interest, not price.
  const worstPerformers = active
   .filter((p) => (p.daysLive ?? 0) >= FAIR_RUN_DAYS)
   .map((p) => ({ p, score: p.views / Math.max(1, p.daysLive ?? 1) }))
   .sort((a, b) => a.score - b.score || (b.p.daysLive ?? 0) - (a.p.daysLive ?? 0))
   .slice(0, 10)
   .map((x) => x.p);

  const rank = (key: "views" | "favorites"): ProductRow[] =>
   engagedIds
    .map((id) => toRow(catalog.get(id) ?? { item_id: id }, eng.get(id) ?? NO_ENGAGEMENT))
    .filter((p) => p[key] > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, 10);

  const agingCount = int(agingRows[0]?.n);

  return {
   bestSellers,
   worstPerformers,
   mostViewed: rank("views"),
   mostFavorited: rank("favorites"),
   aging: {
    thresholdDays: AGING_DAYS,
    count: agingCount,
    valueCents: int(agingRows[0]?.value_cents),
    shareOfActivePct: ratePct(agingCount, int(activeTotals[0]?.n)),
    items: active.filter((p) => (p.daysLive ?? 0) >= AGING_DAYS).sort((a, b) => (b.daysLive ?? 0) - (a.daysLive ?? 0)).slice(0, 20),
   },
  };
 }, EMPTY, "products");
}
