import { sqlRows, safe, int, meanCents, ratePct, type Row } from "./core";
import { ensureAnalyticsViews } from "./views";
import { deltaPct, type ResolvedPeriod, type Window } from "./period";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — pricing & catalog.
//
// Two prices matter and they are not the same number: what a store ASKS (the
// live catalog) and what things actually GO FOR (realised sale amounts). The gap
// between them is the most useful pricing signal a reseller has, so both appear
// side by side as mean and median — median because one $6,000 Birkin should not
// move the read on a $180 catalog.
//
// Sell-through is period-scoped: sold in the window ÷ (sold in the window + what
// is still listed). It answers "of what I could have sold, how much did I".
// ───────────────────────────────────────────────────────────────────────────

/** Shared band definition — the API and the UI must agree on where $250 falls. */
export const PRICE_BANDS: { label: string; minCents: number; maxCents: number | null }[] = [
 { label: "Under $100", minCents: 0, maxCents: 10_000 },
 { label: "$100–249", minCents: 10_000, maxCents: 25_000 },
 { label: "$250–499", minCents: 25_000, maxCents: 50_000 },
 { label: "$500–999", minCents: 50_000, maxCents: 100_000 },
 { label: "$1,000+", minCents: 100_000, maxCents: null },
];

// The upper edge of each band, as the threshold array `width_bucket` takes.
const BAND_EDGES = PRICE_BANDS.map((b) => b.maxCents).filter((c): c is number => c != null);

export type PriceBand = {
 label: string;
 minCents: number;
 maxCents: number | null;
 listed: number;
 listedPct: number;
 sold: number;
 revenueCents: number;
};

export type MixRow = {
 name: string;
 listed: number;
 sold: number;
 revenueCents: number;
 sellThroughPct: number;
 avgSoldPriceCents: number;
};

export type CatalogMetrics = {
 activeListings: number;
 draftListings: number;
 soldAllTime: number;
 inventoryValueCents: number;
 listedInPeriod: number;
 soldInPeriod: number;
 avgListedPriceCents: number;
 medianListedPriceCents: number;
 avgSoldPriceCents: number;
 medianSoldPriceCents: number;
 /** Realised ÷ asking, as a percentage. Under 100 means the catalog sells below list. */
 realisationPct: number | null;
 sellThroughPct: number;
 avgDaysToSell: number | null;
 medianDaysToSell: number | null;
 priceBands: PriceBand[];
 topBrands: MixRow[];
 topCategories: MixRow[];
 vsPrior: { sellThroughPct: number | null; avgSoldPricePct: number | null; daysToSellPct: number | null } | null;
};

const EMPTY: CatalogMetrics = {
 activeListings: 0, draftListings: 0, soldAllTime: 0, inventoryValueCents: 0,
 listedInPeriod: 0, soldInPeriod: 0, avgListedPriceCents: 0, medianListedPriceCents: 0,
 avgSoldPriceCents: 0, medianSoldPriceCents: 0, realisationPct: null, sellThroughPct: 0,
 avgDaysToSell: null, medianDaysToSell: null, priceBands: [], topBrands: [], topCategories: [], vsPrior: null,
};

/** The period-scoped numbers that also need a prior-period twin for deltas. */
async function windowShape(sellerId: string, w: Window, activeNow: number) {
 const sql = sqlRows();
 const [soldRows, daysRows] = await Promise.all([
  sql`
   SELECT COUNT(*)::int AS sold,
    COALESCE(SUM(s.amount_cents), 0)::bigint AS revenue_cents,
    COALESCE(AVG(s.amount_cents), 0)::float AS avg_cents
   FROM vya_store_sales s
   WHERE s.seller_id = ${sellerId}::uuid
    AND s.sold_at >= ${w.startISO} AND s.sold_at < ${w.endISO}
  `,
  sql`
   SELECT AVG(EXTRACT(EPOCH FROM (s.sold_at - i.created_at)) / 86400.0)::float AS avg_days,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
     ORDER BY EXTRACT(EPOCH FROM (s.sold_at - i.created_at)) / 86400.0
    )::float AS median_days
   FROM vya_store_sales s JOIN items i ON i.id = s.item_id
   WHERE s.seller_id = ${sellerId}::uuid
    AND s.sold_at >= ${w.startISO} AND s.sold_at < ${w.endISO}
    AND i.created_at IS NOT NULL AND s.sold_at >= i.created_at
  `,
 ]);
 const s = soldRows[0] ?? {};
 const d = daysRows[0] ?? {};
 const sold = int(s.sold);
 return {
  sold,
  revenueCents: int(s.revenue_cents),
  avgSoldPriceCents: Math.round(Number(s.avg_cents ?? 0)) || 0,
  sellThroughPct: ratePct(sold, sold + activeNow),
  avgDaysToSell: d.avg_days == null ? null : Math.round(Number(d.avg_days) * 10) / 10,
  medianDaysToSell: d.median_days == null ? null : Math.round(Number(d.median_days) * 10) / 10,
 };
}

/** Merge the "what's listed" and "what sold" halves of a mix breakdown into one row set. */
function mergeMix(listed: Row[], sold: Row[], limit: number): MixRow[] {
 const rows = new Map<string, MixRow>();
 const get = (name: string): MixRow => {
  let r = rows.get(name);
  if (!r) { r = { name, listed: 0, sold: 0, revenueCents: 0, sellThroughPct: 0, avgSoldPriceCents: 0 }; rows.set(name, r); }
  return r;
 };
 for (const l of listed) get(String(l.name)).listed = int(l.n);
 for (const s of sold) {
  const r = get(String(s.name));
  r.sold = int(s.n);
  r.revenueCents = int(s.revenue_cents);
 }
 return [...rows.values()]
  .map((r) => ({ ...r, sellThroughPct: ratePct(r.sold, r.sold + r.listed), avgSoldPriceCents: meanCents(r.revenueCents, r.sold) }))
  // Revenue first (that's what a seller acts on), then depth of catalog.
  .sort((a, b) => b.revenueCents - a.revenueCents || b.listed - a.listed)
  .slice(0, limit);
}

export async function getCatalogMetrics(sellerId: string, period: ResolvedPeriod): Promise<CatalogMetrics> {
 const { current, prior } = period;

 return safe(async () => {
  await ensureAnalyticsViews();
  const sql = sqlRows();

  const [invRows, activePrices, listedRows, soldPriceRows, bandListed, bandSold, brandListed, brandSold, catListed, catSold] = await Promise.all([
   sql`
    SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active,
     COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
     COUNT(*) FILTER (WHERE status = 'sold')::int AS sold,
     COALESCE(SUM(price_cents) FILTER (WHERE status = 'active'), 0)::bigint AS active_value_cents,
     COALESCE(AVG(price_cents) FILTER (WHERE status = 'active' AND price_cents > 0), 0)::float AS avg_active_cents
    FROM items WHERE seller_id = ${sellerId}::uuid
   `,
   sql`
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_cents)::float AS median_cents
    FROM items WHERE seller_id = ${sellerId}::uuid AND status = 'active' AND price_cents > 0
   `,
   sql`
    SELECT COUNT(*)::int AS n FROM items
    WHERE seller_id = ${sellerId}::uuid AND created_at >= ${current.startISO} AND created_at < ${current.endISO}
   `,
   sql`
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s.amount_cents)::float AS median_cents
    FROM vya_store_sales s
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
   `,
   // Price distribution across the LIVE catalog — "how much of my stock sits under $100".
   sql`
    SELECT width_bucket(price_cents, ${BAND_EDGES})::int AS band, COUNT(*)::int AS n
    FROM items WHERE seller_id = ${sellerId}::uuid AND status = 'active'
    GROUP BY 1
   `,
   // …and the same bands over what actually sold, so over/under-pricing shows up.
   sql`
    SELECT width_bucket(s.amount_cents, ${BAND_EDGES})::int AS band,
     COUNT(*)::int AS n, COALESCE(SUM(s.amount_cents), 0)::bigint AS revenue_cents
    FROM vya_store_sales s
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    GROUP BY 1
   `,
   sql`
    SELECT COALESCE(NULLIF(brand, ''), 'Unbranded') AS name, COUNT(*)::int AS n
    FROM items WHERE seller_id = ${sellerId}::uuid AND status = 'active' GROUP BY 1
   `,
   sql`
    SELECT COALESCE(NULLIF(i.brand, ''), 'Unbranded') AS name, COUNT(*)::int AS n,
     COALESCE(SUM(s.amount_cents), 0)::bigint AS revenue_cents
    FROM vya_store_sales s JOIN items i ON i.id = s.item_id
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    GROUP BY 1
   `,
   sql`
    SELECT COALESCE(NULLIF(category, ''), 'Other') AS name, COUNT(*)::int AS n
    FROM items WHERE seller_id = ${sellerId}::uuid AND status = 'active' GROUP BY 1
   `,
   sql`
    SELECT COALESCE(NULLIF(i.category, ''), 'Other') AS name, COUNT(*)::int AS n,
     COALESCE(SUM(s.amount_cents), 0)::bigint AS revenue_cents
    FROM vya_store_sales s JOIN items i ON i.id = s.item_id
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    GROUP BY 1
   `,
  ]);

  const inv = invRows[0] ?? {};
  const activeListings = int(inv.active);

  const [cur, pri] = await Promise.all([
   windowShape(sellerId, current, activeListings),
   prior ? windowShape(sellerId, prior, activeListings) : Promise.resolve(null),
  ]);

  // width_bucket returns 1..5 for our four thresholds; index straight into PRICE_BANDS.
  const listedByBand = new Map(bandListed.map((r) => [int(r.band), int(r.n)]));
  const soldByBand = new Map(bandSold.map((r) => [int(r.band), { n: int(r.n), revenueCents: int(r.revenue_cents) }]));
  const totalListedBanded = [...listedByBand.values()].reduce((a, b) => a + b, 0);
  const priceBands: PriceBand[] = PRICE_BANDS.map((b, i) => {
   const s = soldByBand.get(i + 1);
   const listed = listedByBand.get(i + 1) ?? 0;
   return { ...b, listed, listedPct: ratePct(listed, totalListedBanded), sold: s?.n ?? 0, revenueCents: s?.revenueCents ?? 0 };
  });

  const avgListedPriceCents = Math.round(Number(inv.avg_active_cents ?? 0)) || 0;
  const medianListed = activePrices[0]?.median_cents;
  const medianSold = soldPriceRows[0]?.median_cents;

  return {
   activeListings,
   draftListings: int(inv.draft),
   soldAllTime: int(inv.sold),
   inventoryValueCents: int(inv.active_value_cents),
   listedInPeriod: int(listedRows[0]?.n),
   soldInPeriod: cur.sold,
   avgListedPriceCents,
   medianListedPriceCents: medianListed == null ? 0 : Math.round(Number(medianListed)),
   avgSoldPriceCents: cur.avgSoldPriceCents,
   medianSoldPriceCents: medianSold == null ? 0 : Math.round(Number(medianSold)),
   realisationPct: avgListedPriceCents > 0 && cur.avgSoldPriceCents > 0 ? Math.round((cur.avgSoldPriceCents / avgListedPriceCents) * 1000) / 10 : null,
   sellThroughPct: cur.sellThroughPct,
   avgDaysToSell: cur.avgDaysToSell,
   medianDaysToSell: cur.medianDaysToSell,
   priceBands,
   topBrands: mergeMix(brandListed, brandSold, 8),
   topCategories: mergeMix(catListed, catSold, 8),
   vsPrior: pri ? {
    sellThroughPct: deltaPct(cur.sellThroughPct, pri.sellThroughPct),
    avgSoldPricePct: deltaPct(cur.avgSoldPriceCents, pri.avgSoldPriceCents),
    daysToSellPct: cur.medianDaysToSell != null && pri.medianDaysToSell != null ? deltaPct(cur.medianDaysToSell, pri.medianDaysToSell) : null,
   } : null,
  };
 }, EMPTY, "catalog");
}
