import { sqlRows, safe, int, meanCents, ratePct, type Row } from "./core";
import { ensureAnalyticsViews } from "./views";
import { deltaPct, type ResolvedPeriod, type Window } from "./period";
import { expenseTotals, applyRecurring, categoryLabel, type CategoryTotal, type ExpenseCategory, type AppliedRecurring } from "../expenses-db";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — profit & margin.
//
// The one big reporting category VYA couldn't match Shopify on, because it
// depends on a number only the seller knows: what they paid. `items.cost_cents`
// has always existed and the intake form has always had the field — it was just
// never required, so almost nothing carries it.
//
// That shapes the whole module. Every figure here is computed over the COVERED
// slice (sales whose item has a cost on record) and reported next to
// `coveragePct`, so a store reading "68% margin" also reads "on the 12% of sales
// we know your cost for". Extrapolating across the uncovered slice would be
// inventing profit, so we don't.
// ───────────────────────────────────────────────────────────────────────────

export type MarginTotals = {
 /** Sales in the window whose item carries a cost — the only ones profit can be computed on. */
 coveredSales: number;
 totalSales: number;
 coveragePct: number;
 revenueCents: number; // revenue of the covered slice only, NET of tax collected
 /** Tax collected on those sales — the government's share, excluded from revenue above. */
 taxCents: number;
 /** Covered sales with no tax figure recorded, so the caller can caveat rather than imply precision. */
 salesWithoutTax: number;
 costCents: number;
 grossProfitCents: number;
 grossMarginPct: number | null;
 /** Profit per dollar of cost — the resale question, "what did my buying return?" */
 roiPct: number | null;
 avgProfitPerSaleCents: number;
};

export type MarginRow = {
 name: string;
 sales: number;
 revenueCents: number;
 costCents: number;
 profitCents: number;
 marginPct: number | null;
};

export type MarginItem = {
 itemId: string;
 title: string;
 image: string | null;
 priceCents: number;
 costCents: number;
 profitCents: number;
 marginPct: number | null;
 soldAt: string | null;
};

export type OperatingCosts = {
 totalCents: number;
 byCategory: CategoryTotal[];
 priorTotalCents: number | null;
 /** What the packing recipe and the monthly list contributed, and how it was worked out. */
 recurring: {
  perOrder: { rateCents: number; sales: number; appliedCents: number };
  monthly: { rateCents: number; months: number; appliedCents: number };
 };
};

export type MarginMetrics = {
 /** False when nothing in the window has a cost — the UI shows the prompt, not zeros. */
 available: boolean;
 current: MarginTotals;
 prior: MarginTotals | null;
 vsPrior: { profitPct: number | null; marginPct: number | null } | null;
 byBrand: MarginRow[];
 byCategory: MarginRow[];
 bestMargin: MarginItem[];
 worstMargin: MarginItem[];
 /** Live listings with no cost recorded — what to fill in to widen coverage. */
 activeWithoutCost: number;
 activeTotal: number;
 /** Money tied up in unsold stock at what it cost, not at list price. */
 inventoryCostCents: number;
 /** Everything the store spent to trade that wasn't the price of a piece. */
 operating: OperatingCosts;
 /**
  * Gross profit minus operating costs. Null when no cost of goods is known at
  * all — subtracting real expenses from an unknown gross would print a loss the
  * store isn't actually making.
  */
 netProfitCents: number | null;
 netMarginPct: number | null;
};

const ZERO: MarginTotals = {
 coveredSales: 0, totalSales: 0, coveragePct: 0, revenueCents: 0, taxCents: 0, salesWithoutTax: 0, costCents: 0,
 grossProfitCents: 0, grossMarginPct: null, roiPct: null, avgProfitPerSaleCents: 0,
};

const EMPTY: MarginMetrics = {
 available: false, current: ZERO, prior: null, vsPrior: null,
 byBrand: [], byCategory: [], bestMargin: [], worstMargin: [],
 activeWithoutCost: 0, activeTotal: 0, inventoryCostCents: 0,
 operating: {
  totalCents: 0, byCategory: [], priorTotalCents: null,
  recurring: { perOrder: { rateCents: 0, sales: 0, appliedCents: 0 }, monthly: { rateCents: 0, months: 0, appliedCents: 0 } },
 },
 netProfitCents: null, netMarginPct: null,
};

// A cost of zero counts as "not recorded" throughout: genuinely free stock is
// rare, an unfilled field is not, and treating a blank as £0 would report a 100%
// margin on every listing nobody costed.

async function totalsFor(sellerId: string, w: Window): Promise<MarginTotals> {
 const rows = await sqlRows()`
  SELECT
   COUNT(*)::int AS total_sales,
   COUNT(*) FILTER (WHERE i.cost_cents > 0)::int AS covered_sales,
   -- Revenue is the sale LESS the tax collected on it. On a tax-inclusive store (UK, EU, AU) the
   -- amount already contains VAT, and that money is the government's, never the seller's: £200 at
   -- 20% is £166.67 of revenue. Counting the gross overstates revenue, margin and ROI at once.
   COALESCE(SUM(s.amount_cents - COALESCE(s.tax_cents, 0)) FILTER (WHERE i.cost_cents > 0), 0)::bigint AS revenue_cents,
   COALESCE(SUM(s.tax_cents) FILTER (WHERE i.cost_cents > 0), 0)::bigint AS tax_cents,
   -- Sales whose tax we simply don't know (an item marked sold never went through checkout).
   -- Reported so the P&L can say the figure may still contain tax, instead of implying precision.
   COUNT(*) FILTER (WHERE i.cost_cents > 0 AND s.tax_cents IS NULL)::int AS sales_without_tax,
   COALESCE(SUM(i.cost_cents) FILTER (WHERE i.cost_cents > 0), 0)::bigint AS cost_cents
  FROM vya_store_sales s JOIN items i ON i.id = s.item_id
  WHERE s.seller_id = ${sellerId}::uuid
   AND s.sold_at >= ${w.startISO} AND s.sold_at < ${w.endISO}
 `;
 const r = rows[0] ?? {};
 const revenueCents = int(r.revenue_cents);
 const costCents = int(r.cost_cents);
 const coveredSales = int(r.covered_sales);
 const totalSales = int(r.total_sales);
 const grossProfitCents = revenueCents - costCents;
 return {
  coveredSales,
  totalSales,
  coveragePct: ratePct(coveredSales, totalSales),
  revenueCents,
  taxCents: int(r.tax_cents),
  salesWithoutTax: int(r.sales_without_tax),
  costCents,
  grossProfitCents,
  grossMarginPct: revenueCents > 0 ? Math.round((grossProfitCents / revenueCents) * 1000) / 10 : null,
  roiPct: costCents > 0 ? Math.round((grossProfitCents / costCents) * 1000) / 10 : null,
  avgProfitPerSaleCents: meanCents(grossProfitCents, coveredSales),
 };
}

function rowsFrom(raw: Row[]): MarginRow[] {
 return raw.map((r) => {
  const revenueCents = int(r.revenue_cents);
  const costCents = int(r.cost_cents);
  const profitCents = revenueCents - costCents;
  return {
   name: String(r.name),
   sales: int(r.sales),
   revenueCents,
   costCents,
   profitCents,
   marginPct: revenueCents > 0 ? Math.round((profitCents / revenueCents) * 1000) / 10 : null,
  };
 });
}

export async function getMarginMetrics(sellerId: string, slug: string, period: ResolvedPeriod): Promise<MarginMetrics> {
 const { current, prior } = period;

 return safe(async () => {
  await ensureAnalyticsViews();
  const sql = sqlRows();

  const [cur, pri, brandRows, catRows, itemRows, activeRows, opex, salesByDay, priorOpex] = await Promise.all([
   totalsFor(sellerId, current),
   prior ? totalsFor(sellerId, prior) : Promise.resolve(null),
   sql`
    SELECT COALESCE(NULLIF(i.brand, ''), 'Unbranded') AS name, COUNT(*)::int AS sales,
     COALESCE(SUM(s.amount_cents), 0)::bigint AS revenue_cents,
     COALESCE(SUM(i.cost_cents), 0)::bigint AS cost_cents
    FROM vya_store_sales s JOIN items i ON i.id = s.item_id
    WHERE s.seller_id = ${sellerId}::uuid AND i.cost_cents > 0
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    GROUP BY 1 ORDER BY (COALESCE(SUM(s.amount_cents), 0) - COALESCE(SUM(i.cost_cents), 0)) DESC LIMIT 8
   `,
   sql`
    SELECT COALESCE(NULLIF(i.category, ''), 'Other') AS name, COUNT(*)::int AS sales,
     COALESCE(SUM(s.amount_cents), 0)::bigint AS revenue_cents,
     COALESCE(SUM(i.cost_cents), 0)::bigint AS cost_cents
    FROM vya_store_sales s JOIN items i ON i.id = s.item_id
    WHERE s.seller_id = ${sellerId}::uuid AND i.cost_cents > 0
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    GROUP BY 1 ORDER BY (COALESCE(SUM(s.amount_cents), 0) - COALESCE(SUM(i.cost_cents), 0)) DESC LIMIT 8
   `,
   sql`
    SELECT i.id AS item_id, i.title, i.images, s.amount_cents AS price_cents, i.cost_cents, s.sold_at
    FROM vya_store_sales s JOIN items i ON i.id = s.item_id
    WHERE s.seller_id = ${sellerId}::uuid AND i.cost_cents > 0
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
   `,
   sql`
    SELECT COUNT(*)::int AS active,
     COUNT(*) FILTER (WHERE cost_cents IS NULL OR cost_cents <= 0)::int AS no_cost,
     COALESCE(SUM(cost_cents) FILTER (WHERE cost_cents > 0), 0)::bigint AS inventory_cost_cents
    FROM items WHERE seller_id = ${sellerId}::uuid AND status = 'active'
   `,
   // Operating costs are keyed by store slug, not seller id — they're the store's
   // running costs, not any one piece's.
   expenseTotals(slug, current.startISO, current.endISO, period.tz).catch(() => ({ totalCents: 0, byCategory: [] as CategoryTotal[] })),
   // Sales per day, so a per-order rate can be prorated from the day it started.
   // Same ledger the statement's revenue comes from, so the two always agree.
   sql`
    SELECT to_char(sold_at AT TIME ZONE ${period.tz}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM vya_store_sales
    WHERE seller_id = ${sellerId}::uuid
     AND sold_at >= ${current.startISO} AND sold_at < ${current.endISO}
    GROUP BY 1
   `.catch(() => []),
   prior
    ? expenseTotals(slug, prior.startISO, prior.endISO, period.tz).then((t) => t.totalCents).catch(() => null)
    : Promise.resolve(null),
  ]);

  // Fold the rates into the same category lines the one-offs use, so the statement
  // shows one number per category however that money was recorded.
  const salesOn = new Map<string, number>(salesByDay.map((r) => [String(r.day), int(r.n)]));
  const rated: AppliedRecurring = await applyRecurring(slug, current.startISO, current.endISO, salesOn, period.tz)
   .catch(() => ({ byCategory: new Map<ExpenseCategory, number>(), totalCents: 0, perOrder: { rateCents: 0, sales: 0, appliedCents: 0 }, monthly: { rateCents: 0, months: 0, appliedCents: 0 } }));

  const mergedCategories: CategoryTotal[] = opex.byCategory.map((c) => {
   const extra = rated.byCategory.get(c.category) ?? 0;
   return extra ? { ...c, label: categoryLabel(c.category), amountCents: c.amountCents + extra } : c;
  });
  const operating: OperatingCosts = {
   totalCents: opex.totalCents + rated.totalCents,
   byCategory: mergedCategories,
   priorTotalCents: priorOpex,
   recurring: { perOrder: rated.perOrder, monthly: rated.monthly },
  };

  const items: MarginItem[] = itemRows.map((r) => {
   const images = Array.isArray(r.images) ? (r.images as unknown[]) : [];
   const priceCents = int(r.price_cents);
   const costCents = int(r.cost_cents);
   const profitCents = priceCents - costCents;
   return {
    itemId: String(r.item_id),
    title: r.title ? String(r.title) : "(item removed)",
    image: images.length ? String(images[0]) : null,
    priceCents,
    costCents,
    profitCents,
    marginPct: priceCents > 0 ? Math.round((profitCents / priceCents) * 1000) / 10 : null,
    soldAt: r.sold_at ? new Date(r.sold_at as string).toISOString() : null,
   };
  });
  const byProfit = [...items].sort((a, b) => b.profitCents - a.profitCents);
  const active = activeRows[0] ?? {};

  return {
   // "Available" means there is something to show — either a margin, or costs the
   // seller has already logged. A store with expenses but no COGS still gets a page.
   available: cur.coveredSales > 0 || operating.totalCents > 0,
   current: cur,
   prior: pri,
   vsPrior: pri ? {
    profitPct: deltaPct(cur.grossProfitCents, pri.grossProfitCents),
    marginPct: cur.grossMarginPct != null && pri.grossMarginPct != null ? deltaPct(cur.grossMarginPct, pri.grossMarginPct) : null,
   } : null,
   byBrand: rowsFrom(brandRows),
   byCategory: rowsFrom(catRows),
   bestMargin: byProfit.slice(0, 8),
   // The tail, worst first — pieces that lost money or barely broke even. Excludes
   // anything already shown as a best seller, so a short list can't print twice.
   worstMargin: (() => {
    const bestIds = new Set(byProfit.slice(0, 8).map((i) => i.itemId));
    return byProfit.filter((i) => !bestIds.has(i.itemId)).slice(-8).reverse();
   })(),
   activeWithoutCost: int(active.no_cost),
   activeTotal: int(active.active),
   inventoryCostCents: int(active.inventory_cost_cents),
   operating,
   netProfitCents: cur.coveredSales > 0 ? cur.grossProfitCents - operating.totalCents : null,
   netMarginPct: cur.coveredSales > 0 && cur.revenueCents > 0
    ? Math.round(((cur.grossProfitCents - operating.totalCents) / cur.revenueCents) * 1000) / 10
    : null,
  };
 }, EMPTY, "margin");
}
