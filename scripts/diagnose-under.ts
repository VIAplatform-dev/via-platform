import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
const usd = (c: any) => (c == null ? "–" : `$${Math.round(Number(c) / 100)}`);

async function main() {
 // 1. worst underpriced, with how OLD the sale is
 const worst = await db()`
  SELECT p.brand, p.sold_cents, p.pred_cents, p.signed_error_pct, s.title, s.sold_at,
         EXTRACT(YEAR FROM s.sold_at)::int AS yr
  FROM price_eval_items p JOIN sold_items s ON s.id = p.sold_id
  WHERE p.mode='title-ctx' AND p.signed_error_pct < -30
  ORDER BY p.signed_error_pct ASC LIMIT 12` as any[];
 console.log("=== WORST UNDERPRICED ===");
 console.log("sold     pred     signed  yr    brand / title");
 for (const r of worst) {
  console.log(`${usd(r.sold_cents).padEnd(9)}${usd(r.pred_cents).padEnd(9)}${String(r.signed_error_pct).padStart(5)}%  ${r.yr}  ${(r.brand||"—")} / ${String(r.title||"").slice(0,46)}`);
 }

 // 2. HOW OLD is the answer key overall?
 const age = await db()`
  SELECT EXTRACT(YEAR FROM s.sold_at)::int AS yr, COUNT(*)::int AS n,
         ROUND(AVG(p.signed_error_pct))::int AS avg_signed
  FROM price_eval_items p JOIN sold_items s ON s.id = p.sold_id
  WHERE p.mode='title-ctx' AND p.signed_error_pct IS NOT NULL
  GROUP BY yr ORDER BY yr` as any[];
 console.log("\n=== ANSWER-KEY AGE (does staleness explain it?) ===");
 for (const r of age) console.log(`  ${r.yr}   n=${String(r.n).padStart(3)}   avg bias ${String(r.avg_signed).padStart(5)}%`);

 // 3. are the COMPS themselves cheaper than what we sell?
 const brands = [...new Set(worst.map((r: any) => (r.brand||"").toLowerCase()).filter(Boolean))].slice(0, 6);
 console.log("\n=== COMP PRICES vs OUR SOLD PRICES, by brand ===");
 for (const b of brands) {
  const c = await db()`
   SELECT COUNT(*)::int AS n,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents))::int AS med,
    MIN(price_cents)::int AS lo, MAX(price_cents)::int AS hi
   FROM comp_cache WHERE lower(brand) = ${b} AND price_cents > 0` as any[];
  const s = await db()`
   SELECT COUNT(*)::int AS n,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY final_price*100))::int AS med
   FROM sold_items WHERE lower(designer) = ${b} AND final_price > 0` as any[];
  console.log(`  ${b.padEnd(18)} comps n=${String(c[0]?.n??0).padStart(4)} med ${usd(c[0]?.med).padEnd(8)} range ${usd(c[0]?.lo)}–${usd(c[0]?.hi)}   |   our sales n=${String(s[0]?.n??0).padStart(3)} med ${usd(s[0]?.med)}`);
 }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
