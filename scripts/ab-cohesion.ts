/**
 * Controlled A/B for the comp-selection change.
 *
 * Re-grades the SAME sales that were already graded under `title-ctx` (the baseline, produced before
 * comp-cohesion existed) and stores the results under `title-ctx-v2`. Same items, same brands, same
 * difficulty — the only thing that differs is the filtering. Nothing about the baseline is touched.
 *
 * The first attempt at this comparison used the eval's default selection, which prefers items it
 * hasn't graded yet. That handed back a sample with a median value of $860 and only 5% missing a
 * brand, against a baseline at $185 and 43% missing — and brand-unknown items are biased -60%. The
 * "improvement" was largely the sample. Hence: same ids, explicitly.
 *
 * Run: npx tsx --env-file=<env> scripts/ab-cohesion.ts [n]
 */
import { neon } from "@neondatabase/serverless";
import { runPriceEval, comparePriceAccuracy } from "../app/lib/eval-price.ts";

const N = Math.min(40, Number(process.argv[2] || 40));
const BASE = "title-ctx";
const NEW = "title-ctx-v2";

async function main() {
 const sql = neon(process.env.DATABASE_URL!);

 // The baseline rows, EXCLUDING anything graded in the last few hours — those were the confounded
 // run, and including them would compare the new code against itself.
 const rows = (await sql`
  SELECT sold_id FROM price_eval_items
  WHERE mode = ${BASE} AND error_pct IS NOT NULL
    AND ran_at < now() - interval '3 hours'
  ORDER BY random()
  LIMIT ${N}
 `) as Array<{ sold_id: number }>;

 const ids = rows.map((r) => r.sold_id);
 if (!ids.length) { console.log("no baseline rows to re-grade"); return; }
 console.log(`re-grading ${ids.length} of the ORIGINAL baseline items under "${NEW}"\n`);

 const run = await runPriceEval({ sample: ids.length, withContext: true, soldIds: ids, modeLabel: NEW });
 console.log("run:", JSON.stringify({ requested: run.requested, graded: run.graded, skipped: run.skipped }));

 // Paired comparison — only the sales graded in BOTH modes count.
 const cmp = await comparePriceAccuracy(120, BASE, NEW);
 const p = cmp.paired;
 console.log(`\n── PAIRED (same ${p?.n ?? 0} items, before vs after) ──`);
 if (!p) { console.log("  no paired subset"); return; }
 const line = (label: string, s: Record<string, unknown>) =>
  console.log(`  ${label.padEnd(14)} w20=${String(s.within20Pct).padStart(3)}%  w10=${String(s.within10Pct).padStart(3)}%  medErr=${String(s.medianErrorPct).padStart(3)}%  bias=${String(s.medianSignedPct).padStart(4)}%`);
 line("BEFORE", p.a as unknown as Record<string, unknown>);
 line("AFTER", p.b as unknown as Record<string, unknown>);

 // Per-item detail, so a big average move can be checked for being real rather than a few outliers.
 const detail = (await sql`
  SELECT a.sold_id, a.brand, a.category, a.sold_cents,
         a.pred_cents AS before_cents, b.pred_cents AS after_cents,
         a.error_pct AS before_err, b.error_pct AS after_err
  FROM price_eval_items a
  JOIN price_eval_items b ON b.sold_id = a.sold_id AND b.mode = ${NEW}
  WHERE a.mode = ${BASE} AND a.error_pct IS NOT NULL AND b.error_pct IS NOT NULL
 `) as Array<Record<string, number | string | null>>;

 let better = 0, worse = 0, same = 0;
 for (const d of detail) {
  const bE = Number(d.before_err), aE = Number(d.after_err);
  if (aE < bE - 2) better++; else if (aE > bE + 2) worse++; else same++;
 }
 console.log(`\n── item by item ──`);
 console.log(`  improved: ${better}   worse: ${worse}   unchanged: ${same}   (of ${detail.length})`);
 const noBrand = detail.filter((d) => !d.brand);
 if (noBrand.length) {
  const bAvg = noBrand.reduce((s, d) => s + Number(d.before_err), 0) / noBrand.length;
  const aAvg = noBrand.reduce((s, d) => s + Number(d.after_err), 0) / noBrand.length;
  console.log(`  of which no-brand: ${noBrand.length} — mean error ${bAvg.toFixed(0)}% → ${aAvg.toFixed(0)}%`);
 }
}

main().catch((e) => { console.error(e); process.exit(1); });
