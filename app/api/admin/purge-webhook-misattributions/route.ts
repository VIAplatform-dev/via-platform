import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

/**
 * One-shot cleanup: remove conversions saved by the Shopify webhook that
 * came from the now-removed loose-matching paths (last-click fallback,
 * email match, or unmatched). Keeps only rows with source="cart-attribute"
 * those are the orders that actually went through VYA's cart link.
 *
 * GET /api/admin/purge-webhook-misattributions?dryRun=1 → counts only
 * POST /api/admin/purge-webhook-misattributions          → deletes
 *
 * Middleware already gates this behind admin auth.
 */
export async function GET(request: NextRequest) {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

 const sql = neon(dbUrl);
 const rows = await sql`
 SELECT
  matched_click_data->>'source' AS source,
  COUNT(*)::int AS count,
  COALESCE(SUM(order_total), 0)::numeric AS total_usd
 FROM conversions
 WHERE conversion_id LIKE 'shopify-%'
  AND (
  matched_click_data->>'source' IS NULL
  OR matched_click_data->>'source' != 'cart-attribute'
  )
 GROUP BY 1
 ORDER BY count DESC
 ` as Array<{ source: string | null; count: number; total_usd: string }>;

 const total = rows.reduce((s, r) => s + r.count, 0);
 return NextResponse.json({
 dryRun: true,
 toDelete: total,
 breakdown: rows,
 message:
  total === 0
  ? "Nothing to clean up."
  : `POST this endpoint to delete ${total} misattributed conversion rows.`,
 });
}

export async function POST(request: NextRequest) {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

 const sql = neon(dbUrl);
 const result = await sql`
 DELETE FROM conversions
 WHERE conversion_id LIKE 'shopify-%'
  AND (
  matched_click_data->>'source' IS NULL
  OR matched_click_data->>'source' != 'cart-attribute'
  )
 RETURNING conversion_id
 ` as Array<{ conversion_id: string }>;

 return NextResponse.json({
 deleted: result.length,
 sample: result.slice(0, 10).map((r) => r.conversion_id),
 });
}
