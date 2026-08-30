import { sqlRows, safe, int, ratePct, meanCents } from "./core";
import { ensureAnalyticsViews } from "./views";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — listing quality vs outcome.
//
// The question every reseller actually asks: *what should I do differently to
// the next piece I list?* This compares a store's OWN listings that carry a
// signal against its own listings that don't — measurements present, photo
// count, brand filled in, size, condition, description length — and reports the
// difference in sell-through, days to sell and realised price.
//
// Two deliberate design choices:
//
//   WITHIN-STORE ONLY. Comparing across stores would mostly measure which
//   sellers are diligent, not which listings convert. Holding the store fixed
//   removes the biggest confound: same catalog, same audience, same pricing
//   instincts.
//
//   WHOLE CATALOG, NOT THE PERIOD. "Do measurements help?" is a structural
//   question about how this seller lists, not something that changes quarter to
//   quarter — and the answer needs every listing it can get for sample. The UI
//   labels this section as ignoring the date filter.
//
//   OBSERVABLE LISTINGS ONLY. A piece imported as already-sold never sat on a
//   VYA shelf, and imported batches have systematically different field
//   completeness from natively-listed ones. Including them produced confident,
//   backwards findings — one store's data said "noting the condition HURTS
//   sales" (z = -13.9) purely because one import batch arrived sold and without
//   condition set. So a sold piece only counts as evidence when it has a real
//   dwell time: sold_at present and later than created_at. Everything else is
//   dropped from both sides and reported as `excludedImports`.
//
// This is association, not proof: a seller who measures carefully probably also
// photographs carefully. The copy says so. What makes it actionable anyway is
// the opportunity count — how many LIVE listings are missing a signal that this
// store's own history says moves the needle.
// ───────────────────────────────────────────────────────────────────────────

/** Both sides of a comparison need this many listings before a verdict is offered. */
const MIN_SIDE = 20;
/** …and the catalog needs at least this many sales overall for any of it to mean anything. */
const MIN_SALES = 10;
/**
 * Two-sided 95% cutoff. A raw percentage gap is not a finding: with a 6%
 * sell-through, 20 listings produce about one sale, so "0% vs 6%" can be pure
 * chance. Every verdict has to clear a two-proportion z-test first, which is
 * what stops this tab from inventing advice out of small numbers.
 */
const Z_95 = 1.96;

export type Outcome = {
 items: number;
 sold: number;
 sellThroughPct: number;
 medianDaysToSell: number | null;
 avgSoldPriceCents: number;
};

export type Verdict = "helps" | "hurts" | "no-clear-effect" | "not-enough-data";

export type QualitySignal = {
 key: string;
 label: string;
 /** What the seller does about it, in their words. */
 action: string;
 withLabel: string;
 withoutLabel: string;
 with: Outcome;
 without: Outcome;
 /** Relative difference in sell-through, "with" against "without". */
 liftPct: number | null;
 /** Relative difference in median days to sell. Negative = sells faster. */
 daysDeltaPct: number | null;
 /** Relative difference in average sold price. */
 pricePct: number | null;
 verdict: Verdict;
 /** Test statistic behind the verdict; |z| ≥ 1.96 is the 95% bar. */
 z: number | null;
 /** Live listings missing this signal — the size of the opportunity. */
 activeMissing: number;
};

export type PhotoRung = {
 bucket: string;
 items: number;
 sold: number;
 sellThroughPct: number;
 /** Too few listings in this rung to read much into it — the UI greys it out. */
 sparse: boolean;
};

export type Completeness = { key: string; label: string; filled: number; total: number; pct: number };

export type QualityMetrics = {
 /** Listings considered: everything ever live or sold. Drafts are excluded. */
 /** Listings that could be judged: live now, or sold after real time on the shelf. */
 catalogSize: number;
 totalSold: number;
 /** Sold pieces left out because they arrived already sold — no shelf life to learn from. */
 excludedImports: number;
 enoughData: boolean;
 signals: QualitySignal[];
 photoLadder: PhotoRung[];
 completeness: Completeness[];
};

const EMPTY: QualityMetrics = { catalogSize: 0, totalSold: 0, excludedImports: 0, enoughData: false, signals: [], photoLadder: [], completeness: [] };

// key → how it reads on screen. Kept beside the SQL labels so the two can't drift.
const SIGNAL_COPY: Record<string, { label: string; action: string; withLabel: string; withoutLabel: string }> = {
 measurements: { label: "Measurements", action: "Add bust / waist / length to the listing", withLabel: "With measurements", withoutLabel: "Without" },
 photos: { label: "Four or more photos", action: "Shoot at least four angles", withLabel: "4+ photos", withoutLabel: "1–3 photos" },
 brand: { label: "Brand filled in", action: "Name the brand, even if it's unbranded vintage", withLabel: "Brand set", withoutLabel: "No brand" },
 size: { label: "Size filled in", action: "Set the size field, not just the title", withLabel: "Size set", withoutLabel: "No size" },
 condition: { label: "Condition noted", action: "State the condition honestly", withLabel: "Condition set", withoutLabel: "Not noted" },
 description: { label: "Fuller description", action: "Write 200+ characters — fabric, fit, flaws", withLabel: "200+ characters", withoutLabel: "Shorter" },
};

function outcomeOf(r: Record<string, unknown> | undefined): Outcome {
 const items = int(r?.items);
 const sold = int(r?.sold);
 return {
  items,
  sold,
  sellThroughPct: ratePct(sold, items),
  medianDaysToSell: r?.median_days == null ? null : Math.round(Number(r.median_days) * 10) / 10,
  avgSoldPriceCents: meanCents(int(r?.revenue_cents), sold),
 };
}

/** Relative change from `base` to `cur`, as a percentage, or null when the base is empty. */
function rel(cur: number | null, base: number | null): number | null {
 if (cur == null || base == null || !base) return null;
 return Math.round(((cur - base) / base) * 1000) / 10;
}

/**
 * Two-proportion z-test on sell-through. Null when either side is empty — there
 * is nothing to compare, which is a different answer from "no effect".
 */
function zScore(a: Outcome, b: Outcome): number | null {
 const n1 = a.items;
 const n2 = b.items;
 if (!n1 || !n2) return null;
 const pooled = (a.sold + b.sold) / (n1 + n2);
 if (pooled <= 0 || pooled >= 1) return null; // nothing sold either side, or everything did
 const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
 if (!se) return null;
 return (a.sold / n1 - b.sold / n2) / se;
}

function verdictFor(withIt: Outcome, without: Outcome, z: number | null, totalSold: number): Verdict {
 if (withIt.items < MIN_SIDE || without.items < MIN_SIDE || totalSold < MIN_SALES || z == null) return "not-enough-data";
 // Inside the band the two rates are not distinguishable from chance. Say so
 // rather than dressing a coin flip up as advice.
 if (Math.abs(z) < Z_95) return "no-clear-effect";
 return z > 0 ? "helps" : "hurts";
}

/** A rung this thin can't carry a conclusion; shown, but visibly de-emphasised. */
const SPARSE_RUNG = 30;

export async function getQualityMetrics(sellerId: string): Promise<QualityMetrics> {
 return safe(async () => {
  await ensureAnalyticsViews();
  const sql = sqlRows();

  // One materialised pass over the catalog; every branch below reads it once.
  // Drafts are excluded — a piece that was never live can't have failed to sell.
  const [signalRows, ladderRows, totals, activeRows] = await Promise.all([
   sql`
    WITH it AS MATERIALIZED (
     SELECT i.id, (i.status = 'sold') AS sold,
      (i.measurements IS NOT NULL AND i.measurements <> '') AS f_measurements,
      (CASE WHEN jsonb_typeof(i.images) = 'array' THEN jsonb_array_length(i.images) ELSE 0 END >= 4) AS f_photos,
      (i.brand IS NOT NULL AND i.brand <> '') AS f_brand,
      (i.size IS NOT NULL AND i.size <> '') AS f_size,
      (i.condition IS NOT NULL AND i.condition <> '') AS f_condition,
      (COALESCE(length(i.description), 0) >= 200) AS f_description,
      sale.amount_cents,
      CASE WHEN i.status = 'sold' THEN EXTRACT(EPOCH FROM (i.sold_at - i.created_at)) / 86400.0 END AS days_to_sell
     FROM items i
     LEFT JOIN LATERAL (
      SELECT amount_cents FROM vya_store_sales WHERE item_id = i.id ORDER BY sold_at DESC NULLS LAST LIMIT 1
     ) sale ON TRUE
     WHERE i.seller_id = ${sellerId}::uuid AND (i.status = 'active' OR (i.status = 'sold' AND i.sold_at IS NOT NULL AND i.created_at IS NOT NULL AND i.sold_at > i.created_at))
    ), agg AS (
     SELECT 'measurements' AS signal, f_measurements AS flag, * FROM it
     UNION ALL SELECT 'photos', f_photos, * FROM it
     UNION ALL SELECT 'brand', f_brand, * FROM it
     UNION ALL SELECT 'size', f_size, * FROM it
     UNION ALL SELECT 'condition', f_condition, * FROM it
     UNION ALL SELECT 'description', f_description, * FROM it
    )
    SELECT signal, flag,
     COUNT(*)::int AS items,
     COUNT(*) FILTER (WHERE sold)::int AS sold,
     COALESCE(SUM(amount_cents) FILTER (WHERE sold), 0)::bigint AS revenue_cents,
     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_sell)::float AS median_days
    FROM agg GROUP BY 1, 2
   `,
   sql`
    SELECT CASE WHEN p <= 1 THEN '1' WHEN p <= 3 THEN '2–3' WHEN p <= 5 THEN '4–5' WHEN p <= 7 THEN '6–7' ELSE '8+' END AS bucket,
     COUNT(*)::int AS items, COUNT(*) FILTER (WHERE status = 'sold')::int AS sold
    FROM (
     SELECT i.status, CASE WHEN jsonb_typeof(i.images) = 'array' THEN jsonb_array_length(i.images) ELSE 0 END AS p
     FROM items i WHERE i.seller_id = ${sellerId}::uuid AND (i.status = 'active' OR (i.status = 'sold' AND i.sold_at IS NOT NULL AND i.created_at IS NOT NULL AND i.sold_at > i.created_at))
    ) t GROUP BY 1
   `,
   sql`
    SELECT
     COUNT(*) FILTER (WHERE (i.status = 'active' OR (i.status = 'sold' AND i.sold_at IS NOT NULL AND i.created_at IS NOT NULL AND i.sold_at > i.created_at)))::int AS catalog,
     COUNT(*) FILTER (WHERE status = 'sold' AND (i.status = 'active' OR (i.status = 'sold' AND i.sold_at IS NOT NULL AND i.created_at IS NOT NULL AND i.sold_at > i.created_at)))::int AS sold,
     COUNT(*) FILTER (WHERE status = 'sold' AND NOT ((i.status = 'active' OR (i.status = 'sold' AND i.sold_at IS NOT NULL AND i.created_at IS NOT NULL AND i.sold_at > i.created_at))))::int AS excluded_imports
    FROM items i WHERE i.seller_id = ${sellerId}::uuid AND i.status IN ('active', 'sold')
   `,
   // What's still fixable: the LIVE listings missing each signal.
   sql`
    SELECT COUNT(*)::int AS active,
     COUNT(*) FILTER (WHERE measurements IS NULL OR measurements = '')::int AS no_measurements,
     COUNT(*) FILTER (WHERE CASE WHEN jsonb_typeof(images) = 'array' THEN jsonb_array_length(images) ELSE 0 END < 4)::int AS no_photos,
     COUNT(*) FILTER (WHERE brand IS NULL OR brand = '')::int AS no_brand,
     COUNT(*) FILTER (WHERE size IS NULL OR size = '')::int AS no_size,
     COUNT(*) FILTER (WHERE condition IS NULL OR condition = '')::int AS no_condition,
     COUNT(*) FILTER (WHERE COALESCE(length(description), 0) < 200)::int AS no_description
    FROM items WHERE seller_id = ${sellerId}::uuid AND status = 'active'
   `,
  ]);

  const catalogSize = int(totals[0]?.catalog);
  const totalSold = int(totals[0]?.sold);
  const active = activeRows[0] ?? {};
  const missing: Record<string, number> = {
   measurements: int(active.no_measurements), photos: int(active.no_photos), brand: int(active.no_brand),
   size: int(active.no_size), condition: int(active.no_condition), description: int(active.no_description),
  };

  const byKey = new Map<string, { yes?: Record<string, unknown>; no?: Record<string, unknown> }>();
  for (const r of signalRows) {
   const key = String(r.signal);
   const slot = byKey.get(key) ?? {};
   if (r.flag === true) slot.yes = r; else slot.no = r;
   byKey.set(key, slot);
  }

  const signals: QualitySignal[] = Object.keys(SIGNAL_COPY).map((key) => {
   const copy = SIGNAL_COPY[key];
   const withIt = outcomeOf(byKey.get(key)?.yes);
   const without = outcomeOf(byKey.get(key)?.no);
   const liftPct = rel(withIt.sellThroughPct, without.sellThroughPct);
   const z = zScore(withIt, without);
   return {
    key,
    label: copy.label,
    action: copy.action,
    withLabel: copy.withLabel,
    withoutLabel: copy.withoutLabel,
    with: withIt,
    without,
    liftPct,
    daysDeltaPct: rel(withIt.medianDaysToSell, without.medianDaysToSell),
    pricePct: rel(withIt.avgSoldPriceCents, without.avgSoldPriceCents),
    verdict: verdictFor(withIt, without, z, totalSold),
    z: z == null ? null : Math.round(z * 100) / 100,
    activeMissing: missing[key] ?? 0,
   };
  })
   // Strongest, best-evidenced findings first; unusable comparisons sink.
   .sort((a, b) => {
    const rank = (v: Verdict) => (v === "helps" ? 0 : v === "hurts" ? 1 : v === "no-clear-effect" ? 2 : 3);
    return rank(a.verdict) - rank(b.verdict) || Math.abs(b.liftPct ?? 0) - Math.abs(a.liftPct ?? 0);
   });

  const LADDER = ["1", "2–3", "4–5", "6–7", "8+"];
  const ladder = new Map(ladderRows.map((r) => [String(r.bucket), r]));
  const photoLadder: PhotoRung[] = LADDER.map((bucket) => {
   const r = ladder.get(bucket);
   const items = int(r?.items);
   const sold = int(r?.sold);
   return { bucket, items, sold, sellThroughPct: ratePct(sold, items), sparse: items < SPARSE_RUNG };
  });

  const activeTotal = int(active.active);
  const completeness: Completeness[] = Object.keys(SIGNAL_COPY).map((key) => ({
   key,
   label: SIGNAL_COPY[key].label,
   filled: activeTotal - (missing[key] ?? 0),
   total: activeTotal,
   pct: ratePct(activeTotal - (missing[key] ?? 0), activeTotal),
  }));

  return {
   catalogSize,
   totalSold,
   excludedImports: int(totals[0]?.excluded_imports),
   enoughData: catalogSize >= MIN_SIDE * 2 && totalSold >= MIN_SALES,
   signals,
   photoLadder,
   completeness,
  };
 }, EMPTY, "quality");
}
