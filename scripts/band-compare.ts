import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
async function main() {
 const r = await db()`
  SELECT (src IS NOT NULL) AS new_logic, COUNT(*)::int AS n,
   COUNT(*) FILTER (WHERE in_band)::int AS in_band,
   ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY error_pct))::int AS med_err,
   ROUND(AVG((high_cents - low_cents)::float / NULLIF(pred_cents,0) * 100))::int AS band_width_pct
  FROM price_eval_items
  WHERE mode='title-ctx' AND in_band IS NOT NULL
  GROUP BY new_logic ORDER BY new_logic` as any[];
 for (const x of r) {
  console.log(`${x.new_logic ? "NEW band " : "OLD band "} n=${String(x.n).padStart(3)}  in-band ${String(Math.round((x.in_band/x.n)*100)).padStart(3)}%  median error ${String(x.med_err).padStart(3)}%  avg band width ${x.band_width_pct}% of price`);
 }
 const src = await db()`
  SELECT src, COUNT(*)::int AS n, ROUND(AVG(comp_count))::int AS avg_comps
  FROM price_eval_items WHERE mode='title-ctx' AND src IS NOT NULL GROUP BY src ORDER BY n DESC` as any[];
 console.log("\nhow prices were reached:");
 for (const x of src) console.log(`  ${String(x.src).padEnd(12)} ${String(x.n).padStart(3)}  avg comps ${x.avg_comps}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
