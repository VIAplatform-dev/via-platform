import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { SHOPIFY_STORES } from "@/app/lib/storeConfig";
import { HIDDEN_STORE_SLUGS } from "@/app/lib/stores";
import {
 getAllSavedSearches,
 updateSavedSearchMatchCount,
 getPushTokensForUser,
 type SavedSearchFilters,
} from "@/app/lib/saved-searches-db";
import { categoryKeywords } from "@/app/lib/publicFilters";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
 const auth = request.headers.get("authorization");
 if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

 const sql = neon(dbUrl);
 const shopifySlugs = SHOPIFY_STORES.map((s) => s.slug);
 const hidden = ["velvet-archive", ...HIDDEN_STORE_SLUGS];

 const searches = await getAllSavedSearches();

 // Group by user so we can batch their push notification
 const userBuckets = new Map<string, Array<{ name: string; count: number }>>();
 let totalChecked = 0;
 let totalNewMatches = 0;

 for (const search of searches) {
 const filters = search.filters as SavedSearchFilters;
 const sizesUpper = (filters.sizes ?? []).map((s) => s.toUpperCase());
 const useSizes = sizesUpper.length > 0;
 const useStores = (filters.stores ?? []).length > 0;
 const usePriceMin = filters.priceMin != null;
 const usePriceMax = filters.priceMax != null;
 const priceMin = filters.priceMin ?? 0;
 const priceMax = filters.priceMax ?? 1e12;
 const lastChecked = search.lastCheckedAt;

 try {
  const rows = await sql`
  SELECT id, title
  FROM products
  WHERE image IS NOT NULL AND image != ''
   AND title NOT ILIKE '%gift card%'
   AND created_at IS NOT NULL
   AND created_at > ${lastChecked}::timestamptz
   AND (store_slug != ALL(${shopifySlugs}) OR collabs_link IS NOT NULL)
   AND (${hidden.length} = 0 OR store_slug != ALL(${hidden}))
   AND (${!useSizes} OR UPPER(size) = ANY(${sizesUpper}))
   AND (${!useStores} OR store_slug = ANY(${filters.stores ?? []}))
   AND (${!usePriceMin} OR price >= ${priceMin})
   AND (${!usePriceMax} OR price <= ${priceMax})
  LIMIT 500
  ` as Array<{ id: number; title: string }>;

  // JS-side category filtering
  let matches = rows.length;
  if ((filters.categories ?? []).length > 0) {
  const kws = categoryKeywords(filters.categories ?? []).map((k) => k.toLowerCase());
  if (kws.length > 0) {
   matches = rows.filter((r) => {
   const t = r.title.toLowerCase();
   return kws.some((kw) => t.includes(kw));
   }).length;
  }
  }

  // Text query filter (if any)
  if (filters.query) {
  const q = filters.query.toLowerCase();
  matches = rows.filter((r) => r.title.toLowerCase().includes(q)).length;
  }

  await updateSavedSearchMatchCount(search.id, matches);

  if (matches > 0) {
  const bucket = userBuckets.get(search.userId) ?? [];
  bucket.push({ name: search.name, count: matches });
  userBuckets.set(search.userId, bucket);
  totalNewMatches += matches;
  }
  totalChecked++;
 } catch (err) {
  console.error(`[check-saved-searches] error on search ${search.id}:`, err);
 }
 }

 // Send push notifications. One per user, summarizing their new matches
 const pushResults: Array<{ userId: string; tokens: number; ok: boolean }> = [];
 for (const [userId, matches] of userBuckets) {
 const tokens = await getPushTokensForUser(userId);
 if (tokens.length === 0) {
  pushResults.push({ userId, tokens: 0, ok: false });
  continue;
 }
 const totalCount = matches.reduce((s, m) => s + m.count, 0);
 const title =
  matches.length === 1
  ? `${matches[0].count} new ${matches[0].count === 1 ? "match" : "matches"} for "${matches[0].name}"`
  : `${totalCount} new ${totalCount === 1 ? "match" : "matches"} across your saved searches`;
 const body =
  matches.length === 1
  ? `Tap to see what just landed.`
  : matches.map((m) => `${m.name}: ${m.count}`).join(" · ");

 try {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(
   tokens.map((token) => ({
   to: token,
   title,
   body,
   sound: "default",
   data: { type: "saved-search" },
   })),
  ),
  });
  pushResults.push({ userId, tokens: tokens.length, ok: res.ok });
 } catch (err) {
  console.error(`[check-saved-searches] push send failed for ${userId}:`, err);
  pushResults.push({ userId, tokens: tokens.length, ok: false });
 }
 }

 return NextResponse.json({
 ok: true,
 totalChecked,
 totalNewMatches,
 usersNotified: pushResults.filter((r) => r.ok).length,
 });
}
