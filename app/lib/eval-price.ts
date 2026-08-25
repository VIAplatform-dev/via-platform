import { neon } from "@neondatabase/serverless";
import { estimatePrice } from "./price-engine";
import { reverseImageBestOf, matchesToComps, isCompsConfigured, fetchResaleTrend } from "./comps";
import { researchComps, describeResearch } from "./comp-research.ts";
import { resolveSpecificPiece, getVisualVyaComps } from "./intake-memory-db";
import { embedImage, isEmbeddingConfigured } from "./embeddings";
import { normalizeCategory } from "./market-data-db";
import { inferItemFields, sanitizeStoredBrand } from "./infer-item-fields";
import { gate } from "./concurrency";

// ───────────────────────────────────────────────────────────────────────────
// Price accuracy — graded against REAL money.
//
// The only unimpeachable answer key for price is what an item ACTUALLY sold for.
// This runs the pricer BLIND on items VYA has already sold (photo + known brand)
// and compares the prediction to the real sold price. No manual labeling — reality
// is the truth. Leak-safe: the pricer never sees the sold price, and the dominant
// signal (reverse-image + external comps) is independent of our own sale record.
//
// Results are PERSISTED per item so the graded sample (and thus the confidence in
// the number) grows every run — the path to a trustworthy "% within ±10%".
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

// The prediction we grade is the engine's MARKET VALUE read (marketCents), not the
// store-adjusted suggestion — a store's own markup is a per-store pricing choice, not
// a question of whether the AI read the market right. That's the accuracy we care about.

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS price_eval_items (
   id SERIAL PRIMARY KEY,
   sold_id INTEGER NOT NULL,
   brand TEXT,
   category TEXT,
   tier TEXT,
   sold_cents INTEGER NOT NULL,
   pred_cents INTEGER,
   error_pct INTEGER,          -- |pred - sold| / sold, as a whole %
   signed_error_pct INTEGER,   -- (pred - sold) / sold: NEGATIVE = we priced it too low
   low_cents INTEGER,          -- the predicted RANGE, not just its midpoint
   high_cents INTEGER,
   in_band BOOLEAN,            -- did the realized price land inside that range?
   src TEXT,                   -- comps | benchmark | floor | knowledge — HOW the number was reached
   comp_count INTEGER,         -- how many comps survived to the valuation
   confidence REAL,
   within10 BOOLEAN,
   within20 BOOLEAN,
   ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
 `.catch(() => {});
 await db()`CREATE INDEX IF NOT EXISTS idx_price_eval_ran ON price_eval_items (ran_at DESC)`.catch(() => {});
 // Grading MODE: 'title' = the pricer is fed the item's real human title (easy mode); 'photo' = the
 // query is derived from the photo alone via the reference index (resolveSpecificPiece), mirroring a
 // real seller upload. specific_resolved records whether the reference index matched a piece at all.
 await db()`ALTER TABLE price_eval_items ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'title'`.catch(() => {});
 await db()`ALTER TABLE price_eval_items ADD COLUMN IF NOT EXISTS specific_resolved BOOLEAN`.catch(() => {});
 await db()`ALTER TABLE price_eval_items ADD COLUMN IF NOT EXISTS signed_error_pct INTEGER`.catch(() => {});
 await db()`ALTER TABLE price_eval_items ADD COLUMN IF NOT EXISTS low_cents INTEGER`.catch(() => {});
 await db()`ALTER TABLE price_eval_items ADD COLUMN IF NOT EXISTS high_cents INTEGER`.catch(() => {});
 await db()`ALTER TABLE price_eval_items ADD COLUMN IF NOT EXISTS in_band BOOLEAN`.catch(() => {});
 // Without these, a bad price is a mystery: a brand-average fallback and a well-comped answer look
 // identical in the results. Diagnosing the fourteen-identical-Dior-bags case took an hour and a
 // hand-written query; it should have been one column.
 await db()`ALTER TABLE price_eval_items ADD COLUMN IF NOT EXISTS src TEXT`.catch(() => {});
 await db()`ALTER TABLE price_eval_items ADD COLUMN IF NOT EXISTS comp_count INTEGER`.catch(() => {});
 await db()`ALTER TABLE price_eval_items ADD COLUMN IF NOT EXISTS confidence REAL`.catch(() => {});
 // Confirmed-sale flag lives on sold_items — ensure it exists so a `confirmedOnly` eval can filter on it.
 await db()`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false`.catch(() => {});
 // A sold item can be graded once PER MODE (title + photo coexist). Replace the old sold-only index.
 await db()`DROP INDEX IF EXISTS uq_price_eval_sold`.catch(() => {});
 await db()`CREATE UNIQUE INDEX IF NOT EXISTS uq_price_eval_sold_mode ON price_eval_items (sold_id, mode)`.catch(() => {});
 ensured = true;
}

const tierOf = (cents: number): string => (cents < 7500 ? "budget (<$75)" : cents <= 30000 ? "mid ($75–300)" : "premium (>$300)");

// ── Answer-key hygiene ──
// A sold price is only a usable "right answer" when it plausibly reflects the market. Two junk
// patterns dominate the cheap-item misses: $5–$12 clearance blowouts / feed-drop artifacts recorded
// as sales, and deep markdowns (sold at less than half the listed price). Grading against those
// punishes the pricer for refusing to call a Hanky Panky tank $10.
const MIN_ANSWER_CENTS = 1500; // below $15 a "sale" is clearance/sync noise, not a market price
const MAX_MARKDOWN = 0.5; // sold at <50% of its own original list price = a blowout, not the market
// Tolerance floor: ±20% of a $20 item is a ±$4 window — tighter than the market's own noise. A
// prediction within these absolute dollars counts as a hit regardless of the percentage.
const TOL10_CENTS = 500; // within ±10% OR ±$5
const TOL20_CENTS = 1000; // within ±20% OR ±$10
const hit = (errorPct: number | null, absErrCents: number | null, pctBar: number, floorCents: number): boolean | null =>
 errorPct == null ? null : errorPct <= pctBar || (absErrCents != null && absErrCents <= floorCents);

export type PriceEvalItem = {
 soldId: number; brand: string | null; category: string; tier: string;
 soldCents: number; predCents: number | null; errorPct: number | null;
 within10: boolean | null; within20: boolean | null;
};

export type PriceEvalRun = { requested: number; graded: number; skipped: number; within10Pct: number | null; medianErrorPct: number | null; mode: string; specificResolvedPct: number | null };

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Grade a fresh sample of real sales against the real sold price. Three modes:
 *  • default (title) — the pricer is handed the item's real title (easy mode: identification is free)
 *    but ONLY the brand as context — less than production intake gets.
 *  • withContext (title-ctx) — same query, but era/material/condition are inferred from the title
 *    (sold_items never stored them) and passed like production intake does. Graded separately per
 *    (sale, mode), so title vs title-ctx is a clean A/B on the same items: how much of the miss rate
 *    is the eval starving the engine of context vs the engine reading the market wrong.
 *  • photoOnly — the query is derived from the PHOTO alone via the reference index, no human title;
 *    this mirrors a real seller upload and is the honest test of "can VYA price from a photo?".
 * Costs SerpApi (reverse-image + comps) per item; keep the sample small. Accumulates per (sale, mode).
 */
export async function runPriceEval(opts: {
 sample: number;
 photoOnly?: boolean;
 withContext?: boolean;
 confirmedOnly?: boolean;
 /**
  * Grade THESE sales specifically, instead of the newest ungraded ones. The default selection
  * deliberately prefers items it hasn't seen (grow coverage), which is right for building the
  * dataset and wrong for an A/B: it hands you a different, easier slice of the catalogue and the
  * comparison measures the sample rather than the change.
  */
 soldIds?: number[];
 /**
  * Store the results under a different mode label while GRADING identically. Re-running the same
  * mode would overwrite the baseline rows (ON CONFLICT (sold_id, mode) DO UPDATE), destroying the
  * "before" side of the very comparison being run. A separate label keeps both and makes the pair
  * readable by comparePriceAccuracy.
  */
 modeLabel?: string;
}): Promise<PriceEvalRun> {
 await ensureTable();
 const sample = Math.max(1, Math.min(40, Math.round(opts.sample) || 12));
 // `behaviour` decides HOW an item is graded; `mode` is only the label it is stored under.
 const behaviour = opts.photoOnly ? "photo" : opts.withContext ? "title-ctx" : "title";
 const mode = opts.modeLabel || behaviour;
 const sql = db();

 // Prefer sales not yet graded IN THIS MODE (grow coverage), newest first. `confirmedOnly` grades
 // against ONLY real confirmed order prices (the receipts) — the truest answer key, once we have them.
 const rows = (await (opts.soldIds?.length
 ? sql`
  SELECT s.id, s.title, s.designer, s.store_name, s.final_price, s.image, s.embedding
  FROM sold_items s
  WHERE s.id = ANY(${opts.soldIds}::int[]) AND s.image IS NOT NULL AND s.image <> '' AND s.final_price > 0
  ORDER BY s.sold_at DESC
  LIMIT ${sample}
 `
 : opts.confirmedOnly
 ? sql`
  SELECT s.id, s.title, s.designer, s.store_name, s.final_price, s.image, s.embedding
  FROM sold_items s
  LEFT JOIN price_eval_items p ON p.sold_id = s.id AND p.mode = ${mode}
  WHERE s.image IS NOT NULL AND s.image <> '' AND s.final_price > 0 AND s.confirmed = true AND p.id IS NULL
   AND s.final_price * 100 >= ${MIN_ANSWER_CENTS}
   AND (s.original_price IS NULL OR s.original_price <= 0 OR s.final_price >= s.original_price * ${MAX_MARKDOWN})
  ORDER BY s.sold_at DESC
  LIMIT ${sample}
 `
 : sql`
  SELECT s.id, s.title, s.designer, s.store_name, s.final_price, s.image, s.embedding
  FROM sold_items s
  LEFT JOIN price_eval_items p ON p.sold_id = s.id AND p.mode = ${mode}
  WHERE s.image IS NOT NULL AND s.image <> '' AND s.final_price > 0 AND p.id IS NULL
   AND s.final_price * 100 >= ${MIN_ANSWER_CENTS}
   AND (s.original_price IS NULL OR s.original_price <= 0 OR s.final_price >= s.original_price * ${MAX_MARKDOWN})
  ORDER BY s.sold_at DESC
  LIMIT ${sample}
 `).catch(() => [])) as any[];

 const g = gate("price-eval", 3);
 const graded = await Promise.all(rows.map((r) => g.run(async () => {
 const image = String(r.image || "");
 const title = String(r.title || "").trim();
 // Shopify feeds default `vendor` to the STORE's own name, so `designer` often holds
 // "To Us Vintage" / "My Store" instead of the maker — and the pricer would search eBay for
 // the shop. Trust the column only when it survives the store-name guard; else infer from title.
 const brand = sanitizeStoredBrand(r.designer, { title, storeName: r.store_name });
 const soldCents = Math.round(Number(r.final_price) * 100);
 if (!image || soldCents <= 0) return null;
 try {
 // Reverse-image the sold photo → the same-piece comps production would use. One Lens call.
 const matches = isCompsConfigured() ? (await reverseImageBestOf([image], { maxFrames: 1 })).matches : [];
 // The query photo's fingerprint, for EVERY mode — not just photo-only. Without it the comp
 // researcher cannot image-verify anything, and the eval silently grades a thinner pipeline than
 // production runs: look-alikes never rejected, blocked listings never priced. That gap is the
 // reason an A/B of the intake fixes read as "no change".
 let emb: number[] = [];
 try { emb = Array.isArray(r.embedding) ? r.embedding : JSON.parse(r.embedding || "[]"); } catch { emb = []; }
 if ((!emb || !emb.length) && isEmbeddingConfigured()) emb = (await embedImage(image).catch(() => null)) || [];
 let query: string;
 let specificResolved: boolean | null = null;
 if (behaviour === "photo") {
 // Photo-only: identify the piece from the photo via the reference index — NO human title.
 // excludeNearIdentical stops the item matching a copy of itself in the index (cheating).
 const specific = emb && emb.length ? await resolveSpecificPiece(emb, brand, { excludeNearIdentical: true }).catch(() => null) : null;
 specificResolved = !!specific;
 query = specific?.query || brand || title; // fall back to brand (then title) when nothing matches
 } else {
 query = title || [brand, "vintage"].filter(Boolean).join(" ");
 }
 // Context: 'title'/'photo' pass ONLY the brand (the historical baseline). 'title-ctx' recovers
 // era/material/condition from the title via the same canonical inference production imports use —
 // sold_items never stored those columns — so the engine runs with production-shaped context. When
 // the title carries no condition, none is passed and no condition multiplier skews the read.
 const inferred = behaviour === "title-ctx" ? inferItemFields(title, title) : null;
 const context = inferred
 ? { brand: brand ?? inferred.brand, era: inferred.era, material: inferred.material, condition: inferred.condition, conditionGrade: inferred.condition }
 : { brand };
 // Same researcher production uses — verify same-piece by image, brand-filter only what the
 // image couldn't score, open the listings for their price, recover the blocked ones via search.
 const research = await researchComps(matches, { queryEmbedding: emb.length ? emb : null, brand });
 console.log(`[eval ${r.id}] comps: ${describeResearch(research)}`);
 // VYA's OWN visually-similar pieces — production's strongest comp source for an item whose brand
 // is unknown, and until now absent from every measurement. Leak-guarded: the item itself is
 // excluded, and so is any near-duplicate photo (that is the same physical piece re-listed, i.e.
 // the answer key, not a comparable).
 const visualComps = emb.length
  ? await getVisualVyaComps(emb, 8, { excludeSoldId: Number(r.id), excludeNearIdentical: true }).catch(() => [])
  : [];
 // Demand trend, the same signal production passes into the valuation. Gated so its worth can be
 // measured: it costs ~1 SerpApi call per brand+category per week and has never been shown to
 // change a single price. VYA_TREND_SIGNAL=false runs the pipeline without it.
 const evalCategory = normalizeCategory(title) || "";
 const trendQuery = brand && process.env.VYA_TREND_SIGNAL !== "false" ? (evalCategory ? `${brand} ${evalCategory}` : brand) : "";
 const trend = trendQuery ? await fetchResaleTrend(trendQuery).catch(() => null) : null;
 const est = await estimatePrice({ query, photoUrl: image, minMarkupBps: 3000, extraComps: [...matchesToComps(research.matches), ...visualComps], context: { ...context, trend: trend?.trending ? `${brand} has rising demand across the resale market (${trend.note})` : null }, excludeSoldId: Number(r.id), storeName: r.store_name }).catch(() => null);
 // REFUSE to grade a price the valuation model did not produce. When the model is unreachable the
 // pricer substitutes a raw comp median — a perfectly plausible-looking number that measures the
 // fallback, not the pricer. Two full runs were spent reporting exactly that as accuracy (once with
 // SERPAPI_ENABLED off, once with ANTHROPIC_API_KEY holding the literal string "[SENSITIVE]"), and
 // nothing downstream could tell: same shape, same src='comps'. A run that cannot measure the thing
 // it claims to measure must produce NO rows rather than misleading ones.
 if (est?.modelFallback) throw new Error("MODEL_FALLBACK: the valuation model did not answer — check ANTHROPIC_API_KEY (scripts/preflight.ts). Refusing to grade.");
 const predCents = est?.marketCents && est.marketCents > 0 ? est.marketCents : null;
 const absErr = predCents != null ? Math.abs(predCents - soldCents) : null;
 const errorPct = predCents != null ? Math.round(((absErr as number) / soldCents) * 100) : null;
 // Direction, not just magnitude: a $630 bag priced at $150 and a $30 dress priced at $90 are
 // both "off by ~50%" and need opposite fixes.
 const signedErrorPct = predCents != null ? Math.round(((predCents - soldCents) / soldCents) * 100) : null;
 // Band coverage: the honest question for one-of-one goods. A $600–$850 call on a piece that
 // fetches $700 is a correct call, and scoring only the midpoint marks it wrong.
 const lowCents = est?.lowCents ?? null;
 const highCents = est?.highCents ?? null;
 const inBand = lowCents != null && highCents != null ? soldCents >= lowCents && soldCents <= highCents : null;
 const src = est?.source ?? null;
 const compCount = est?.comps?.length ?? null;
 const confidence = est?.confidence ?? null;
 const within10 = hit(errorPct, absErr, 10, TOL10_CENTS);
 const within20 = hit(errorPct, absErr, 20, TOL20_CENTS);
 const category = normalizeCategory(title) || "uncategorized";
 const tier = tierOf(soldCents);
 await sql`
  INSERT INTO price_eval_items (sold_id, mode, brand, category, tier, sold_cents, pred_cents, error_pct, signed_error_pct, low_cents, high_cents, in_band, src, comp_count, confidence, within10, within20, specific_resolved, ran_at)
  VALUES (${r.id}, ${mode}, ${brand}, ${category}, ${tier}, ${soldCents}, ${predCents}, ${errorPct}, ${signedErrorPct}, ${lowCents}, ${highCents}, ${inBand}, ${src}, ${compCount}, ${confidence}, ${within10}, ${within20}, ${specificResolved}, now())
  ON CONFLICT (sold_id, mode) DO UPDATE SET
   pred_cents = EXCLUDED.pred_cents, error_pct = EXCLUDED.error_pct, signed_error_pct = EXCLUDED.signed_error_pct,
   low_cents = EXCLUDED.low_cents, high_cents = EXCLUDED.high_cents, in_band = EXCLUDED.in_band,
   src = EXCLUDED.src, comp_count = EXCLUDED.comp_count, confidence = EXCLUDED.confidence, within10 = EXCLUDED.within10,
   within20 = EXCLUDED.within20, brand = EXCLUDED.brand, category = EXCLUDED.category, tier = EXCLUDED.tier, specific_resolved = EXCLUDED.specific_resolved, ran_at = now()
 `.catch(() => {});
 return { predCents, errorPct, specificResolved };
 } catch { return null; }
 })));

 const ok = graded.filter((x): x is { predCents: number | null; errorPct: number | null; specificResolved: boolean | null } => !!x && x.errorPct != null);
 const errs = ok.map((x) => x.errorPct as number).sort((a, b) => a - b);
 const within10 = ok.filter((x) => (x.errorPct as number) <= 10).length;
 const resolved = ok.filter((x) => x.specificResolved).length;
 return {
 requested: rows.length,
 graded: ok.length,
 skipped: rows.length - ok.length,
 within10Pct: ok.length ? Math.round((within10 / ok.length) * 100) : null,
 medianErrorPct: errs.length ? errs[Math.floor(errs.length / 2)] : null,
 mode,
 specificResolvedPct: behaviour === "photo" && ok.length ? Math.round((resolved / ok.length) * 100) : null,
 };
}

// ── Wilson score interval — an honest 95% CI on a pass-rate, so a small sample reads as
// "88% (95% CI 74–95%, n=40)" and can't be mistaken for a settled number. ──
export function wilson95(successes: number, n: number): [number, number] | null {
 if (n <= 0) return null;
 const z = 1.96, p = successes / n;
 const denom = 1 + (z * z) / n;
 const centre = p + (z * z) / (2 * n);
 const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
 return [Math.max(0, (centre - margin) / denom), Math.min(1, (centre + margin) / denom)];
}

export type PriceScore = {
 segment: string;
 n: number;
 within10: number; within20: number;
 within10Pct: number | null; within20Pct: number | null;
 ci95: [number, number] | null; // CI on the within-10% rate
 medianErrorPct: number | null;
 // Direction of the miss. medianSignedPct < 0 = this segment reads LOW overall.
 medianSignedPct: number | null; overCount: number; underCount: number;
 // Share of sales that landed INSIDE the predicted range — the honest headline for one-of-one goods.
 inBandPct: number | null; inBandN: number;
 verdict: "pass" | "close" | "fail" | "insufficient"; // vs the 95%-within-10% bar
};

const MIN_N = 30; // below this, a segment is "insufficient data" — never a verdict on noise
const GATE = 0.95; // beta bar: 95% of items within ±10%

function scoreOf(segment: string, items: { within10: boolean | null; within20: boolean | null; errorPct: number | null; signedErrorPct?: number | null; inBand?: boolean | null }[]): PriceScore {
 const graded = items.filter((i) => i.errorPct != null);
 const n = graded.length;
 const w10 = graded.filter((i) => i.within10).length;
 const w20 = graded.filter((i) => i.within20).length;
 // Bias: a segment can sit at 30% because it is noisy both ways, or because it is consistently
 // one way — those need opposite fixes, and absolute error cannot tell them apart.
 const signed = graded.map((i) => i.signedErrorPct).filter((v): v is number => v != null).sort((a, b) => a - b);
 const overCount = signed.filter((v) => v > 0).length;
 const underCount = signed.filter((v) => v < 0).length;
 const banded = items.filter((i) => i.inBand != null);
 const inBandPct = banded.length ? Math.round((banded.filter((i) => i.inBand).length / banded.length) * 100) : null;
 const errs = graded.map((i) => i.errorPct as number).sort((a, b) => a - b);
 const ci = wilson95(w10, n);
 const rate = n ? w10 / n : null;
 // Verdict uses the LOWER CI bound vs the gate — we only "pass" when we're statistically confident
 // the true rate clears 95%, not just the point estimate. Honest, and it demands real sample size.
 const verdict: PriceScore["verdict"] = n < MIN_N ? "insufficient"
 : ci && ci[0] >= GATE ? "pass"
 : rate != null && rate >= GATE ? "close" // point estimate clears it but the CI doesn't yet — need more data
 : "fail";
 return {
 segment, n, within10: w10, within20: w20,
 within10Pct: n ? Math.round((w10 / n) * 100) : null,
 within20Pct: n ? Math.round((w20 / n) * 100) : null,
 ci95: ci, medianErrorPct: errs.length ? errs[Math.floor(errs.length / 2)] : null,
 medianSignedPct: signed.length ? signed[Math.floor(signed.length / 2)] : null, overCount, underCount,
 inBandPct, inBandN: banded.length,
 verdict,
 };
}

// The individual worst misses — joined back to the sold item so you can SEE the piece, what it
// really sold for, and what the AI predicted. This is where you diagnose WHY it's off (a category,
// a price tier, a kind of piece the comps don't cover).
export type PriceMiss = {
 soldId: number; brand: string | null; title: string | null; category: string; tier: string;
 soldUsd: number; predUsd: number | null; errorPct: number | null; image: string | null;
};
export async function getPriceMisses(limit = 20, windowDays = 120, mode = "title"): Promise<PriceMiss[]> {
 await ensureTable();
 const lim = Math.max(1, Math.min(100, Math.round(limit)));
 const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
 const rows = (await db()`
  SELECT p.sold_id, p.brand, p.category, p.tier, p.sold_cents, p.pred_cents, p.error_pct, s.title, s.image
  FROM price_eval_items p LEFT JOIN sold_items s ON s.id = p.sold_id
  WHERE p.ran_at >= ${cutoff} AND p.error_pct IS NOT NULL AND p.mode = ${mode}
   AND p.sold_cents >= ${MIN_ANSWER_CENTS}
   AND p.error_pct > 10 AND (p.pred_cents IS NULL OR abs(p.pred_cents - p.sold_cents) > ${TOL10_CENTS})
  ORDER BY p.error_pct DESC LIMIT ${lim}
 `.catch(() => [])) as { sold_id: number; brand: string | null; category: string | null; tier: string | null; sold_cents: number; pred_cents: number | null; error_pct: number | null; title: string | null; image: string | null }[];
 return rows.map((r) => ({
 soldId: Number(r.sold_id), brand: r.brand ?? null, title: r.title ?? null,
 category: r.category || "uncategorized", tier: r.tier || "—",
 soldUsd: Math.round(Number(r.sold_cents) / 100), predUsd: r.pred_cents != null ? Math.round(Number(r.pred_cents) / 100) : null,
 errorPct: r.error_pct != null ? Number(r.error_pct) : null, image: r.image ?? null,
 }));
}

export type PriceAccuracy = { overall: PriceScore; byCategory: PriceScore[]; byTier: PriceScore[]; totalGraded: number; windowDays: number };

/** The accumulated price-accuracy picture across ALL graded sales in the window — overall + by
 *  category + by price tier, each with a 95% CI and a pass/fail verdict vs the ±10% beta bar. */
export async function getPriceAccuracy(windowDays = 120, mode = "title"): Promise<PriceAccuracy> {
 await ensureTable();
 const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
 // Junk answers (below the minimum) are excluded even if graded before this policy existed, and
 // within10/within20 are recomputed with the dollar tolerance floor so old rows score consistently.
 const rows = (await db()`
  SELECT category, tier, sold_cents, pred_cents, error_pct, signed_error_pct, in_band
  FROM price_eval_items
  WHERE ran_at >= ${cutoff} AND error_pct IS NOT NULL AND mode = ${mode} AND sold_cents >= ${MIN_ANSWER_CENTS}
 `.catch(() => [])) as { category: string | null; tier: string | null; sold_cents: number; pred_cents: number | null; error_pct: number | null; signed_error_pct: number | null; in_band: boolean | null }[];
 const items = rows.map((r) => {
 const absErr = r.pred_cents != null ? Math.abs(Number(r.pred_cents) - Number(r.sold_cents)) : null;
 return { category: r.category || "uncategorized", tier: r.tier || "—", within10: hit(r.error_pct, absErr, 10, TOL10_CENTS), within20: hit(r.error_pct, absErr, 20, TOL20_CENTS), errorPct: r.error_pct, signedErrorPct: r.signed_error_pct, inBand: r.in_band };
 });

 const group = (key: "category" | "tier") => {
 const m = new Map<string, typeof items>();
 for (const it of items) { const k = it[key]; if (!m.has(k)) m.set(k, []); m.get(k)!.push(it); }
 return [...m.entries()].map(([seg, list]) => scoreOf(seg, list)).sort((a, b) => b.n - a.n);
 };

 return {
 overall: scoreOf("All sales", items),
 byCategory: group("category"),
 byTier: group("tier"),
 totalGraded: items.length,
 windowDays,
 };
}

export type PriceAccuracyComparison = {
 windowDays: number;
 modeA: string;
 modeB: string;
 overallA: PriceScore;
 overallB: PriceScore;
 /** Apples-to-apples: ONLY the sold items graded in BOTH modes — the honest read on what the extra context changed. */
 paired: { n: number; a: PriceScore; b: PriceScore } | null;
 byCategory: Array<{ segment: string; a: PriceScore | null; b: PriceScore | null; deltaWithin20Pct: number | null }>;
};

/** Side-by-side accuracy for two eval modes (default: brand-only 'title' vs production-context
 *  'title-ctx') — overall, the paired subset graded in both modes, and per-category with the
 *  within-±20% delta. This is the A/B that says how much of the miss rate was missing context. */
export async function comparePriceAccuracy(windowDays = 120, modeA = "title", modeB = "title-ctx"): Promise<PriceAccuracyComparison> {
 await ensureTable();
 const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
 const rows = (await db()`
  SELECT sold_id, mode, category, sold_cents, pred_cents, error_pct
  FROM price_eval_items
  WHERE ran_at >= ${cutoff} AND error_pct IS NOT NULL AND mode IN (${modeA}, ${modeB}) AND sold_cents >= ${MIN_ANSWER_CENTS}
 `.catch(() => [])) as { sold_id: number; mode: string; category: string | null; sold_cents: number; pred_cents: number | null; error_pct: number | null }[];

 type Item = { soldId: number; category: string; within10: boolean | null; within20: boolean | null; errorPct: number | null };
 const of = (mode: string): Item[] => rows.filter((r) => r.mode === mode).map((r) => {
 const absErr = r.pred_cents != null ? Math.abs(Number(r.pred_cents) - Number(r.sold_cents)) : null;
 return { soldId: Number(r.sold_id), category: r.category || "uncategorized", within10: hit(r.error_pct, absErr, 10, TOL10_CENTS), within20: hit(r.error_pct, absErr, 20, TOL20_CENTS), errorPct: r.error_pct };
 });
 const a = of(modeA), b = of(modeB);

 const inBoth = new Set([...new Set(a.map((i) => i.soldId))].filter((id) => b.some((i) => i.soldId === id)));
 const paired = inBoth.size
 ? { n: inBoth.size, a: scoreOf(modeA, a.filter((i) => inBoth.has(i.soldId))), b: scoreOf(modeB, b.filter((i) => inBoth.has(i.soldId))) }
 : null;

 const cats = [...new Set([...a, ...b].map((i) => i.category))];
 const byCategory = cats.map((cat) => {
 const ca = a.filter((i) => i.category === cat), cb = b.filter((i) => i.category === cat);
 const sa = ca.length ? scoreOf(cat, ca) : null, sb = cb.length ? scoreOf(cat, cb) : null;
 return {
  segment: cat,
  a: sa,
  b: sb,
  deltaWithin20Pct: sa?.within20Pct != null && sb?.within20Pct != null ? sb.within20Pct - sa.within20Pct : null,
 };
 }).sort((x, y) => (y.a?.n ?? 0) + (y.b?.n ?? 0) - ((x.a?.n ?? 0) + (x.b?.n ?? 0)));

 return { windowDays, modeA, modeB, overallA: scoreOf(modeA, a), overallB: scoreOf(modeB, b), paired, byCategory };
}


// ───────────────────────────────────────────────────────────────────────────
// The noise floor — what accuracy is even possible here.
//
// Every piece is one of one, so there is no single correct price: the same garment sells across a
// spread depending on the week, the photos, the store and the buyer. Grading against ONE realized
// sale therefore measures the market's own variance as well as the model's error, and no amount of
// engineering removes the first part.
//
// This measures that first part. Group the sales we already have by brand x category and ask: if an
// ORACLE predicted each group's median for every piece in it, how wrong would it still be? That is
// the best any pricer can do on this data, in the same units as the eval's medianErrorPct.
//
//   floor 30% + eval 46%  ->  ~16pts are ours to fix, and a +/-20% target is unreachable
//   floor 12% + eval 46%  ->  most of the error IS ours, and the target is fair
// ───────────────────────────────────────────────────────────────────────────

export type NoiseSegment = { segment: string; n: number; groups: number; medianDeviationPct: number; within20Pct: number };
export type NoiseFloor = {
 overall: NoiseSegment | null;
 byCategory: NoiseSegment[];
 note: string;
};

const MIN_GROUP = 2;

function floorOf(segment: string, groups: Map<string, number[]>): NoiseSegment | null {
 const devs: number[] = [];
 let used = 0;
 for (const prices of groups.values()) {
  if (prices.length < MIN_GROUP) continue;
  const sorted = [...prices].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  if (!med) continue;
  used++;
  for (const pr of prices) devs.push(Math.round((Math.abs(pr - med) / med) * 100));
 }
 if (!devs.length) return null;
 devs.sort((a, b) => a - b);
 return {
  segment, n: devs.length, groups: used,
  medianDeviationPct: devs[Math.floor(devs.length / 2)],
  within20Pct: Math.round((devs.filter((d) => d <= 20).length / devs.length) * 100),
 };
}

/** How much do comparable pieces vary in what they sell for? The ceiling on any pricer's accuracy. */
export async function getNoiseFloor(): Promise<NoiseFloor> {
 const rows = (await db()`
  SELECT designer, title, store_name, final_price FROM sold_items
  WHERE final_price > 0 AND designer IS NOT NULL AND designer <> ''
 `.catch(() => [])) as { designer: string; title: string; store_name: string | null; final_price: string }[];

 const all = new Map<string, number[]>();
 const byCat = new Map<string, Map<string, number[]>>();
 for (const r of rows) {
  const price = Number(r.final_price);
  // Same junk-answer floor the eval applies, so the ceiling and the score are measured on
  // comparable data rather than the floor being dragged down by clearance rows.
  if (!Number.isFinite(price) || price * 100 < MIN_ANSWER_CENTS) continue;
  // Trust a stored brand only where the eval would — a Shopify vendor field is often the shop.
  const brand = sanitizeStoredBrand(r.designer, { title: r.title, storeName: r.store_name }) || inferItemFields(r.title, r.title).brand;
  if (!brand) continue;
  const cat = normalizeCategory(r.title || "") || "uncategorized";
  const key = `${brand.trim().toLowerCase()}|${cat}`;
  if (!all.has(key)) all.set(key, []);
  all.get(key)!.push(price);
  if (!byCat.has(cat)) byCat.set(cat, new Map());
  const m = byCat.get(cat)!;
  if (!m.has(key)) m.set(key, []);
  m.get(key)!.push(price);
 }

 return {
  overall: floorOf("All", all),
  byCategory: [...byCat.entries()]
   .map(([cat, groups]) => floorOf(cat, groups))
   .filter((x): x is NoiseSegment => x != null)
   .sort((a, b) => b.n - a.n),
  note: "Deviation of each sale from the median of comparable sales (same brand x category). An oracle predicting the group median would still miss by this much — compare with the eval's medianErrorPct to see how much of the gap is actually ours.",
 };
}
