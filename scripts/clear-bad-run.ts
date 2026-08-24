// Remove the title-ctx rows graded while SERPAPI was misconfigured — those predictions were
// brand averages with no comps behind them, and would drag every reported number down.
import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
async function main() {
 const del = await db()`
  DELETE FROM price_eval_items
  WHERE mode = 'title-ctx' AND ran_at >= NOW() - INTERVAL '3 hours'
  RETURNING id` as any[];
 const left = await db()`SELECT mode, COUNT(*)::int AS n FROM price_eval_items GROUP BY mode ORDER BY mode` as any[];
 console.log(`deleted ${del.length} invalid title-ctx rows`);
 console.log("remaining:", left.map((r: any) => `${r.mode}=${r.n}`).join("  "));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
