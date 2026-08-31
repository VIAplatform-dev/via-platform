import { sqlRows, safe, int, ratePct } from "./core";
import { ensureAnalyticsViews } from "./views";
import { deltaPct, type ResolvedPeriod, type Window } from "./period";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — engagement, traffic and attribution.
//
// The funnel (views → favourites → checkout starts → purchases) with the
// drop-off between every pair of steps, where visitors came from, and which of
// those sources actually produced revenue.
//
// Attribution note: one-of-one inventory makes item-level attribution exact in a
// way it never is for a normal shop. A piece sells once, so the last session
// that touched THAT piece before it sold is the session that sold it — no
// probabilistic splitting required. Channel comes from joining that session back
// to `store_visits`, which classified its entry source on arrival.
// ───────────────────────────────────────────────────────────────────────────

export type FunnelStep = {
 step: "view" | "favorite" | "checkout_start" | "purchase";
 label: string;
 count: number;
 /** Share of the step above — the drop-off read. */
 ofPreviousPct: number;
 /** Share of the top of the funnel. */
 ofTopPct: number;
};

export type ChannelRow = {
 channel: string;
 sessions: number;
 orders: number;
 revenueCents: number;
 convPct: number;
 aovCents: number;
};

export type EngagementMetrics = {
 sessions: number;
 pageviews: number;
 /** Sessions that saw exactly one page — they arrived and left without going deeper. */
 bounceRatePct: number;
 pagesPerSession: number;
 funnel: FunnelStep[];
 rates: {
  viewToFavoritePct: number;
  viewToCheckoutPct: number;
  checkoutToPurchasePct: number;
  sessionToOrderPct: number;
 };
 trafficByType: { type: string; sessions: number; sharePct: number }[];
 topSources: { source: string; type: string; sessions: number }[];
 topPages: { path: string; type: string; title: string | null; views: number; visitors: number }[];
 /** The first page of each session — what people actually land on. */
 landingPages: { path: string; title: string | null; sessions: number }[];
 /** Phone / tablet / desktop split. Only counts visits recorded since device capture shipped. */
 devices: { device: string; sessions: number; sharePct: number }[];
 /** Where shoppers are. Country first; cities are the drill-down. */
 countries: { country: string; sessions: number; sharePct: number }[];
 cities: { city: string; region: string | null; country: string | null; sessions: number }[];
 topSearches: { query: string; count: number }[];
 channels: ChannelRow[];
 /** Revenue on pieces a shopper met on the VYA marketplace before buying. */
 vyaAttributed: { orders: number; revenueCents: number; sharePct: number };
 totalRevenueCents: number;
 totalOrders: number;
 unattributedOrders: number;
 /**
  * Share of the period's sales that could be traced to a session at all. Low
  * coverage means the channel table below is a sample, not the whole story —
  * the UI should say so rather than let a seller read it as complete.
  */
 attributionCoveragePct: number;
 vsPrior: { sessionsPct: number | null; purchasesPct: number | null } | null;
};

const STEP_LABELS: Record<FunnelStep["step"], string> = {
 view: "Product views",
 favorite: "Favorites",
 checkout_start: "Checkout started",
 purchase: "Purchases",
};

const EMPTY: EngagementMetrics = {
 sessions: 0, pageviews: 0, bounceRatePct: 0, pagesPerSession: 0, funnel: [], 
 rates: { viewToFavoritePct: 0, viewToCheckoutPct: 0, checkoutToPurchasePct: 0, sessionToOrderPct: 0 },
 trafficByType: [], topSources: [], topPages: [], landingPages: [], devices: [], countries: [], cities: [], topSearches: [], channels: [],
 vyaAttributed: { orders: 0, revenueCents: 0, sharePct: 0 }, totalRevenueCents: 0, totalOrders: 0,
 unattributedOrders: 0, attributionCoveragePct: 0, vsPrior: null,
};

/** Raw event counts for a window, keyed by event type. */
async function funnelCounts(slug: string, w: Window): Promise<Record<string, number>> {
 const rows = (await sqlRows()`
  SELECT event_type, COUNT(*)::int AS n FROM vya_store_engagement
  WHERE store_slug = ${slug} AND ts >= ${w.startISO} AND ts < ${w.endISO}
  GROUP BY event_type
 `);
 return Object.fromEntries(rows.map((r) => [String(r.event_type), int(r.n)]));
}

async function sessionCount(slug: string, w: Window): Promise<number> {
 const rows = (await sqlRows()`
  SELECT COUNT(*)::int AS n FROM store_visits
  WHERE store_slug = ${slug} AND timestamp >= ${w.startISO} AND timestamp < ${w.endISO}
 `);
 return int(rows[0]?.n);
}

export async function getEngagementMetrics(sellerId: string, slug: string, period: ResolvedPeriod): Promise<EngagementMetrics> {
 const { current, prior } = period;

 return safe(async () => {
  await ensureAnalyticsViews();
  const sql = sqlRows();

  const [counts, priorCounts, sessions, priorSessions, pvRows, byTypeRows, topSourceRows, pageRows, landingRows, depthRows, deviceRows, countryRows, cityRows, searchRows, channelRows, vyaRows, totalRows] = await Promise.all([
   funnelCounts(slug, current).catch(() => ({} as Record<string, number>)),
   prior ? funnelCounts(slug, prior).catch(() => ({} as Record<string, number>)) : Promise.resolve(null),
   sessionCount(slug, current).catch(() => 0),
   prior ? sessionCount(slug, prior).catch(() => 0) : Promise.resolve(null),
   sql`
    SELECT COUNT(*)::int AS n FROM store_pageviews
    WHERE store_slug = ${slug} AND timestamp >= ${current.startISO} AND timestamp < ${current.endISO}
   `.catch(() => []),
   sql`
    SELECT source_type AS type, COUNT(*)::int AS sessions FROM store_visits
    WHERE store_slug = ${slug} AND timestamp >= ${current.startISO} AND timestamp < ${current.endISO}
    GROUP BY 1 ORDER BY 2 DESC
   `.catch(() => []),
   sql`
    SELECT source, source_type AS type, COUNT(*)::int AS sessions FROM store_visits
    WHERE store_slug = ${slug} AND timestamp >= ${current.startISO} AND timestamp < ${current.endISO}
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10
   `.catch(() => []),
   sql`
    SELECT path, page_type AS type, MAX(title) AS title,
     COUNT(*)::int AS views, COUNT(DISTINCT session_id)::int AS visitors
    FROM store_pageviews
    WHERE store_slug = ${slug} AND timestamp >= ${current.startISO} AND timestamp < ${current.endISO}
    GROUP BY 1, 2 ORDER BY 4 DESC LIMIT 12
   `.catch(() => []),
   // The first page of each session — where people actually enter the store.
   sql`
    WITH entry AS (
     SELECT DISTINCT ON (session_id) session_id, path, title
     FROM store_pageviews
     WHERE store_slug = ${slug} AND session_id IS NOT NULL
      AND timestamp >= ${current.startISO} AND timestamp < ${current.endISO}
     ORDER BY session_id, timestamp
    )
    SELECT path, MAX(title) AS title, COUNT(*)::int AS sessions
    FROM entry GROUP BY 1 ORDER BY 3 DESC LIMIT 10
   `.catch(() => []),
   // Depth per session: one page seen and gone is a bounce.
   sql`
    WITH per_session AS (
     SELECT session_id, COUNT(*)::int AS views FROM store_pageviews
     WHERE store_slug = ${slug} AND session_id IS NOT NULL
      AND timestamp >= ${current.startISO} AND timestamp < ${current.endISO}
     GROUP BY 1
    )
    SELECT COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE views = 1)::int AS bounced,
     COALESCE(AVG(views), 0)::float AS pages_per_session
    FROM per_session
   `.catch(() => []),
   sql`
    SELECT COALESCE(NULLIF(device_type, ''), 'unknown') AS device, COUNT(*)::int AS sessions
    FROM store_visits
    WHERE store_slug = ${slug} AND timestamp >= ${current.startISO} AND timestamp < ${current.endISO}
     AND device_type IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC
   `.catch(() => []),
   sql`
    SELECT country, COUNT(*)::int AS sessions FROM store_visits
    WHERE store_slug = ${slug} AND timestamp >= ${current.startISO} AND timestamp < ${current.endISO}
     AND country IS NOT NULL AND country <> ''
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
   `.catch(() => []),
   sql`
    SELECT city, MAX(region) AS region, MAX(country) AS country, COUNT(*)::int AS sessions
    FROM store_visits
    WHERE store_slug = ${slug} AND timestamp >= ${current.startISO} AND timestamp < ${current.endISO}
     AND city IS NOT NULL AND city <> ''
    GROUP BY 1 ORDER BY 4 DESC LIMIT 10
   `.catch(() => []),
   // What shoppers typed into the store's own search — demand the catalog may not answer yet.
   sql`
    SELECT lower(query) AS query, COUNT(*)::int AS n FROM store_searches
    WHERE store_slug = ${slug} AND created_at >= ${current.startISO} AND created_at < ${current.endISO}
    GROUP BY 1 ORDER BY n DESC LIMIT 10
   `.catch(() => []),
   // Last-touch channel per order (see the attribution note at the top of the file).
   sql`
    WITH ord AS (
     SELECT s.sale_id, s.item_id::text AS item_id, s.amount_cents, s.sold_at
     FROM vya_store_sales s
     WHERE s.seller_id = ${sellerId}::uuid
      AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    ), touched AS (
     SELECT ord.sale_id, ord.amount_cents, t.session_id
     FROM ord
     LEFT JOIN LATERAL (
      SELECT e.session_id FROM vya_store_engagement e
      WHERE e.item_id = ord.item_id AND e.session_id IS NOT NULL AND e.ts <= ord.sold_at
      ORDER BY e.ts DESC LIMIT 1
     ) t ON TRUE
    )
    SELECT COALESCE(sv.source_type, 'unattributed') AS channel,
     COUNT(*)::int AS orders,
     COALESCE(SUM(touched.amount_cents), 0)::bigint AS revenue_cents
    FROM touched
    LEFT JOIN LATERAL (
     SELECT source_type FROM store_visits WHERE session_id = touched.session_id LIMIT 1
    ) sv ON TRUE
    GROUP BY 1 ORDER BY revenue_cents DESC
   `.catch(() => []),
   sql`
    WITH ord AS (
     SELECT s.sale_id, s.item_id::text AS item_id, s.amount_cents, s.sold_at
     FROM vya_store_sales s
     WHERE s.seller_id = ${sellerId}::uuid
      AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
    )
    SELECT COUNT(*)::int AS orders, COALESCE(SUM(ord.amount_cents), 0)::bigint AS revenue_cents
    FROM ord
    WHERE EXISTS (
     SELECT 1 FROM vya_store_engagement e
     WHERE e.item_id = ord.item_id AND e.surface = 'marketplace' AND e.ts <= ord.sold_at
    )
   `.catch(() => []),
   sql`
    SELECT COALESCE(SUM(s.amount_cents), 0)::bigint AS revenue_cents, COUNT(*)::int AS orders
    FROM vya_store_sales s
    WHERE s.seller_id = ${sellerId}::uuid
     AND s.sold_at >= ${current.startISO} AND s.sold_at < ${current.endISO}
   `,
  ]);

  // The purchase step comes from the sales ledger, not from the event stream: a
  // webhook can miss and a hand-marked sale never fires one, but a sold piece is
  // money. Events supply the top of the funnel, the ledger supplies the bottom.
  const totalRevenueCents = int(totalRows[0]?.revenue_cents);
  const purchases = int(totalRows[0]?.orders);
  const attributedOrders = channelRows
   .filter((r) => String(r.channel) !== "unattributed")
   .reduce((acc, r) => acc + int(r.orders), 0);

  const raw: Array<[FunnelStep["step"], number]> = [
   ["view", counts.view ?? 0],
   ["favorite", counts.favorite ?? 0],
   ["checkout_start", counts.checkout_start ?? 0],
   ["purchase", purchases || (counts.purchase ?? 0)],
  ];
  const top = raw[0][1];
  const funnel: FunnelStep[] = raw.map(([step, count], i) => ({
   step,
   label: STEP_LABELS[step],
   count,
   ofPreviousPct: i === 0 ? 100 : ratePct(count, raw[i - 1][1]),
   ofTopPct: ratePct(count, top),
  }));

  const trafficTotal = byTypeRows.reduce((s, r) => s + int(r.sessions), 0);
  const vya = vyaRows[0] ?? {};
  const vyaRevenue = int(vya.revenue_cents);

  const channels: ChannelRow[] = channelRows.filter((r) => String(r.channel) !== "unattributed").map((r) => {
   const orders = int(r.orders);
   const revenueCents = int(r.revenue_cents);
   const channel = String(r.channel);
   const sessionsFor = int(byTypeRows.find((t) => String(t.type) === channel)?.sessions);
   return {
    channel,
    sessions: sessionsFor,
    orders,
    revenueCents,
    convPct: ratePct(orders, sessionsFor),
    aovCents: orders ? Math.round(revenueCents / orders) : 0,
   };
  });

  return {
   sessions,
   pageviews: int(pvRows[0]?.n),
   bounceRatePct: ratePct(int(depthRows[0]?.bounced), int(depthRows[0]?.sessions)),
   pagesPerSession: Math.round(Number(depthRows[0]?.pages_per_session ?? 0) * 100) / 100,
   funnel,
   rates: {
    viewToFavoritePct: ratePct(counts.favorite ?? 0, counts.view ?? 0),
    viewToCheckoutPct: ratePct(counts.checkout_start ?? 0, counts.view ?? 0),
    checkoutToPurchasePct: ratePct(raw[3][1], counts.checkout_start ?? 0),
    sessionToOrderPct: ratePct(raw[3][1], sessions),
   },
   trafficByType: byTypeRows.map((r) => ({ type: String(r.type), sessions: int(r.sessions), sharePct: ratePct(int(r.sessions), trafficTotal) })),
   topSources: topSourceRows.map((r) => ({ source: String(r.source), type: String(r.type), sessions: int(r.sessions) })),
   topPages: pageRows.map((r) => ({ path: String(r.path), type: String(r.type), title: r.title ? String(r.title) : null, views: int(r.views), visitors: int(r.visitors) })),
   landingPages: landingRows.map((r) => ({ path: String(r.path), title: r.title ? String(r.title) : null, sessions: int(r.sessions) })),
   devices: (() => {
    const total = deviceRows.reduce((a, r) => a + int(r.sessions), 0);
    return deviceRows.map((r) => ({ device: String(r.device), sessions: int(r.sessions), sharePct: ratePct(int(r.sessions), total) }));
   })(),
   countries: (() => {
    const total = countryRows.reduce((a, r) => a + int(r.sessions), 0);
    return countryRows.map((r) => ({ country: String(r.country), sessions: int(r.sessions), sharePct: ratePct(int(r.sessions), total) }));
   })(),
   cities: cityRows.map((r) => ({ city: String(r.city), region: r.region ? String(r.region) : null, country: r.country ? String(r.country) : null, sessions: int(r.sessions) })),
   topSearches: searchRows.map((r) => ({ query: String(r.query), count: int(r.n) })),
   channels,
   vyaAttributed: { orders: int(vya.orders), revenueCents: vyaRevenue, sharePct: ratePct(vyaRevenue, totalRevenueCents) },
   totalRevenueCents,
   totalOrders: purchases,
   unattributedOrders: int(channelRows.find((r) => String(r.channel) === "unattributed")?.orders),
   attributionCoveragePct: ratePct(attributedOrders, purchases),
   vsPrior: priorCounts && priorSessions != null ? {
    sessionsPct: deltaPct(sessions, priorSessions),
    purchasesPct: deltaPct(raw[3][1], priorCounts.purchase ?? 0),
   } : null,
  };
 }, EMPTY, "engagement");
}
