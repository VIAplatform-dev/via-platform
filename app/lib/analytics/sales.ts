import { sqlRows, SOLD_STATUSES, safe, int, meanCents, ratePct, truncUnit, fillSeries } from "./core";
import { ensureAnalyticsViews } from "./views";
import { deltaPct, type Granularity, type ResolvedPeriod, type Window } from "./period";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — sales & revenue.
//
// GMV, order count and AOV for the period, each carrying its own direction:
// against the prior comparable period AND against the same period a year ago.
// Plus the trend behind the headline, and the store's best day / best week —
// the number sellers actually plan around ("Saturdays are my day").
//
// Reads `vya_store_sales`, so a piece marked sold in the admin counts exactly
// like one that came through checkout. See views.ts for why that matters.
// Sales with no recorded date are reported separately rather than smeared
// across the calendar; `undatedSales` is how the seller learns they exist.
// ───────────────────────────────────────────────────────────────────────────

export type SalesTotals = {
 gmvCents: number;
 orders: number;
 aovCents: number;
 unitsSold: number;
};

export type SalesPoint = { bucket: string; cents: number; orders: number };

export type SalesDeltas = { gmvPct: number | null; ordersPct: number | null; aovPct: number | null };

export type SalesMetrics = {
 current: SalesTotals;
 prior: SalesTotals | null;
 yoy: SalesTotals | null;
 vsPrior: SalesDeltas | null;
 vsYoy: SalesDeltas | null;
 granularity: Granularity;
 series: SalesPoint[];
 bestDay: { day: string; cents: number; orders: number } | null;
 bestWeek: { weekStart: string; cents: number; orders: number } | null;
 recentSales: { title: string; amountCents: number; at: string | null; buyerEmail: string | null; origin: string }[];
 /** Sold pieces with no sale date on record — real revenue, but not placeable in time. */
 undatedSales: { count: number; valueCents: number };
 /** Money that came back. Refunded orders never count toward GMV, so this stands apart from it. */
 returns: { orders: number; valueCents: number; ratePct: number };
 /**
  * Sales tax collected from buyers. NOT revenue — it's held on behalf of the
  * state until the seller files, so it's reported separately and never added to
  * GMV. Null-safe: orders from before tax was switched on simply contribute 0.
  */
 taxCollectedCents: number;
};

const ZERO: SalesTotals = { gmvCents: 0, orders: 0, aovCents: 0, unitsSold: 0 };

async function totals(sellerId: string, w: Window): Promise<SalesTotals> {
 const rows = await sqlRows()`
  SELECT COUNT(*)::int AS orders,
   COUNT(DISTINCT s.item_id)::int AS units,
   COALESCE(SUM(s.amount_cents), 0)::bigint AS gmv_cents
  FROM vya_store_sales s
  WHERE s.seller_id = ${sellerId}::uuid
   AND s.sold_at >= ${w.startISO} AND s.sold_at < ${w.endISO}
 `;
 const r = rows[0] ?? {};
 const gmvCents = int(r.gmv_cents);
 const orders = int(r.orders);
 return { gmvCents, orders, aovCents: meanCents(gmvCents, orders), unitsSold: int(r.units) };
}

function deltas(cur: SalesTotals, base: SalesTotals | null): SalesDeltas | null {
 if (!base) return null;
 return {
  gmvPct: deltaPct(cur.gmvCents, base.gmvCents),
  ordersPct: deltaPct(cur.orders, base.orders),
  aovPct: deltaPct(cur.aovCents, base.aovCents),
 };
}

export async function getSalesMetrics(sellerId: string, period: ResolvedPeriod): Promise<SalesMetrics> {
 const { current, prior, yoy, granularity, tz } = period;
 const unit = truncUnit(granularity);

 const empty: SalesMetrics = {
  current: ZERO, prior: null, yoy: null, vsPrior: null, vsYoy: null,
  granularity, series: [], bestDay: null, bestWeek: null, recentSales: [],
  undatedSales: { count: 0, valueCents: 0 }, returns: { orders: 0, valueCents: 0, ratePct: 0 }, taxCollectedCents: 0,
 };

 return safe(async () => {
  await ensureAnalyticsViews();
  const sql = sqlRows();

  const [cur, pri, yy, seriesRows, dayRows, weekRows, recentRows, undatedRows, returnRows, taxRows] = await Promise.all([
   totals(sellerId, current),
   prior ? totals(sellerId, prior) : Promise.resolve(null),
   yoy ? totals(sellerId, yoy) : Promise.resolve(null),
   sql`
    SELECT to_char(date_trunc(${unit}, s.sold_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS bucket,
     COALESCE(SUM(s.amount_cents), 0)::bigint AS cents, COUNT(*)::int AS orders
    FROM vya_store_sales s
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    GROUP BY 1 ORDER BY 1
   `,
   sql`
    SELECT to_char(date_trunc('day', s.sold_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day,
     COALESCE(SUM(s.amount_cents), 0)::bigint AS cents, COUNT(*)::int AS orders
    FROM vya_store_sales s
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    GROUP BY 1 ORDER BY cents DESC LIMIT 1
   `,
   sql`
    SELECT to_char(date_trunc('week', s.sold_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week_start,
     COALESCE(SUM(s.amount_cents), 0)::bigint AS cents, COUNT(*)::int AS orders
    FROM vya_store_sales s
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    GROUP BY 1 ORDER BY cents DESC LIMIT 1
   `,
   sql`
    SELECT COALESCE(i.title, 'Item') AS title, s.amount_cents::int AS amount_cents,
     s.sold_at AS at, s.buyer_email, s.origin
    FROM vya_store_sales s LEFT JOIN items i ON i.id = s.item_id
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    ORDER BY s.sold_at DESC LIMIT 8
   `,
   sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_cents), 0)::bigint AS value_cents
    FROM vya_store_sales WHERE seller_id = ${sellerId}::uuid AND sold_at IS NULL
   `,
   sql`
    SELECT COALESCE(SUM(tax_cents), 0)::bigint AS cents FROM orders
    WHERE seller_id = ${sellerId}::uuid AND status = ANY(${SOLD_STATUSES})
     AND paid_at >= ${current.startISO} AND paid_at < ${current.endISO}
   `.catch(() => []),
   // Refunds live on orders alone — a hand-marked sale has no concept of coming back.
   sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_cents), 0)::bigint AS value_cents
    FROM orders
    WHERE seller_id = ${sellerId}::uuid AND status = 'refunded'
     AND COALESCE(paid_at, created_at) >= ${current.startISO}
     AND COALESCE(paid_at, created_at) < ${current.endISO}
   `,
  ]);

  const series = fillSeries(
   seriesRows.map((r) => ({ bucket: String(r.bucket), cents: int(r.cents), orders: int(r.orders) })),
   current, granularity,
   (bucket) => ({ bucket, cents: 0, orders: 0 }),
  );

  const bd = dayRows[0];
  const bw = weekRows[0];

  return {
   current: cur,
   prior: pri,
   yoy: yy,
   vsPrior: deltas(cur, pri),
   vsYoy: deltas(cur, yy),
   granularity,
   series,
   bestDay: bd ? { day: String(bd.day), cents: int(bd.cents), orders: int(bd.orders) } : null,
   bestWeek: bw ? { weekStart: String(bw.week_start), cents: int(bw.cents), orders: int(bw.orders) } : null,
   recentSales: recentRows.map((r) => ({
    title: String(r.title),
    amountCents: int(r.amount_cents),
    at: r.at ? new Date(r.at as string).toISOString() : null,
    buyerEmail: r.buyer_email ? String(r.buyer_email) : null,
    origin: String(r.origin ?? "order"),
   })),
   undatedSales: { count: int(undatedRows[0]?.n), valueCents: int(undatedRows[0]?.value_cents) },
   taxCollectedCents: int(taxRows[0]?.cents),
   returns: {
    orders: int(returnRows[0]?.n),
    valueCents: int(returnRows[0]?.value_cents),
    ratePct: ratePct(int(returnRows[0]?.n), cur.orders + int(returnRows[0]?.n)),
   },
  };
 }, empty, "sales");
}
