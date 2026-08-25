/**
 * The real A/B: re-grade EVERY item in the title-ctx baseline under today's code.
 *
 * Differences from ab-cohesion.ts, which this replaces for this run:
 *  • all 120 baseline items, not a 40-item sample — the whole point is a number to trust
 *  • a FRESH label (title-ctx-v3), so the title-ctx-v2 rows from the cohesion A/B survive
 *  • batched, because runPriceEval hard-caps a single call at 40 items
 *
 * The baseline is never touched: results land under a different mode, and the comparison is
 * paired on sold_id so only items graded in BOTH sides count.
 *
 * Run preflight first. Run: npx tsx --env-file=.env.local scripts/ab-rerun.ts
 */
import { neon } from "@neondatabase/serverless";
import { runPriceEval, comparePriceAccuracy } from "../app/lib/eval-price.ts";

const BASE = "title-ctx";
const NEW = "title-ctx-v7"; // v6 = query fixes; v7 = + the unbranded anchor rebuilt on realized sales
const BATCH = 40; // runPriceEval's own per-call ceiling

async function main() {
 const sql = neon(process.env.DATABASE_URL!);

 const rows = (await sql`
  SELECT sold_id FROM price_eval_items
  WHERE mode = ${BASE} AND error_pct IS NOT NULL
  ORDER BY sold_id
 `) as Array<{ sold_id: number }>;
 const ids = rows.map((r) => r.sold_id);
 if (!ids.length) { console.log("no baseline rows"); return; }

 console.log(`re-grading all ${ids.length} baseline items under "${NEW}"\n`);
 let graded = 0, skipped = 0;
 for (let i = 0; i < ids.length; i += BATCH) {
  const chunk = ids.slice(i, i + BATCH);
  const run = await runPriceEval({ sample: chunk.length, withContext: true, soldIds: chunk, modeLabel: NEW });
  graded += run.graded; skipped += run.skipped;
  console.log(`  batch ${Math.floor(i / BATCH) + 1}: graded ${run.graded}, skipped ${run.skipped}`);
 }
 console.log(`\ntotal graded ${graded}, skipped ${skipped}`);

 const cmp = await comparePriceAccuracy(120, BASE, NEW);
 const p = cmp.paired;
 if (!p) { console.log("no paired subset"); return; }
 const line = (label: string, s: Record<string, unknown>) =>
  console.log(`  ${label.padEnd(8)} w20=${String(s.within20Pct).padStart(3)}%  w10=${String(s.within10Pct).padStart(3)}%  medErr=${String(s.medianErrorPct).padStart(3)}%  bias=${String(s.medianSignedPct).padStart(4)}%  inBand=${String(s.inBandPct).padStart(3)}%`);
 console.log(`\n── PAIRED (same ${p.n} items) ──`);
 line("BEFORE", p.a as unknown as Record<string, unknown>);
 line("AFTER", p.b as unknown as Record<string, unknown>);

 // Item by item — the honest read. A hit-rate that moves can be a real gain or a reshuffle.
 const detail = (await sql`
  SELECT a.sold_id, a.brand, a.sold_cents, a.pred_cents AS before_cents, b.pred_cents AS after_cents,
         a.error_pct AS before_err, b.error_pct AS after_err, a.within20 AS before_hit, b.within20 AS after_hit,
         a.src AS before_src, b.src AS after_src, a.comp_count AS before_comps, b.comp_count AS after_comps
  FROM price_eval_items a
  JOIN price_eval_items b ON b.sold_id = a.sold_id AND b.mode = ${NEW}
  WHERE a.mode = ${BASE} AND a.error_pct IS NOT NULL AND b.error_pct IS NOT NULL
 `) as Array<Record<string, number | string | boolean | null>>;

 let better = 0, worse = 0, same = 0, fixed = 0, broken = 0;
 for (const d of detail) {
  const bE = Number(d.before_err), aE = Number(d.after_err);
  if (aE < bE - 2) better++; else if (aE > bE + 2) worse++; else same++;
  if (!d.before_hit && d.after_hit) fixed++;
  if (d.before_hit && !d.after_hit) broken++;
 }
 console.log(`\n── item by item (n=${detail.length}) ──`);
 console.log(`  error improved: ${better}   worse: ${worse}   unchanged: ${same}`);
 console.log(`  misses→hits: ${fixed}   hits→misses: ${broken}   net: ${fixed - broken >= 0 ? "+" : ""}${fixed - broken}`);

 const seg = (name: string, list: typeof detail) => {
  if (!list.length) return;
  const hit = (k: "before_hit" | "after_hit") => Math.round((list.filter((d) => d[k]).length / list.length) * 100);
  const med = (k: "before_err" | "after_err") => [...list].map((d) => Number(d[k])).sort((x, y) => x - y)[Math.floor(list.length / 2)];
  console.log(`  ${name.padEnd(16)} n=${String(list.length).padStart(3)}  w20 ${hit("before_hit")}% → ${hit("after_hit")}%   medErr ${med("before_err")}% → ${med("after_err")}%`);
 };
 console.log(`\n── by segment ──`);
 seg("brand resolved", detail.filter((d) => d.brand));
 seg("no brand", detail.filter((d) => !d.brand));

 // How the answer was reached — if 'comps' didn't grow, the plumbing fixes aren't reaching the pricer.
 const tally = (k: "before_src" | "after_src") => {
  const m = new Map<string, number>();
  for (const d of detail) { const s = String(d[k] ?? "—"); m.set(s, (m.get(s) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}=${n}`).join("  ");
 };
 const meanComps = (k: "before_comps" | "after_comps") =>
  (detail.reduce((s, d) => s + Number(d[k] ?? 0), 0) / detail.length).toFixed(1);
 console.log(`\n── how the price was reached ──`);
 console.log(`  before: ${tally("before_src")}   mean comps ${meanComps("before_comps")}`);
 console.log(`  after:  ${tally("after_src")}   mean comps ${meanComps("after_comps")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
