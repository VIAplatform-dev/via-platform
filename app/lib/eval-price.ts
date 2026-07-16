import { neon } from "@neondatabase/serverless";
import { estimatePrice } from "./price-engine";
import { reverseImageBestOf, matchesToComps, isCompsConfigured } from "./comps";
import { normalizeCategory } from "./market-data-db";
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
   within10 BOOLEAN,
   within20 BOOLEAN,
   ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
 `.catch(() => {});
 await db()`CREATE INDEX IF NOT EXISTS idx_price_eval_ran ON price_eval_items (ran_at DESC)`.catch(() => {});
 // One graded reading per sold item — re-running refreshes it rather than double-counting.
 await db()`CREATE UNIQUE INDEX IF NOT EXISTS uq_price_eval_sold ON price_eval_items (sold_id)`.catch(() => {});
 ensured = true;
}

const tierOf = (cents: number): string => (cents < 7500 ? "budget (<$75)" : cents <= 30000 ? "mid ($75–300)" : "premium (>$300)");

export type PriceEvalItem = {
 soldId: number; brand: string | null; category: string; tier: string;
 soldCents: number; predCents: number | null; errorPct: number | null;
 within10: boolean | null; within20: boolean | null;
};

export type PriceEvalRun = { requested: number; graded: number; skipped: number; within10Pct: number | null; medianErrorPct: number | null };

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Grade a fresh sample of real sales. Blind: the pricer gets the photo + brand and must predict the
 * market value; we compare to the real sold price. Costs SerpApi (reverse-image + comps) per item,
 * so keep the sample small and run periodically — every run adds to the persisted, accumulating set.
 */
export async function runPriceEval(opts: { sample: number }): Promise<PriceEvalRun> {
 await ensureTable();
 const sample = Math.max(1, Math.min(40, Math.round(opts.sample) || 12));
 const sql = db();

 // Prefer sales we haven't graded yet (grow coverage), newest first; fall back to random re-grades.
 const rows = (await sql`
  SELECT s.id, s.title, s.designer, s.final_price, s.image
  FROM sold_items s
  LEFT JOIN price_eval_items p ON p.sold_id = s.id
  WHERE s.image IS NOT NULL AND s.image <> '' AND s.final_price > 0 AND p.id IS NULL
  ORDER BY s.sold_at DESC
  LIMIT ${sample}
 `.catch(() => [])) as any[];

 const g = gate("price-eval", 3);
 const graded = await Promise.all(rows.map((r) => g.run(async () => {
 const image = String(r.image || "");
 const brand = (r.designer || "").trim() || null;
 const title = String(r.title || "").trim();
 const soldCents = Math.round(Number(r.final_price) * 100);
 if (!image || soldCents <= 0) return null;
 try {
 // Reverse-image the sold photo → the same-piece comps production would use. One Lens call.
 const matches = isCompsConfigured() ? (await reverseImageBestOf([image], { maxFrames: 1 })).matches : [];
 const query = title || [brand, "vintage"].filter(Boolean).join(" ");
 // No condition passed → no condition multiplier skews the read (we don't know the sold item's grade).
 const est = await estimatePrice({
 query, photoUrl: image, minMarkupBps: 3000,
 extraComps: matchesToComps(matches),
 context: { brand },
 }).catch(() => null);
 const predCents = est?.marketCents && est.marketCents > 0 ? est.marketCents : null;
 const errorPct = predCents != null ? Math.round((Math.abs(predCents - soldCents) / soldCents) * 100) : null;
 const within10 = errorPct != null ? errorPct <= 10 : null;
 const within20 = errorPct != null ? errorPct <= 20 : null;
 const category = normalizeCategory(title) || "uncategorized";
 const tier = tierOf(soldCents);
 await sql`
  INSERT INTO price_eval_items (sold_id, brand, category, tier, sold_cents, pred_cents, error_pct, within10, within20, ran_at)
  VALUES (${r.id}, ${brand}, ${category}, ${tier}, ${soldCents}, ${predCents}, ${errorPct}, ${within10}, ${within20}, now())
  ON CONFLICT (sold_id) DO UPDATE SET
   pred_cents = EXCLUDED.pred_cents, error_pct = EXCLUDED.error_pct, within10 = EXCLUDED.within10,
   within20 = EXCLUDED.within20, brand = EXCLUDED.brand, category = EXCLUDED.category, tier = EXCLUDED.tier, ran_at = now()
 `.catch(() => {});
 return { predCents, errorPct };
 } catch { return null; }
 })));

 const ok = graded.filter((x): x is { predCents: number | null; errorPct: number | null } => !!x && x.errorPct != null);
 const errs = ok.map((x) => x.errorPct as number).sort((a, b) => a - b);
 const within10 = ok.filter((x) => (x.errorPct as number) <= 10).length;
 return {
 requested: rows.length,
 graded: ok.length,
 skipped: rows.length - ok.length,
 within10Pct: ok.length ? Math.round((within10 / ok.length) * 100) : null,
 medianErrorPct: errs.length ? errs[Math.floor(errs.length / 2)] : null,
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
 verdict: "pass" | "close" | "fail" | "insufficient"; // vs the 95%-within-10% bar
};

const MIN_N = 30; // below this, a segment is "insufficient data" — never a verdict on noise
const GATE = 0.95; // beta bar: 95% of items within ±10%

function scoreOf(segment: string, items: { within10: boolean | null; within20: boolean | null; errorPct: number | null }[]): PriceScore {
 const graded = items.filter((i) => i.errorPct != null);
 const n = graded.length;
 const w10 = graded.filter((i) => i.within10).length;
 const w20 = graded.filter((i) => i.within20).length;
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
 verdict,
 };
}

export type PriceAccuracy = { overall: PriceScore; byCategory: PriceScore[]; byTier: PriceScore[]; totalGraded: number; windowDays: number };

/** The accumulated price-accuracy picture across ALL graded sales in the window — overall + by
 *  category + by price tier, each with a 95% CI and a pass/fail verdict vs the ±10% beta bar. */
export async function getPriceAccuracy(windowDays = 120): Promise<PriceAccuracy> {
 await ensureTable();
 const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
 const rows = (await db()`
  SELECT category, tier, within10, within20, error_pct
  FROM price_eval_items WHERE ran_at >= ${cutoff} AND error_pct IS NOT NULL
 `.catch(() => [])) as { category: string | null; tier: string | null; within10: boolean | null; within20: boolean | null; error_pct: number | null }[];
 const items = rows.map((r) => ({ category: r.category || "uncategorized", tier: r.tier || "—", within10: r.within10, within20: r.within20, errorPct: r.error_pct }));

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
