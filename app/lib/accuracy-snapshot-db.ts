import { neon } from "@neondatabase/serverless";

// ─────────────────────────────────────────────────────────────────────────────
// Listing-accuracy metrics + daily snapshots. The metric is graded by SELLER EDITS:
// every AI-assisted intake stores the AI's guess, the seller's final value, and a
// per-field `accepted` map (training_examples). A field the seller KEPT = the AI got
// it right; one they CHANGED or the AI ABSTAINED on = a miss.
//
// computeListingAccuracyMetrics() is the ONE source of truth — the live admin endpoint
// and the daily snapshot both call it, so they can never drift. snapshotAccuracy() stores
// a rolling-30d + all-time reading each day so we can watch the number climb toward the
// 95% onboarding bar (the same gate price-eval uses), on a baseline that starts clean today.
// ─────────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export const ACCURACY_GATE = 95; // % — the factual-kept bar to clear before onboarding stores.

const pct = (kept: number, total: number) => (total > 0 ? Math.round((kept / total) * 1000) / 10 : null);
const field = (kept: number, filled: number, abstained: number) => {
 const guessed = filled - abstained;
 return {
  effectiveKeptPct: pct(kept, filled),
  precisionWhenGuessed: pct(kept, guessed),
  coveragePct: pct(guessed, filled),
  kept, changed: Math.max(0, guessed - kept), abstained, filled,
 };
};

export type ListingAccuracyMetrics = Awaited<ReturnType<typeof computeListingAccuracyMetrics>>;

/** The full listing-accuracy picture for a window (null = all-time), optionally AS OF a past date
 *  (for backfilling the historical trend). Pure SQL read — cheap, no API cost. */
export async function computeListingAccuracyMetrics(days: number | null, asOf?: Date) {
 const end = asOf ?? new Date();
 const endIso = end.toISOString();
 const cutoff = days != null ? new Date(end.getTime() - days * 86_400_000).toISOString() : "1970-01-01T00:00:00Z";
 const sql = db();
 const rows = (await sql`
  SELECT
   COUNT(*)::int AS listings,
   COUNT(*) FILTER (WHERE (accepted->>'brand') = 'true')::int AS brand_kept,
   COUNT(*) FILTER (WHERE brand IS NOT NULL AND brand <> '')::int AS brand_filled,
   COUNT(*) FILTER (WHERE (ai_brand IS NULL OR ai_brand = '') AND brand IS NOT NULL AND brand <> '')::int AS brand_abstained,
   COUNT(*) FILTER (WHERE (accepted->>'category') = 'true')::int AS category_kept,
   COUNT(*) FILTER (WHERE category IS NOT NULL AND category <> '')::int AS category_filled,
   COUNT(*) FILTER (WHERE (ai_category IS NULL OR ai_category = '') AND category IS NOT NULL AND category <> '')::int AS category_abstained,
   COUNT(*) FILTER (WHERE (accepted->>'material') = 'true')::int AS material_kept,
   COUNT(*) FILTER (WHERE material IS NOT NULL AND material <> '')::int AS material_filled,
   COUNT(*) FILTER (WHERE (ai_material IS NULL OR ai_material = '') AND material IS NOT NULL AND material <> '')::int AS material_abstained,
   COUNT(*) FILTER (WHERE (accepted->>'era') = 'true')::int AS era_kept,
   COUNT(*) FILTER (WHERE era IS NOT NULL AND era <> '')::int AS era_filled,
   COUNT(*) FILTER (WHERE (ai_era IS NULL OR ai_era = '') AND era IS NOT NULL AND era <> '')::int AS era_abstained,
   COUNT(*) FILTER (WHERE (accepted->>'title') = 'true')::int AS title_kept,
   COUNT(*) FILTER (WHERE ai_title IS NOT NULL AND ai_title <> '')::int AS title_total,
   COUNT(*) FILTER (WHERE (accepted->>'description') = 'true')::int AS description_kept,
   COUNT(*) FILTER (WHERE ai_description IS NOT NULL AND ai_description <> '')::int AS description_total,
   COUNT(*) FILTER (WHERE (accepted->>'condition') = 'true')::int AS condition_kept,
   COUNT(*) FILTER (WHERE ai_condition IS NOT NULL AND ai_condition <> '')::int AS condition_total,
   COUNT(*) FILTER (WHERE market_cents > 0 AND price_cents > 0)::int AS price_graded,
   COUNT(*) FILTER (WHERE market_cents > 0 AND price_cents > 0 AND abs(price_cents - market_cents)::float / market_cents <= 0.10)::int AS price_w10,
   COUNT(*) FILTER (WHERE market_cents > 0 AND price_cents > 0 AND abs(price_cents - market_cents)::float / market_cents <= 0.20)::int AS price_w20,
   percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(price_cents - market_cents)::float / NULLIF(market_cents, 0)) FILTER (WHERE market_cents > 0 AND price_cents > 0) AS price_median_delta
  FROM training_examples
  WHERE source = 'intake' AND created_at >= ${cutoff} AND created_at <= ${endIso}
 `) as Array<Record<string, number>>;
 const a = rows[0] || ({} as Record<string, number>);

 const factualKept = (a.brand_kept || 0) + (a.category_kept || 0) + (a.material_kept || 0) + (a.era_kept || 0);
 const factualFilled = (a.brand_filled || 0) + (a.category_filled || 0) + (a.material_filled || 0) + (a.era_filled || 0);
 const factualAbstained = (a.brand_abstained || 0) + (a.category_abstained || 0) + (a.material_abstained || 0) + (a.era_abstained || 0);

 return {
  window: days == null ? "all-time" : `last ${days} days`,
  totalAiListings: a.listings || 0,
  accuracy: {
   headlineKeptPct: pct(factualKept, factualFilled),
   kept: factualKept, filled: factualFilled, abstained: factualAbstained,
   abstentionRatePct: pct(factualAbstained, factualFilled),
   meetsGate: (pct(factualKept, factualFilled) ?? 0) >= ACCURACY_GATE,
   byField: {
    brand: field(a.brand_kept || 0, a.brand_filled || 0, a.brand_abstained || 0),
    category: field(a.category_kept || 0, a.category_filled || 0, a.category_abstained || 0),
    material: field(a.material_kept || 0, a.material_filled || 0, a.material_abstained || 0),
    era: field(a.era_kept || 0, a.era_filled || 0, a.era_abstained || 0),
   },
  },
  price: {
   graded: a.price_graded || 0,
   keptWithin10Pct: pct(a.price_w10 || 0, a.price_graded || 0),
   keptWithin20Pct: pct(a.price_w20 || 0, a.price_graded || 0),
   medianSellerDeltaPct: a.price_median_delta != null ? Math.round(Number(a.price_median_delta) * 1000) / 10 : null,
  },
  stylistic: {
   title: { kept: a.title_kept || 0, total: a.title_total || 0, keptPct: pct(a.title_kept || 0, a.title_total || 0) },
   description: { kept: a.description_kept || 0, total: a.description_total || 0, keptPct: pct(a.description_kept || 0, a.description_total || 0) },
  },
  sellerCompleted: {
   condition: { kept: a.condition_kept || 0, total: a.condition_total || 0, keptPct: pct(a.condition_kept || 0, a.condition_total || 0) },
  },
 };
}

let ensured = false;
async function ensure() {
 if (ensured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS accuracy_snapshots (
   snapshot_date DATE PRIMARY KEY,
   generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   payload JSONB NOT NULL
  )
 `.catch(() => {});
 ensured = true;
}

/** Take today's snapshot: rolling-30d (recent quality) + all-time. Idempotent per day (re-run refreshes).
 *  Cheap — pure SQL, no API cost — so it's safe to run daily. */
export async function snapshotAccuracy(): Promise<{ date: string; rolling30d: ListingAccuracyMetrics; allTime: ListingAccuracyMetrics }> {
 await ensure();
 const [rolling30d, allTime] = await Promise.all([computeListingAccuracyMetrics(30), computeListingAccuracyMetrics(null)]);
 const payload = { rolling30d, allTime };
 const rows = (await db()`
  INSERT INTO accuracy_snapshots (snapshot_date, generated_at, payload)
  VALUES (CURRENT_DATE, now(), ${JSON.stringify(payload)})
  ON CONFLICT (snapshot_date) DO UPDATE SET generated_at = now(), payload = EXCLUDED.payload
  RETURNING to_char(snapshot_date, 'YYYY-MM-DD') AS date
 `) as Array<{ date: string }>;
 return { date: rows[0]?.date ?? "", rolling30d, allTime };
}

/** Reconstruct the historical trend from timestamped training data: compute the metric AS OF each of
 *  the last `weeks` week-ending dates and upsert them as snapshots — so the chart shows where accuracy
 *  has ALREADY been (across every previous test/listing), without waiting for the daily cron. Idempotent. */
export async function backfillAccuracyTrend(weeks = 16): Promise<{ backfilled: number; from: string; to: string }> {
 await ensure();
 const n = Math.max(1, Math.min(52, Math.round(weeks)));
 const today = new Date();
 const dates: Date[] = [];
 for (let i = n; i >= 0; i--) dates.push(new Date(today.getTime() - i * 7 * 86_400_000));
 let backfilled = 0;
 for (const d of dates) {
  const [rolling30d, allTime] = await Promise.all([computeListingAccuracyMetrics(30, d), computeListingAccuracyMetrics(null, d)]);
  if (!allTime.totalAiListings) continue; // no listings existed yet as of this date — skip the empty point
  const iso = d.toISOString().slice(0, 10);
  await db()`
   INSERT INTO accuracy_snapshots (snapshot_date, generated_at, payload)
   VALUES (${iso}::date, now(), ${JSON.stringify({ rolling30d, allTime })})
   ON CONFLICT (snapshot_date) DO UPDATE SET generated_at = now(), payload = EXCLUDED.payload
  `.catch(() => {});
  backfilled++;
 }
 return { backfilled, from: dates[0].toISOString().slice(0, 10), to: dates[dates.length - 1].toISOString().slice(0, 10) };
}

export type AccuracyTrendPoint = {
 date: string;
 listings30d: number; listingsAll: number;
 factualKeptPct: number | null; factualKeptPctAll: number | null;
 brandPct: number | null; categoryPct: number | null; materialPct: number | null; eraPct: number | null;
 priceWithin10Pct: number | null; abstentionRatePct: number | null;
};

/** The accuracy trend over the last N days — one point per stored snapshot, headline numbers surfaced
 *  for a chart. rolling-30d is the "recent quality" line (watch this climb toward 95%); *All is all-time. */
export async function getAccuracyTrend(days = 90): Promise<{ gate: number; latest: AccuracyTrendPoint | null; deltaVsFirstPct: number | null; points: AccuracyTrendPoint[] }> {
 await ensure();
 const rows = (await db()`
  SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS date, payload
  FROM accuracy_snapshots
  WHERE snapshot_date >= CURRENT_DATE - (${days} || ' days')::interval
  ORDER BY snapshot_date ASC
 `.catch(() => [])) as Array<{ date: string; payload: { rolling30d?: ListingAccuracyMetrics; allTime?: ListingAccuracyMetrics } }>;

 const points: AccuracyTrendPoint[] = rows.map((r) => {
  const p = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
  const r30 = p?.rolling30d, all = p?.allTime;
  return {
   date: r.date,
   listings30d: r30?.totalAiListings ?? 0, listingsAll: all?.totalAiListings ?? 0,
   factualKeptPct: r30?.accuracy?.headlineKeptPct ?? null, factualKeptPctAll: all?.accuracy?.headlineKeptPct ?? null,
   brandPct: r30?.accuracy?.byField?.brand?.effectiveKeptPct ?? null,
   categoryPct: r30?.accuracy?.byField?.category?.effectiveKeptPct ?? null,
   materialPct: r30?.accuracy?.byField?.material?.effectiveKeptPct ?? null,
   eraPct: r30?.accuracy?.byField?.era?.effectiveKeptPct ?? null,
   priceWithin10Pct: r30?.price?.keptWithin10Pct ?? null,
   abstentionRatePct: r30?.accuracy?.abstentionRatePct ?? null,
  };
 });
 const withFactual = points.filter((p) => p.factualKeptPct != null);
 const first = withFactual[0]?.factualKeptPct ?? null;
 const latest = points[points.length - 1] ?? null;
 const deltaVsFirstPct = first != null && latest?.factualKeptPct != null ? Math.round((latest.factualKeptPct - first) * 10) / 10 : null;
 return { gate: ACCURACY_GATE, latest, deltaVsFirstPct, points };
}
