/**
 * Does skipping the fourth price-recovery lookup cost accuracy?
 *
 * Re-grades the SAME items already graded under `title-ctx-v8` (all four cost reductions on), with
 * only the recovery gate disabled. One variable, identical items, properly paired — which the
 * earlier comparison was not: it graded a different sample and moved both segments in opposite
 * directions, the signature of sampling noise rather than a code effect.
 *
 * HARD BUDGET. SerpApi's own remaining-search count is read before starting and after every small
 * chunk, and the run stops the moment spend would approach the cap. This is a measurement, and a
 * measurement that overruns its budget is a bug.
 *
 * Run: VYA_RECOVERY_ENOUGH=999 npx tsx --env-file=.env.local scripts/ab-recovery-gate.ts [cap]
 */
import { neon } from "@neondatabase/serverless";
import { runPriceEval } from "../app/lib/eval-price.ts";

const BASE = "title-ctx-v8";   // gate ON  (what we just measured)
const NEW = "title-ctx-v9";    // gate OFF (the control)
const CAP = Math.max(1, Number(process.argv[2] || 95));
const CHUNK = 5;

async function searchesLeft(): Promise<number | null> {
 const r = await fetch(`https://serpapi.com/account?api_key=${encodeURIComponent(process.env.SERPAPI_API_KEY || "")}`).catch(() => null);
 const j = r && r.ok ? ((await r.json().catch(() => null)) as { total_searches_left?: number } | null) : null;
 return typeof j?.total_searches_left === "number" ? j.total_searches_left : null;
}

async function main() {
 if (process.env.VYA_RECOVERY_ENOUGH !== "999") {
  throw new Error("Run with VYA_RECOVERY_ENOUGH=999 — otherwise this re-measures the gate against itself.");
 }
 const sql = neon(process.env.DATABASE_URL!);
 const start = await searchesLeft();
 if (start == null) throw new Error("Could not read the SerpApi balance — refusing to run without a budget guard.");
 console.log(`budget: ${CAP} searches (SerpApi reports ${start} left)\n`);

 const rows = (await sql`
  SELECT sold_id FROM price_eval_items
  WHERE mode = ${BASE} AND error_pct IS NOT NULL ORDER BY sold_id
 `) as Array<{ sold_id: number }>;
 const ids = rows.map((r) => r.sold_id);
 console.log(`${ids.length} items graded under ${BASE} are available to re-grade\n`);

 let done = 0, spent = 0, worstPerItem = 4;
 for (let i = 0; i < ids.length; i += CHUNK) {
  // Project from the WORST chunk seen, not the running average. Projecting from the average
  // overran a 95-search cap by 6: the pace read 3.5/item across the first twenty items and the
  // next five cost 6 each. A budget guard that assumes the future looks like the average isn't a
  // guard.
  if (spent + worstPerItem * CHUNK > CAP) {
   console.log(`\nstopping at the budget: ${spent} spent, a further chunk would risk exceeding ${CAP}.`);
   break;
  }
  await runPriceEval({ sample: CHUNK, withContext: true, soldIds: ids.slice(i, i + CHUNK), modeLabel: NEW });
  done += Math.min(CHUNK, ids.length - i);
  const now = await searchesLeft();
  const before = spent;
  spent = now != null ? start - now : spent;
  const chunkRate = (spent - before) / Math.min(CHUNK, ids.length - i);
  worstPerItem = Math.max(worstPerItem, chunkRate);
  console.log(`  ${String(done).padStart(2)} items re-graded · ${spent} searches spent (${(spent / done).toFixed(1)}/item avg, worst chunk ${chunkRate.toFixed(1)}/item)`);
 }

 // Paired: only items graded BOTH ways count.
 const cmp = (await sql`
  SELECT count(*) n,
    count(*) FILTER (WHERE a.within20) gate_on,
    count(*) FILTER (WHERE b.within20) gate_off,
    count(*) FILTER (WHERE NOT a.within20 AND b.within20) recovered_by_the_extra_lookup,
    count(*) FILTER (WHERE a.within20 AND NOT b.within20) lost_by_it,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY a.error_pct) med_on,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY b.error_pct) med_off
  FROM price_eval_items a
  JOIN price_eval_items b ON b.sold_id = a.sold_id AND b.mode = ${NEW}
  WHERE a.mode = ${BASE} AND a.error_pct IS NOT NULL AND b.error_pct IS NOT NULL
 `) as Array<Record<string, unknown>>;
 const c = cmp[0];
 const n = Number(c.n);
 console.log(`\n── same ${n} items, gate ON vs OFF ──`);
 console.log(`  gate ON  (skip the 4th lookup): ${Math.round((100 * Number(c.gate_on)) / n)}% within ±20%, median error ${Math.round(Number(c.med_on))}%`);
 console.log(`  gate OFF (always look up):      ${Math.round((100 * Number(c.gate_off)) / n)}% within ±20%, median error ${Math.round(Number(c.med_off))}%`);
 console.log(`\n  items the extra lookup rescued: ${c.recovered_by_the_extra_lookup}`);
 console.log(`  items it made worse:           ${c.lost_by_it}`);
 console.log(`\ntotal spent: ${spent} of ${CAP}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e)); process.exit(1); });
