import { NextResponse } from "next/server";
import { isApprovedRequest } from "@/app/lib/approval";
import { neon } from "@neondatabase/serverless";
import { formatPrice } from "@/app/lib/formatPrice";
import { SHOPIFY_STORES } from "@/app/lib/storeConfig";
import { HIDDEN_STORE_SLUGS } from "@/app/lib/stores";
import { parseFilters, applyJsFilters, stripSizePrefix, designerPatterns } from "@/app/lib/publicFilters";
import { getCategoryOverrideMap } from "@/app/lib/category-overrides-db";
import { ensureSizeKeysColumn } from "@/app/lib/db";

export const dynamic = "force-dynamic";

// Paginated full-catalog feed (newest first). The mobile app loads this via
// infinite scroll, so there is no 7-day window and no hard cap. Every product
// is reachable by paging with ?offset=. Page size is bounded per request.
export async function GET(request: Request) {
 if (!(await isApprovedRequest(request))) return NextResponse.json({ error: "Approval required", needsApproval: true }, { status: 403 });
 const { searchParams } = new URL(request.url);
 const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "60"), 1), 100);
 const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);
 const filters = parseFilters(searchParams);

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ products: [], nextOffset: offset, hasMore: false });

 const sql = neon(dbUrl);
 const shopifySlugs = SHOPIFY_STORES.map((s) => s.slug);
 const hidden = ["velvet-archive", ...HIDDEN_STORE_SLUGS];

 const sizesUpper = filters.sizes.map(stripSizePrefix);
 const useSizes = sizesUpper.length > 0;
 const useStores = filters.stores.length > 0;
 const designerPats = designerPatterns(filters.designers);
 const useDesigners = designerPats.length > 0;
 const usePriceMin = filters.priceMin != null;
 const usePriceMax = filters.priceMax != null;
 const priceMin = filters.priceMin ?? 0;
 const priceMax = filters.priceMax ?? 1e12;

 try {
 await ensureSizeKeysColumn();
 let rows: Array<Record<string, unknown>>;
 if (filters.sort === "priceAsc") {
 rows = await sql`
  SELECT id, store_slug, store_name, title, price, currency, image, images, size
  FROM products
  WHERE image IS NOT NULL AND image != ''
  AND title NOT ILIKE '%gift card%'
  AND (store_slug != ALL(${shopifySlugs}) OR collabs_link IS NOT NULL)
  AND (${hidden.length} = 0 OR store_slug != ALL(${hidden}))
  AND (${!useSizes} OR (CASE WHEN size_keys IS NOT NULL THEN size_keys && ${sizesUpper}::text[] ELSE regexp_replace(UPPER(TRIM(size)), '^(US|UK|EU|IT|FR|DE)\\s*', '') = ANY(${sizesUpper}) END))
  AND (${!useStores} OR store_slug = ANY(${filters.stores}))
  AND (${!useDesigners} OR title ~* ANY(${designerPats}::text[]))
  AND (${!usePriceMin} OR price >= ${priceMin})
  AND (${!usePriceMax} OR price <= ${priceMax})
  ORDER BY price ASC, id DESC
  LIMIT ${limit} OFFSET ${offset}
 ` as Array<Record<string, unknown>>;
 } else if (filters.sort === "priceDesc") {
 rows = await sql`
  SELECT id, store_slug, store_name, title, price, currency, image, images, size
  FROM products
  WHERE image IS NOT NULL AND image != ''
  AND title NOT ILIKE '%gift card%'
  AND (store_slug != ALL(${shopifySlugs}) OR collabs_link IS NOT NULL)
  AND (${hidden.length} = 0 OR store_slug != ALL(${hidden}))
  AND (${!useSizes} OR (CASE WHEN size_keys IS NOT NULL THEN size_keys && ${sizesUpper}::text[] ELSE regexp_replace(UPPER(TRIM(size)), '^(US|UK|EU|IT|FR|DE)\\s*', '') = ANY(${sizesUpper}) END))
  AND (${!useStores} OR store_slug = ANY(${filters.stores}))
  AND (${!useDesigners} OR title ~* ANY(${designerPats}::text[]))
  AND (${!usePriceMin} OR price >= ${priceMin})
  AND (${!usePriceMax} OR price <= ${priceMax})
  ORDER BY price DESC, id DESC
  LIMIT ${limit} OFFSET ${offset}
 ` as Array<Record<string, unknown>>;
 } else {
 rows = await sql`
  SELECT id, store_slug, store_name, title, price, currency, image, images, size
  FROM products
  WHERE image IS NOT NULL AND image != ''
  AND title NOT ILIKE '%gift card%'
  AND (store_slug != ALL(${shopifySlugs}) OR collabs_link IS NOT NULL)
  AND (${hidden.length} = 0 OR store_slug != ALL(${hidden}))
  AND (${!useSizes} OR (CASE WHEN size_keys IS NOT NULL THEN size_keys && ${sizesUpper}::text[] ELSE regexp_replace(UPPER(TRIM(size)), '^(US|UK|EU|IT|FR|DE)\\s*', '') = ANY(${sizesUpper}) END))
  AND (${!useStores} OR store_slug = ANY(${filters.stores}))
  AND (${!useDesigners} OR title ~* ANY(${designerPats}::text[]))
  AND (${!usePriceMin} OR price >= ${priceMin})
  AND (${!usePriceMax} OR price <= ${priceMax})
  ORDER BY created_at DESC NULLS LAST, id DESC
  LIMIT ${limit} OFFSET ${offset}
 ` as Array<Record<string, unknown>>;
 }

 const rawCount = rows.length;

 let products = rows.map((p) => {
 let parsedImages: string[] | undefined;
 try {
  parsedImages = p.images ? JSON.parse(p.images as string) : undefined;
 } catch {}
 return {
  id: p.id as number,
  name: p.title as string,
  storeSlug: p.store_slug as string,
  storeName: p.store_name as string,
  price: formatPrice(Number(p.price), p.currency as string | null),
  image: p.image as string | null,
  images: parsedImages,
  size: (p.size as string | null) ?? null,
 };
 });

 // Category filtering happens in JS (title-keyword based). Offset advances by the
 // raw rows consumed, not the filtered count, so paging stays consistent.
 products = applyJsFilters(products, filters, await getCategoryOverrideMap());

 return NextResponse.json({
  products,
  nextOffset: offset + rawCount,
  hasMore: rawCount === limit,
 });
 } catch {
 return NextResponse.json({ products: [], nextOffset: offset, hasMore: false });
 }
}
