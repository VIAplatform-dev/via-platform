import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
async function main() {
 const ops = await db()`
  SELECT provider, operation, COUNT(*)::int AS n, MIN(created_at)::date AS first, MAX(created_at)::date AS last
  FROM api_costs GROUP BY provider, operation ORDER BY n DESC LIMIT 20` as any[];
 console.log("=== every recorded API operation (real usage) ===");
 for (const o of ops) console.log(`  ${String(o.provider).padEnd(12)} ${String(o.operation).padEnd(24)} ${String(o.n).padStart(5)}   ${o.first} → ${o.last}`);

 for (const t of ["intake_predictions", "intake_memory_items", "intake_corrections", "intake_resolutions", "training_examples", "price_suggestions"]) {
  const r = await db()(`SELECT COUNT(*)::int AS n FROM ${t}`).catch(() => null) as any;
  console.log(`  table ${t.padEnd(22)} ${r ? r[0].n : "— (missing)"}`);
 }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
