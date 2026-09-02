import { NextResponse } from "next/server";
import { isApprovedRequest } from "@/app/lib/approval";
import { neon } from "@neondatabase/serverless";
import { formatPrice } from "@/app/lib/formatPrice";
import { SHOPIFY_STORES } from "@/app/lib/storeConfig";
import { HIDDEN_STORE_SLUGS } from "@/app/lib/stores";
import { getMobileUserId } from "@/app/lib/mobileAuth";
import { getUserTasteProfile } from "@/app/lib/taste-db";
import { vibeKeywords, colorKeywords, eraKeywords, categoryTasteKeywords } from "@/app/lib/tasteVibes";
import { designerKeywords } from "@/app/lib/brandData";

export const dynamic = "force-dynamic";

/**
 * Personalized "Curated for You" feed for the mobile home screen.
 *
 * Signal model (scored):
 *   click = 5 (90d), favorite = 8 (all-time), view = 1 (60d)
 * Aggregated into per-user top stores + top sizes. Returns recent products from
 * those stores, then ALWAYS backfills with a popular+recent blend so the feed is
 * full even for users with little/no history (and sharpens as they interact).
 *
 * `personalized` is true when the user had real activity driving the ranking.
 */
export async function GET(request: Request) {
 if (!(await isApprovedRequest(request))) return NextResponse.json({ error: "Approval required", needsApproval: true }, { status: 403 });
 const { searchParams } = new URL(request.url);
 const limit = Math.min(parseInt(searchParams.get("limit") ?? "60"), 200);
 // Client-passed signals so logged-out users (favorites are stored locally on the
 // device) still get a personalized feed: their hearted product ids + taste.
 const favIds = (searchParams.get("favs") ?? "")
 .split(",").map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n)).slice(0, 60);
 const queryVibes = (searchParams.get("vibes") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
 const querySizes = (searchParams.get("sizes") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ products: [], personalized: false });

 const sql = neon(dbUrl);
 const userId = getMobileUserId(request);
 const shopifySlugs = SHOPIFY_STORES.map((s) => s.slug);
 const hidden = ["velvet-archive", ...HIDDEN_STORE_SLUGS];

 // Popular + recent blend, excluding given product ids. Used as the no-signal
 // feed and as backfill so "Curated for You" is never sparse. When vibePatterns
 // are supplied (from the taste test), results are restricted to titles matching
 // those keywords — this is what makes a brand-new user's feed personalized.
 const popularRecent = async (excludeIds: number[], take: number, vibePatterns: string[] = [], sizeBias: string[] = []) => {
 if (take <= 0) return [] as Array<Record<string, unknown>>;
 // Pull a recent pool, then re-rank by recent engagement (trending) + size fit,
 // so the base/backfill feed reflects what's hot now rather than all-time faves.
 const pool = (await sql`
  SELECT p.id, p.store_slug, p.store_name, p.title, p.price, p.currency, p.image, p.images, p.size
  FROM products p
  WHERE p.image IS NOT NULL AND p.image != ''
   AND p.title NOT ILIKE '%gift card%'
   AND (p.store_slug != ALL(${shopifySlugs}) OR p.collabs_link IS NOT NULL)
   AND (${hidden.length} = 0 OR p.store_slug != ALL(${hidden}))
   AND (${excludeIds.length} = 0 OR p.id != ALL(${excludeIds}))
   AND (${vibePatterns.length} = 0 OR lower(p.title) LIKE ANY(${vibePatterns}::text[]))
  ORDER BY p.created_at DESC NULLS LAST, p.id DESC
  LIMIT ${Math.max(take * 5, 120)}
 `) as Array<Record<string, unknown>>;
 const trend = await getTrendScores(pool.map((p) => p.id as number));
 const scored = pool.map((p) => {
  const sz = (p.size as string | null)?.toUpperCase() ?? null;
  let s = trend.get(p.id as number) ?? 0;
  if (sizeBias.length > 0 && sz && sizeBias.includes(sz)) s += 6;
  return { p, s };
 });
 scored.sort((a, b) => b.s - a.s); // trending first; ties keep recency order (stable sort)
 return scored.slice(0, take).map((x) => x.p);
 };

 // Taste profile — vibes (keyword bias) + explicit sizes (strong fit signal).
 const profile = userId
 ? await getUserTasteProfile(userId).catch(() => ({ vibes: [] as string[], sizes: [] as string[], categories: [] as string[], designers: [] as string[], colors: [] as string[], eras: [] as string[] }))
 : { vibes: queryVibes, sizes: querySizes, categories: [] as string[], designers: [] as string[], colors: [] as string[], eras: [] as string[] };
 const vibes = profile.vibes;
 const savedSizes = profile.sizes; // already uppercased by sanitizeSizes
 // Every taste dimension feeds ONE combined keyword bias — OR-matched and additive,
 // so a product matching ANY signal (Y2K, orange, a loved designer…) gets surfaced,
 // never filtered out for missing the others.
 const vibePatterns = Array.from(new Set([
 ...vibeKeywords(vibes),
 ...colorKeywords(profile.colors),
 ...eraKeywords(profile.eras),
 ...categoryTasteKeywords(profile.categories),
 ...designerKeywords(profile.designers),
 ])).map((k) => `%${k}%`);
 const hasVibes = vibePatterns.length > 0;

 // Recent-engagement "trending" scores for a set of products. Resilient: any
 // SQL hiccup just yields an empty map so the feed still renders (by recency).
 const getTrendScores = async (productIds: number[]): Promise<Map<number, number>> => {
 if (productIds.length === 0) return new Map();
 try {
 const rows = (await sql`
  WITH ids AS (SELECT unnest(${productIds}::int[]) AS id)
  SELECT i.id,
   (COALESCE(rf.cnt, 0) * 4 + COALESCE(rc.cnt, 0) * 3 + COALESCE(rv.cnt, 0)) AS trend
  FROM ids i
  LEFT JOIN (
   SELECT product_id, COUNT(*)::int AS cnt FROM product_favorites
   WHERE created_at >= NOW() - INTERVAL '21 days' GROUP BY product_id
  ) rf ON rf.product_id = i.id
  LEFT JOIN (
   SELECT product_id::int AS pid, COUNT(*)::int AS cnt FROM clicks
   WHERE timestamp >= NOW() - INTERVAL '21 days' AND product_id ~ '^[0-9]+$' GROUP BY product_id
  ) rc ON rc.pid = i.id
  LEFT JOIN products p ON p.id = i.id
  LEFT JOIN (
   SELECT product_id AS comp, COUNT(*)::int AS cnt FROM product_views
   WHERE timestamp >= NOW() - INTERVAL '21 days' GROUP BY product_id
  ) rv ON rv.comp = (p.store_slug || '-' || p.id::text)
 `) as Array<{ id: number; trend: number }>;
 return new Map(rows.map((r) => [Number(r.id), Number(r.trend)]));
 } catch (e) {
 console.error("[for-you] trend scores failed:", e);
 return new Map();
 }
 };

 try {
 // ============ Build signal profile ============
 // Signed-in: the user's clicks / favorites / views. Logged-out: the favorites
 // the app passes from local storage — so the feed still reflects your likes.
 let signalRows: Array<{ store_slug: string; size: string | null; score: number }> = [];
 if (userId) {
 signalRows = (await sql`
  WITH activity AS (
   -- clicks + views store the COMPOSITE id (store_slug-id), so resolve the real
   -- int product id via the same join the trending query uses; favorites are INT.
   SELECT cp.id AS product_id, c.store_slug, 5 AS weight
   FROM clicks c
   JOIN products cp ON (cp.store_slug || '-' || cp.id::text) = c.product_id
   WHERE c.user_id = ${userId} AND c.timestamp >= NOW() - INTERVAL '90 days' AND c.store_slug IS NOT NULL
   UNION ALL
   SELECT pf.product_id AS product_id, NULL AS store_slug, 8 AS weight
   FROM product_favorites pf WHERE pf.user_id = ${userId}
   UNION ALL
   -- Views are weighted by how long the piece was actually on screen: a scroll-past is 1, a
   -- lingering look is up to 4. Still below a favourite (8) — dwelling on something is interest,
   -- saying so outright is intent.
   SELECT vp.id AS product_id, NULL AS store_slug,
    CASE
     WHEN pv.dwell_ms IS NULL THEN 1
     WHEN pv.dwell_ms >= 30000 THEN 4
     WHEN pv.dwell_ms >= 10000 THEN 3
     WHEN pv.dwell_ms >= 4000  THEN 2
     ELSE 1
    END AS weight
   FROM product_views pv
   JOIN products vp ON (vp.store_slug || '-' || vp.id::text) = pv.product_id
   WHERE pv.user_id = ${userId} AND pv.timestamp >= NOW() - INTERVAL '60 days'
  )
  SELECT COALESCE(a.store_slug, p.store_slug) AS store_slug, p.size, SUM(a.weight)::int AS score
  FROM activity a
  LEFT JOIN products p ON p.id = a.product_id
  WHERE COALESCE(a.store_slug, p.store_slug) IS NOT NULL
  GROUP BY 1, 2
 `) as Array<{ store_slug: string; size: string | null; score: number }>;
 } else if (favIds.length > 0) {
 // Each locally-favorited product contributes weight 8 to its store + size.
 signalRows = (await sql`
  SELECT store_slug, size, 8 AS score FROM products WHERE id = ANY(${favIds})
 `) as Array<{ store_slug: string; size: string | null; score: number }>;
 }

 // No behavioral history yet. If they took the taste test, personalize off their
 // vibes; otherwise fall back to a generic popular+recent mix.
 if (signalRows.length === 0) {
 const hasProfile = hasVibes || savedSizes.length > 0;
 let rows = await popularRecent([], limit, vibePatterns, savedSizes);
 if (hasProfile && rows.length < limit) {
  const have = rows.map((r) => r.id as number);
  const fill = await popularRecent(have, limit - rows.length, [], savedSizes);
  rows = rows.concat(fill);
 }
 return NextResponse.json({ products: rows.map(mapRow), personalized: hasProfile });
 }

 // Aggregate scores per store and per size
 const storeScores = new Map<string, number>();
 const sizeScores = new Map<string, number>();
 for (const row of signalRows) {
 storeScores.set(row.store_slug, (storeScores.get(row.store_slug) ?? 0) + row.score);
 if (row.size) {
  const s = row.size.toUpperCase();
  sizeScores.set(s, (sizeScores.get(s) ?? 0) + row.score);
 }
 }

 const topStores = Array.from(storeScores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([slug]) => slug);
 const topSizes = Array.from(sizeScores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);

 // Exclude products already favorited or viewed (surface fresh discoveries)
 const seenRows = userId
 ? (await sql`
  SELECT pf.product_id AS pid FROM product_favorites pf WHERE pf.user_id = ${userId}
  UNION
  SELECT vp.id AS pid FROM product_views pv
  JOIN products vp ON (vp.store_slug || '-' || vp.id::text) = pv.product_id
  WHERE pv.user_id = ${userId}
 `) as Array<{ pid: number }>
 : [];
 const excludeIds = userId ? seenRows.map((r) => r.pid) : favIds;
 const useSizes = topSizes.length > 0;

 const rows = (await sql`
  SELECT id, store_slug, store_name, title, price, currency, image, images, size, created_at
  FROM products
  WHERE image IS NOT NULL AND image != ''
   AND title NOT ILIKE '%gift card%'
   AND created_at IS NOT NULL AND created_at >= NOW() - INTERVAL '60 days'
   AND store_slug = ANY(${topStores})
   AND (store_slug != ALL(${shopifySlugs}) OR collabs_link IS NOT NULL)
   AND (${hidden.length} = 0 OR store_slug != ALL(${hidden}))
   AND (${excludeIds.length} = 0 OR id != ALL(${excludeIds}))
  ORDER BY created_at DESC, id DESC
  LIMIT ${limit * 3}
 `) as Array<Record<string, unknown>>;

 // Score: store affinity + size bonus + saved-size bonus + vibe bonus + trending.
 const candTrend = await getTrendScores(rows.map((p) => p.id as number));
 const vibeKw = vibeKeywords(vibes);
 const scored = rows.map((p) => {
 const slug = p.store_slug as string;
 const size = (p.size as string | null)?.toUpperCase() ?? null;
 let score = storeScores.get(slug) ?? 0;
 if (useSizes && size && topSizes.includes(size)) score += 5; // size from behavior
 if (savedSizes.length > 0 && size && savedSizes.includes(size)) score += 8; // explicit saved size (strong fit signal)
 if (vibeKw.length > 0) {
  const title = String(p.title ?? "").toLowerCase();
  if (vibeKw.some((kw) => title.includes(kw))) score += 4;
 }
 score += Math.min(candTrend.get(p.id as number) ?? 0, 30) * 0.5; // trending boost (capped)
 return { p, score };
 });
 scored.sort((a, b) => b.score - a.score);

 let products = scored.slice(0, limit).map((x) => mapRow(x.p));

 // Always fill to `limit` with a popular+recent blend so the feed is never sparse.
 if (products.length < limit) {
 const exclude = Array.from(new Set([...excludeIds, ...products.map((p) => p.id)]));
 const fill = await popularRecent(exclude, limit - products.length, [], savedSizes);
 products = products.concat(fill.map(mapRow));
 }

 return NextResponse.json({ products, personalized: true });
 } catch (err) {
 console.error("[for-you] error:", err);
 // Best-effort fallback so the home screen still populates.
 try {
  const rows = await popularRecent([], limit);
  return NextResponse.json({ products: rows.map(mapRow), personalized: false });
 } catch {
  return NextResponse.json({ products: [], personalized: false });
 }
 }
}

function mapRow(p: Record<string, unknown>) {
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
}
