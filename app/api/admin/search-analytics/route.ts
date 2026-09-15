import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

async function isAuthorized(request: NextRequest): Promise<boolean> {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (!adminToken) return false;
 const encoder = new TextEncoder();
 const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(adminPassword));
 const expected = Array.from(new Uint8Array(hashBuffer))
 .map((b) => b.toString(16).padStart(2, "0"))
 .join("");
 return adminToken === expected;
}

export async function GET(request: NextRequest) {
 if (!(await isAuthorized(request))) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database URL" }, { status: 500 });

 const { searchParams } = new URL(request.url);
 const range = searchParams.get("range") ?? "30d";

 let cutoff: string | null = null;
 if (range === "7d") {
 const d = new Date(); d.setDate(d.getDate() - 7); cutoff = d.toISOString();
 } else if (range === "30d") {
 const d = new Date(); d.setDate(d.getDate() - 30); cutoff = d.toISOString();
 }

 const sql = neon(dbUrl);

 const [summaryRows, zeroRows, topRows, lowRows] = await Promise.all([

 // Overall stats
 sql`
 SELECT
 COUNT(*)::int AS total_searches,
 COUNT(DISTINCT query)::int AS unique_queries,
 ROUND(AVG(results_count)::numeric, 1)::float AS avg_results,
 SUM(CASE WHEN results_count = 0 THEN 1 ELSE 0 END)::int AS zero_result_count,
 ROUND(
 100.0 * SUM(CASE WHEN results_count = 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
 1
 )::float AS zero_result_pct
 FROM searches
 WHERE ${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz
 `,

 // Queries that returned 0 results. Most actionable
 sql`
 SELECT
 query,
 COUNT(*)::int AS search_count,
 MAX(timestamp) AS last_searched
 FROM searches
 WHERE results_count = 0
 AND (${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz)
 GROUP BY query
 ORDER BY search_count DESC, last_searched DESC
 LIMIT 50
 `,

 // Top queries overall (any result count)
 sql`
 SELECT
 query,
 COUNT(*)::int AS search_count,
 ROUND(AVG(results_count)::numeric, 0)::int AS avg_results,
 SUM(CASE WHEN results_count = 0 THEN 1 ELSE 0 END)::int AS zero_hits,
 MAX(timestamp) AS last_searched
 FROM searches
 WHERE ${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz
 GROUP BY query
 ORDER BY search_count DESC
 LIMIT 50
 `,

 // Searches with very low results (1–4): likely poor coverage
 sql`
 SELECT
 query,
 COUNT(*)::int AS search_count,
 ROUND(AVG(results_count)::numeric, 1)::float AS avg_results,
 MAX(timestamp) AS last_searched
 FROM searches
 WHERE results_count BETWEEN 1 AND 4
 AND (${cutoff}::timestamptz IS NULL OR timestamp >= ${cutoff}::timestamptz)
 GROUP BY query
 ORDER BY search_count DESC
 LIMIT 30
 `,

 ]);

 const s = summaryRows[0] as Record<string, unknown> | undefined;

 return NextResponse.json({
 summary: {
 totalSearches: Number(s?.total_searches ?? 0),
 uniqueQueries: Number(s?.unique_queries ?? 0),
 avgResults: Number(s?.avg_results ?? 0),
 zeroResultCount: Number(s?.zero_result_count ?? 0),
 zeroResultPct: Number(s?.zero_result_pct ?? 0),
 },
 zeroResults: (zeroRows as Array<Record<string, unknown>>).map((r) => ({
 query: String(r.query ?? ""),
 searchCount: Number(r.search_count ?? 0),
 lastSearched: String(r.last_searched ?? ""),
 })),
 topQueries: (topRows as Array<Record<string, unknown>>).map((r) => ({
 query: String(r.query ?? ""),
 searchCount: Number(r.search_count ?? 0),
 avgResults: Number(r.avg_results ?? 0),
 zeroHits: Number(r.zero_hits ?? 0),
 lastSearched: String(r.last_searched ?? ""),
 })),
 lowResults: (lowRows as Array<Record<string, unknown>>).map((r) => ({
 query: String(r.query ?? ""),
 searchCount: Number(r.search_count ?? 0),
 avgResults: Number(r.avg_results ?? 0),
 lastSearched: String(r.last_searched ?? ""),
 })),
 });
}
