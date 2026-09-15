import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// Read-only, CRON_SECRET-gated: how full is the comp cache? Shows total comps saved, how many
// are fresh (reusable), how many distinct item-queries / brands are covered, and the biggest
// brands by comp count, so you can watch each paid lookup turn into reusable, cost-saving data.
//   /api/cron/comp-cache-stats
export const maxDuration = 30;

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 const sql = db();
 try {
 const [stats] = (await sql`
 SELECT
  COUNT(*)::int AS total_comps,
  COUNT(*) FILTER (WHERE fetched_at >= NOW() - INTERVAL '45 days')::int AS fresh_comps,
  COUNT(DISTINCT query_norm)::int AS distinct_queries,
  COUNT(DISTINCT brand)::int AS distinct_brands,
  to_char(MIN(fetched_at), 'YYYY-MM-DD') AS oldest,
  to_char(MAX(fetched_at), 'YYYY-MM-DD') AS newest
 FROM comp_cache
 `) as Array<Record<string, unknown>>;
 const topBrands = (await sql`SELECT brand, COUNT(*)::int AS comps FROM comp_cache WHERE brand IS NOT NULL GROUP BY brand ORDER BY comps DESC LIMIT 10`) as Array<Record<string, unknown>>;
 return NextResponse.json({ ...stats, topBrands });
 } catch {
 // Table not created yet, no pricing has run since deploy.
 return NextResponse.json({ total_comps: 0, note: "comp_cache is empty (no pricing run yet)" });
 }
}
