import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
async function main() {
 const split = await db()`
  SELECT (p.brand IS NULL OR p.brand = '') AS no_brand, COUNT(*)::int AS n,
   ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY p.signed_error_pct))::int AS med_signed,
   ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY p.error_pct))::int AS med_err,
   SUM(CASE WHEN p.within20 THEN 1 ELSE 0 END)::int AS w20
  FROM price_eval_items p
  WHERE p.mode='title-ctx' AND p.signed_error_pct IS NOT NULL
  GROUP BY no_brand` as any[];
 console.log("=== BRAND RECOGNISED vs NOT ===");
 for (const r of split) {
  console.log(`  ${r.no_brand ? "NO brand resolved " : "brand resolved   "} n=${String(r.n).padStart(3)}  within20 ${String(Math.round((r.w20/r.n)*100)).padStart(3)}%  median error ${String(r.med_err).padStart(3)}%  bias ${String(r.med_signed).padStart(5)}%`);
 }
 // is sold_at a real sale date, or just when we noticed?
 const dates = await db()`
  SELECT MIN(sold_at)::date AS oldest, MAX(sold_at)::date AS newest,
   COUNT(DISTINCT sold_at::date)::int AS distinct_days, COUNT(*)::int AS n
  FROM sold_items` as any[];
 console.log("\n=== sold_at spread across ALL sold_items ===");
 console.log(`  ${dates[0].oldest} → ${dates[0].newest}   distinct days: ${dates[0].distinct_days}   rows: ${dates[0].n}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
