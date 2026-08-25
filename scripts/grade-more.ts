/**
 * Grow the graded sample, weighted towards the items that actually need it.
 *
 * The no-brand segment is the whole remaining opportunity and it rests on 51 items, which is why
 * it swings between 16% and 24% run to run. This grades fresh sales that never got a price, under
 * the CURRENT code's label, so the segment estimate tightens.
 *
 * Deliberately NOT graded under `title-ctx`: that label holds the pre-change baseline, and mixing
 * new rows graded with today's code into it would quietly destroy the "before" side of every
 * comparison in this repo.
 *
 * And it reports BY SEGMENT rather than as one number. Adding only no-brand items shifts the
 * overall figure by composition, not by accuracy — which is exactly the mistake that invalidated
 * an earlier run.
 *
 * Run: npx tsx --env-file=.env.local scripts/grade-more.ts [count] [mode-label]
 */
import { neon } from "@neondatabase/serverless";
import { runPriceEval } from "../app/lib/eval-price.ts";

const MODE = process.argv[3] || "title-ctx-v7";
const BATCH = 40;
const WANT = Math.max(1, Number(process.argv[2] || 100));

async function main() {
 const sql = neon(process.env.DATABASE_URL!);

 // Sales with no brand the pricer could lean on: no designer, or the Shopify feed defaulted it to
 // the store's own name. Same answer-key hygiene the eval applies ($15 floor, no blowouts).
 const rows = (await sql`
  SELECT s.id
  FROM sold_items s
  LEFT JOIN price_eval_items p ON p.sold_id = s.id AND p.mode = ${MODE}
  WHERE s.image IS NOT NULL AND s.image <> '' AND s.final_price > 0
    AND s.final_price * 100 >= 1500
    AND (s.original_price IS NULL OR s.original_price <= 0 OR s.final_price >= s.original_price * 0.5)
    AND p.id IS NULL
    AND NOT EXISTS (SELECT 1 FROM price_eval_items q WHERE q.sold_id = s.id AND q.mode LIKE 'title-ctx-v%')
    AND (s.designer IS NULL OR btrim(s.designer) = '' OR lower(btrim(s.designer)) = lower(btrim(s.store_name)))
  ORDER BY s.sold_at DESC
  LIMIT ${WANT}
 `) as Array<{ id: number }>;

 const ids = rows.map((r) => r.id);
 console.log(`grading ${ids.length} previously-ungraded sales under "${MODE}"\n`);
 let graded = 0, skipped = 0;
 for (let i = 0; i < ids.length; i += BATCH) {
  const chunk = ids.slice(i, i + BATCH);
  const run = await runPriceEval({ sample: chunk.length, withContext: true, soldIds: chunk, modeLabel: MODE });
  graded += run.graded; skipped += run.skipped;
  console.log(`  batch ${Math.floor(i / BATCH) + 1}: graded ${run.graded}, skipped ${run.skipped}`);
 }
 console.log(`\ntotal graded ${graded}, skipped ${skipped}`);

 const seg = (await sql`
  SELECT (brand IS NOT NULL) AS has_brand, count(*) n,
         round(100.0 * count(*) FILTER (WHERE within20) / count(*)) w20,
         round(100.0 * count(*) FILTER (WHERE within10) / count(*)) w10,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY error_pct) med_err,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY signed_error_pct) bias
  FROM price_eval_items WHERE mode = ${MODE} AND error_pct IS NOT NULL
  GROUP BY 1 ORDER BY 1
 `) as Array<Record<string, unknown>>;
 console.log(`\n── "${MODE}" now, by segment ──`);
 for (const r of seg) {
  console.log(`  ${(r.has_brand ? "brand resolved" : "no brand").padEnd(16)} n=${String(r.n).padStart(3)}  w20 ${r.w20}%  w10 ${r.w10}%  medErr ${Math.round(Number(r.med_err))}%  bias ${Math.round(Number(r.bias))}%`);
 }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
