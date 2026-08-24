import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
async function main() {
 const r = await db()`
  SELECT
   CASE WHEN src IS NULL THEN 'A. old fixed band'
        WHEN high_cents::float / NULLIF(low_cents,0) > 2.2 THEN 'B. uncapped comp band'
        ELSE 'C. capped comp band' END AS variant,
   COUNT(*)::int AS n,
   COUNT(*) FILTER (WHERE in_band)::int AS hit,
   ROUND(AVG((high_cents - low_cents)::float / NULLIF(pred_cents,0) * 100))::int AS width,
   ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY error_pct))::int AS med_err
  FROM price_eval_items WHERE mode='title-ctx' AND in_band IS NOT NULL
  GROUP BY variant ORDER BY variant` as any[];
 for (const x of r) console.log(`${x.variant.padEnd(24)} n=${String(x.n).padStart(3)}  in-band ${String(Math.round((x.hit/x.n)*100)).padStart(3)}%  width ${String(x.width).padStart(4)}%  med err ${x.med_err}%`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
