/**
 * Is the −31% bias a fixable systematic offset?
 *
 * Re-scores the ALREADY-GRADED rows in price_eval_items by multiplying each stored prediction by a
 * constant and recomputing the same metrics the eval reports. Nothing is re-priced, no API is called,
 * and NOTHING IS WRITTEN — this only reads the table and prints arithmetic.
 *
 * The question it answers: if every prediction were simply scaled up, how much of the miss rate goes
 * away? If a flat multiplier recovers most of it, the pricer is reading the market with a consistent
 * offset and the fix is a calibration constant. If it doesn't, the misses are noise in both directions
 * dressed up as a median, and scaling just moves items from "too low" to "too high".
 *
 * Grading rules are copied from eval-price.ts deliberately (the ±$5/±$10 tolerance floors and the
 * $15 answer-key minimum) so these numbers are comparable to what the eval prints.
 *
 * Run: npx tsx --env-file=.env.local scripts/rescore-bias.ts [mode] [multiplier]
 *   e.g. npx tsx --env-file=.env.local scripts/rescore-bias.ts title-ctx 1.45
 */
import { neon } from "@neondatabase/serverless";

const MODE = process.argv[2] || "title-ctx";
const M = Number(process.argv[3] || 1.45);
const WINDOW_DAYS = 120;

// ── from eval-price.ts — keep in step with it ──
const MIN_ANSWER_CENTS = 1500;
const TOL10_CENTS = 500;
const TOL20_CENTS = 1000;

type Row = { sold_id: number; brand: string | null; category: string | null; tier: string | null; sold_cents: number; pred_cents: number | null; low_cents: number | null; high_cents: number | null };

type Scored = { n: number; w10: number; w20: number; w10Pct: number; w20Pct: number; medErr: number | null; medSigned: number | null; meanSigned: number | null; over: number; under: number; inBandPct: number | null };

const median = (xs: number[]): number | null => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

/** Score a set of rows with every prediction (and its range) multiplied by `m`. */
function score(rows: Row[], m: number): Scored {
 const graded = rows.filter((r) => r.pred_cents != null && r.pred_cents > 0);
 const errs: number[] = [], signed: number[] = [];
 let w10 = 0, w20 = 0, over = 0, under = 0, banded = 0, inBand = 0;
 for (const r of graded) {
  const pred = (r.pred_cents as number) * m;
  const sold = r.sold_cents;
  const absErr = Math.abs(pred - sold);
  const errPct = (absErr / sold) * 100;
  const signedPct = ((pred - sold) / sold) * 100;
  errs.push(errPct); signed.push(signedPct);
  // The dollar floors matter here: ±20% of a $20 item is a ±$4 window, tighter than the market's
  // own noise, so a hit is "within the percentage OR within the dollars".
  if (errPct <= 10 || absErr <= TOL10_CENTS) w10++;
  if (errPct <= 20 || absErr <= TOL20_CENTS) w20++;
  if (signedPct > 0) over++; else if (signedPct < 0) under++;
  // The predicted RANGE scales with the midpoint — scoring a scaled point estimate against an
  // unscaled band would compare two different calibrations.
  if (r.low_cents != null && r.high_cents != null) {
   banded++;
   if (sold >= r.low_cents * m && sold <= r.high_cents * m) inBand++;
  }
 }
 const n = graded.length;
 return {
  n, w10, w20,
  w10Pct: n ? (w10 / n) * 100 : 0,
  w20Pct: n ? (w20 / n) * 100 : 0,
  medErr: median(errs), medSigned: median(signed),
  meanSigned: signed.length ? signed.reduce((s, v) => s + v, 0) / signed.length : null,
  over, under,
  inBandPct: banded ? (inBand / banded) * 100 : null,
 };
}

/** The multiplier that puts the MEDIAN prediction exactly on the sold price — the bias-zeroing scale. */
const biasZeroingM = (rows: Row[]): number | null =>
 median(rows.filter((r) => r.pred_cents && r.pred_cents > 0).map((r) => r.sold_cents / (r.pred_cents as number)));

/** The multiplier that maximises hits, found by sweep (ties → the smallest, i.e. least intervention). */
function bestM(rows: Row[], lo = 1, hi = 3, step = 0.01): { m: number; w20Pct: number } {
 let best = { m: 1, w20Pct: score(rows, 1).w20Pct };
 for (let m = lo; m <= hi + 1e-9; m += step) {
  const s = score(rows, m);
  if (s.w20Pct > best.w20Pct + 1e-9) best = { m: Number(m.toFixed(2)), w20Pct: s.w20Pct };
 }
 return best;
}

const pct = (v: number | null, d = 0) => (v == null ? "  — " : `${v.toFixed(d)}%`);
const line = (label: string, s: Scored) =>
 console.log(
  `  ${label.padEnd(22)} n=${String(s.n).padStart(3)}  w20=${pct(s.w20Pct).padStart(5)}  w10=${pct(s.w10Pct).padStart(5)}` +
  `  medErr=${pct(s.medErr).padStart(5)}  bias=${(s.medSigned == null ? "—" : `${s.medSigned >= 0 ? "+" : ""}${s.medSigned.toFixed(0)}%`).padStart(5)}` +
  `  low/high=${String(s.under).padStart(3)}/${String(s.over).padEnd(3)}  inBand=${pct(s.inBandPct).padStart(5)}`,
 );

async function main() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL is not set — run with `npx tsx --env-file=.env.local`.");
 const sql = neon(url);
 const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();

 const rows = (await sql`
  SELECT sold_id, brand, category, tier, sold_cents, pred_cents, low_cents, high_cents
  FROM price_eval_items
  WHERE mode = ${MODE} AND error_pct IS NOT NULL AND ran_at >= ${cutoff}
    AND sold_cents >= ${MIN_ANSWER_CENTS} AND pred_cents IS NOT NULL AND pred_cents > 0
 `) as Row[];

 if (!rows.length) { console.log(`no graded rows in mode "${MODE}"`); return; }

 console.log(`\nRE-SCORE  mode="${MODE}"  n=${rows.length}  (read-only: nothing written)\n`);
 console.log(`── whole sample ──`);
 line("baseline (×1.00)", score(rows, 1));
 line(`asked for (×${M.toFixed(2)})`, score(rows, M));

 const zero = biasZeroingM(rows);
 const best = bestM(rows);
 if (zero) line(`bias-zeroing (×${zero.toFixed(2)})`, score(rows, zero));
 line(`best hit-rate (×${best.m.toFixed(2)})`, score(rows, best.m));

 // ── where the multiplier helps and where it hurts ──
 // A hit-rate that moves 8 points can be 10 items fixed, or 25 fixed and 17 broken. Only the second
 // number tells you whether a flat offset is the right shape of fix.
 const graded = rows.filter((r) => r.pred_cents && r.pred_cents > 0);
 const isHit = (r: Row, m: number) => {
  const absErr = Math.abs((r.pred_cents as number) * m - r.sold_cents);
  return (absErr / r.sold_cents) * 100 <= 20 || absErr <= TOL20_CENTS;
 };
 const fixed = graded.filter((r) => !isHit(r, 1) && isHit(r, M)).length;
 const broken = graded.filter((r) => isHit(r, 1) && !isHit(r, M)).length;
 console.log(`\n── what ×${M.toFixed(2)} does item by item ──`);
 console.log(`  misses turned into hits: ${fixed}    hits turned into misses: ${broken}    net: ${fixed - broken >= 0 ? "+" : ""}${fixed - broken}`);

 // ── the segments that need opposite corrections ──
 // The −31% headline is a blend of two populations. If their bias-zeroing multipliers are far apart,
 // ONE constant cannot fix both: it over-corrects the good segment to rescue the bad one.
 const segs: Array<[string, Row[]]> = [
  ["brand resolved", rows.filter((r) => r.brand)],
  ["no brand", rows.filter((r) => !r.brand)],
 ];
 console.log(`\n── by segment ──`);
 for (const [name, list] of segs) {
  if (!list.length) continue;
  const z = biasZeroingM(list);
  console.log(`\n  [${name}]  own bias-zeroing multiplier: ×${z ? z.toFixed(2) : "—"}`);
  line("  baseline", score(list, 1));
  line(`  ×${M.toFixed(2)}`, score(list, M));
  if (z) line(`  ×${z.toFixed(2)} (its own)`, score(list, z));
 }

 // Per-tier, same question: a constant that suits $50 pieces may wreck $500 ones.
 console.log(`\n── by price tier (baseline → ×${M.toFixed(2)}) ──`);
 const tiers = [...new Set(rows.map((r) => r.tier || "—"))].sort();
 for (const t of tiers) {
  const list = rows.filter((r) => (r.tier || "—") === t);
  const z = biasZeroingM(list);
  const b = score(list, 1), a = score(list, M);
  console.log(`  ${t.padEnd(16)} n=${String(list.length).padStart(3)}  w20 ${pct(b.w20Pct).padStart(5)} → ${pct(a.w20Pct).padStart(5)}   bias ${pct(b.medSigned).padStart(6)} → ${pct(a.medSigned).padStart(6)}   own ×${z ? z.toFixed(2) : "—"}`);
 }

 // ── is the multiplier real, or fitted to this sample? ──
 // Fitting the constant on the same rows it is scored on flatters it. Split by sold_id parity
 // (deterministic, no RNG), fit on one half, score the other.
 const evens = graded.filter((r) => r.sold_id % 2 === 0);
 const odds = graded.filter((r) => r.sold_id % 2 === 1);
 console.log(`\n── held out (fit on one half, scored on the other) ──`);
 for (const [fitName, fit, test] of [["evens", evens, odds], ["odds", odds, evens]] as Array<[string, Row[], Row[]]>) {
  if (fit.length < 10 || test.length < 10) continue;
  const z = biasZeroingM(fit);
  if (!z) continue;
  const held = score(test, z);
  console.log(`  fit on ${fitName} (n=${fit.length}) → ×${z.toFixed(2)}   scored on the rest (n=${test.length}): w20 ${pct(score(test, 1).w20Pct)} → ${pct(held.w20Pct)}, bias ${pct(score(test, 1).medSigned)} → ${pct(held.medSigned)}`);
 }
 console.log();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
