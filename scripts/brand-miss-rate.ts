import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
const q = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

async function main() {
 // 1. How often did the AI return NO brand, and did the seller then supply one?
 const p = await db()`
  SELECT COUNT(*)::int AS total,
   COUNT(*) FILTER (WHERE ai_value IS NULL OR ai_value = '')::int AS ai_blank,
   COUNT(*) FILTER (WHERE (ai_value IS NULL OR ai_value='') AND final_value IS NOT NULL AND final_value <> '')::int AS blank_then_filled,
   COUNT(*) FILTER (WHERE accepted)::int AS accepted
  FROM intake_predictions WHERE field = 'brand'` as any[];
 const r = p[0] || {};
 console.log("=== INTAKE: brand predictions (all time) ===");
 console.log(`  total brand predictions : ${r.total ?? 0}`);
 console.log(`  AI returned NO brand    : ${r.ai_blank ?? 0}  (${q(r.ai_blank, r.total)})`);
 console.log(`   ...seller then typed one: ${r.blank_then_filled ?? 0}`);
 console.log(`  seller accepted AI brand: ${r.accepted ?? 0}  (${q(r.accepted, r.total)})`);

 // 2. What actually got published — how many live items have no brand at all?
 const inv = await db()`
  SELECT COUNT(*)::int AS total,
   COUNT(*) FILTER (WHERE brand IS NULL OR btrim(brand) = '')::int AS no_brand
  FROM products` as any[];
 const i = inv[0] || {};
 console.log("\n=== PUBLISHED CATALOGUE ===");
 console.log(`  products: ${i.total ?? 0}   with NO brand: ${i.no_brand ?? 0}  (${q(i.no_brand, i.total)})`);

 // 3. Items that went through AI intake — did they end up with a brand?
 const mem = await db()`
  SELECT COUNT(*)::int AS total,
   COUNT(*) FILTER (WHERE brand IS NULL OR btrim(brand) = '')::int AS no_brand
  FROM intake_memory_items` as any[];
 const m = mem[0] || {};
 console.log(`  AI-intake items: ${m.total ?? 0}   with NO brand: ${m.no_brand ?? 0}  (${q(m.no_brand, m.total)})`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
