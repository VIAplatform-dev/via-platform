import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { getActiveCollectionSlugs } from "@/app/lib/editors-picks-db";

export const dynamic = "force-dynamic";

// Why doesn't a curated collection show on the marketplace? This traces where its picks go:
//   picks           = rows in editors_picks for the slug
//   joinable        = picks whose product_id actually matches a row in products (the marketplace JOIN)
//   buyable         = of those, how many pass the buyability filter (VYA-native OR has a collabs_link)
//   inActiveSet     = is the slug in getActiveCollectionSlugs() (what the nav uses)
// If picks > joinable → product-id mismatch. If joinable > buyable → missing collabs links / shopify.
// If buyable > 0 but the nav still hides it → caching, not data.
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const slug = new URL(request.url).searchParams.get("slug") || "office-edit";
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 try {
 const picks = (await sql`SELECT COUNT(*)::int AS n FROM editors_picks WHERE collection_slug = ${slug}`) as { n: number }[];
 const joinable = (await sql`SELECT COUNT(*)::int AS n FROM editors_picks ep JOIN products p ON p.id = ep.product_id WHERE ep.collection_slug = ${slug}`) as { n: number }[];
 const buyable = (await sql`SELECT COUNT(*)::int AS n FROM editors_picks ep JOIN products p ON p.id = ep.product_id WHERE ep.collection_slug = ${slug} AND (p.shopify_product_id IS NULL OR p.collabs_link IS NOT NULL)`) as { n: number }[];
 const sample = (await sql`
  SELECT ep.product_id, p.id AS matched, p.store_slug, p.title,
   (p.shopify_product_id IS NOT NULL) AS is_shopify,
   (p.collabs_link IS NOT NULL AND p.collabs_link <> '') AS has_collabs_link
  FROM editors_picks ep LEFT JOIN products p ON p.id = ep.product_id
  WHERE ep.collection_slug = ${slug} ORDER BY ep.id DESC LIMIT 8
 `) as Record<string, unknown>[];
 const activeSet = await getActiveCollectionSlugs();
 return NextResponse.json({
 ok: true, slug,
 picks: picks[0]?.n ?? 0,
 joinable: joinable[0]?.n ?? 0,
 buyable: buyable[0]?.n ?? 0,
 inActiveSet: activeSet.has(slug),
 sample,
 });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
