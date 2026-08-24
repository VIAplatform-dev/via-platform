import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
async function main() {
 const calls = await db()`
  SELECT operation, COUNT(*)::int AS n FROM api_costs
  WHERE provider = 'serpapi' AND created_at >= NOW() - INTERVAL '90 minutes'
  GROUP BY operation ORDER BY n DESC` as any[];
 console.log("SerpApi calls in the last 90 min (the eval run):");
 console.log(calls.length ? calls.map((c: any) => `  ${c.operation.padEnd(18)} ${c.n}`).join("\n") : "  NONE");
 const graded = await db()`
  SELECT COUNT(*)::int AS n FROM price_eval_items
  WHERE mode='title-ctx' AND ran_at >= NOW() - INTERVAL '90 minutes'` as any[];
 console.log(`\nitems graded in that window: ${graded[0]?.n ?? 0}`);
 const cached = await db()`SELECT COUNT(*)::int AS n FROM comp_cache` as any[];
 console.log(`rows in comp_cache: ${cached[0]?.n ?? 0}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
