import { sqlRows, safe, int, meanCents, ratePct } from "./core";
import { ensureAnalyticsViews } from "./views";
import { deltaPct, type ResolvedPeriod, type Window } from "./period";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — customers & retention.
//
// The buyer identity here is the lowercased order email: it's the only key that
// survives guest checkout, which is most of secondhand. Sales without an email —
// including every piece simply marked sold in the admin — still count toward GMV
// (see sales.ts) but can't be attributed to a person, so `identifiedRevenuePct`
// tells the seller how much of the picture is people-shaped. On a store that
// records sales by hand that number is near zero, and saying so is the point.
//
// "New" vs "returning" is decided by FIRST-EVER order, not first order in the
// window — someone who bought in 2024 and again today is returning, always.
// ───────────────────────────────────────────────────────────────────────────

export type TopCustomer = {
 email: string;
 name: string | null;
 orders: number;
 spentCents: number;
 firstOrderAt: string | null;
 lastOrderAt: string | null;
};

export type Cohort = {
 month: string; // YYYY-MM of first purchase
 customers: number;
 repeatCustomers: number;
 repeatPct: number;
 revenueCents: number;
};

export type CustomerMetrics = {
 totalContacts: number; // the store's whole roster, buyers or not
 buyersAllTime: number;
 buyersInPeriod: number;
 newCustomers: number;
 returningCustomers: number;
 newVsReturningPct: { newPct: number; returningPct: number };
 repeatPurchaseRatePct: number; // lifetime buyers with 2+ orders
 avgLifetimeSpendCents: number;
 avgOrdersPerCustomer: number;
 identifiedRevenuePct: number;
 topCustomers: TopCustomer[];
 cohorts: Cohort[];
 vsPrior: { newPct: number | null; returningPct: number | null; buyersPct: number | null } | null;
};

const EMPTY: CustomerMetrics = {
 totalContacts: 0, buyersAllTime: 0, buyersInPeriod: 0, newCustomers: 0, returningCustomers: 0,
 newVsReturningPct: { newPct: 0, returningPct: 0 }, repeatPurchaseRatePct: 0,
 avgLifetimeSpendCents: 0, avgOrdersPerCustomer: 0, identifiedRevenuePct: 0,
 topCustomers: [], cohorts: [], vsPrior: null,
};

/** New / returning / total buyers inside one window, judged against lifetime history. */
async function windowBuyers(sellerId: string, w: Window): Promise<{ buyers: number; newC: number; returning: number }> {
 const rows = (await sqlRows()`
  WITH first_order AS (
   SELECT s.buyer_email AS email, MIN(s.sold_at) AS first_at
   FROM vya_store_sales s
   WHERE s.seller_id = ${sellerId}::uuid AND s.buyer_email IS NOT NULL AND s.sold_at IS NOT NULL
   GROUP BY 1
  ), in_window AS (
   SELECT DISTINCT s.buyer_email AS email
   FROM vya_store_sales s
   WHERE s.seller_id = ${sellerId}::uuid AND s.buyer_email IS NOT NULL
    AND s.sold_at >= ${w.startISO} AND s.sold_at < ${w.endISO}
  )
  SELECT COUNT(*)::int AS buyers,
   COUNT(*) FILTER (WHERE f.first_at >= ${w.startISO})::int AS new_c,
   COUNT(*) FILTER (WHERE f.first_at < ${w.startISO})::int AS returning_c
  FROM in_window i JOIN first_order f ON f.email = i.email
 `);
 const r = rows[0] ?? {};
 return { buyers: int(r.buyers), newC: int(r.new_c), returning: int(r.returning_c) };
}

export async function getCustomerMetrics(sellerId: string, slug: string, period: ResolvedPeriod): Promise<CustomerMetrics> {
 const { current, prior } = period;

 return safe(async () => {
  await ensureAnalyticsViews();
  const sql = sqlRows();

  const [cur, pri, lifetime, contacts, topRows, cohortRows, coverage] = await Promise.all([
   windowBuyers(sellerId, current),
   prior ? windowBuyers(sellerId, prior) : Promise.resolve(null),
   // Lifetime shape of the buyer base — the denominator for repeat rate and LTV.
   sql`
    WITH per_buyer AS (
     SELECT s.buyer_email AS email, COUNT(*)::int AS orders, SUM(s.amount_cents)::bigint AS spent
     FROM vya_store_sales s
     WHERE s.seller_id = ${sellerId}::uuid AND s.buyer_email IS NOT NULL
     GROUP BY 1
    )
    SELECT COUNT(*)::int AS buyers,
     COUNT(*) FILTER (WHERE orders >= 2)::int AS repeat_buyers,
     COALESCE(SUM(spent), 0)::bigint AS spent,
     COALESCE(SUM(orders), 0)::int AS order_count
    FROM per_buyer
   `,
   sql`SELECT COUNT(*)::int AS n FROM store_customers WHERE store_slug = ${slug}`.catch(() => []),
   // Top customers by lifetime spend, with the roster's name when we have one.
   sql`
    SELECT sl.buyer_email AS email, MAX(sc.name) AS name,
     COUNT(*)::int AS orders, SUM(sl.amount_cents)::bigint AS spent,
     MIN(sl.sold_at) AS first_at, MAX(sl.sold_at) AS last_at
    FROM vya_store_sales sl
    LEFT JOIN store_customers sc ON sc.store_slug = ${slug} AND sc.email = sl.buyer_email
    WHERE sl.seller_id = ${sellerId}::uuid AND sl.buyer_email IS NOT NULL
    GROUP BY 1 ORDER BY spent DESC LIMIT 10
   `,
   // Acquisition cohorts: everyone grouped by the month of their first order, with
   // the share that ever came back. The single clearest read on retention.
   sql`
    WITH per_buyer AS (
     SELECT s.buyer_email AS email, MIN(s.sold_at) AS first_at,
      COUNT(*)::int AS orders, SUM(s.amount_cents)::bigint AS spent
     FROM vya_store_sales s
     WHERE s.seller_id = ${sellerId}::uuid AND s.buyer_email IS NOT NULL AND s.sold_at IS NOT NULL
     GROUP BY 1
    )
    SELECT to_char(date_trunc('month', first_at), 'YYYY-MM') AS month,
     COUNT(*)::int AS customers,
     COUNT(*) FILTER (WHERE orders >= 2)::int AS repeat_customers,
     COALESCE(SUM(spent), 0)::bigint AS revenue_cents
    FROM per_buyer WHERE first_at IS NOT NULL
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12
   `,
   // How much of the period's revenue can be tied to a person at all.
   sql`
    SELECT COALESCE(SUM(s.amount_cents), 0)::bigint AS total,
     COALESCE(SUM(s.amount_cents) FILTER (WHERE s.buyer_email IS NOT NULL), 0)::bigint AS identified
    FROM vya_store_sales s
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
   `,
  ]);

  const lt = lifetime[0] ?? {};
  const buyersAllTime = int(lt.buyers);
  const lifetimeSpend = int(lt.spent);
  const lifetimeOrders = int(lt.order_count);
  const cov = coverage[0] ?? {};

  return {
   totalContacts: int(contacts[0]?.n),
   buyersAllTime,
   buyersInPeriod: cur.buyers,
   newCustomers: cur.newC,
   returningCustomers: cur.returning,
   newVsReturningPct: { newPct: ratePct(cur.newC, cur.buyers), returningPct: ratePct(cur.returning, cur.buyers) },
   repeatPurchaseRatePct: ratePct(int(lt.repeat_buyers), buyersAllTime),
   avgLifetimeSpendCents: meanCents(lifetimeSpend, buyersAllTime),
   avgOrdersPerCustomer: buyersAllTime > 0 ? Math.round((lifetimeOrders / buyersAllTime) * 100) / 100 : 0,
   identifiedRevenuePct: ratePct(int(cov.identified), int(cov.total)),
   topCustomers: topRows.map((r) => ({
    email: String(r.email),
    name: r.name ? String(r.name) : null,
    orders: int(r.orders),
    spentCents: int(r.spent),
    firstOrderAt: r.first_at ? new Date(r.first_at as string).toISOString() : null,
    lastOrderAt: r.last_at ? new Date(r.last_at as string).toISOString() : null,
   })),
   cohorts: cohortRows.map((r) => ({
    month: String(r.month),
    customers: int(r.customers),
    repeatCustomers: int(r.repeat_customers),
    repeatPct: ratePct(int(r.repeat_customers), int(r.customers)),
    revenueCents: int(r.revenue_cents),
   })),
   vsPrior: pri ? {
    newPct: deltaPct(cur.newC, pri.newC),
    returningPct: deltaPct(cur.returning, pri.returning),
    buyersPct: deltaPct(cur.buyers, pri.buyers),
   } : null,
  };
 }, EMPTY, "customers");
}
