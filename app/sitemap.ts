import { MetadataRoute } from "next";
import { visibleStores as stores } from "@/app/lib/stores";
import { neon } from "@neondatabase/serverless";

export const revalidate = 3600; // regenerate every hour

const BASE_URL = "https://vyaplatform.com";

async function getProductUrls(): Promise<MetadataRoute.Sitemap> {
 try {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return [];
 const sql = neon(dbUrl);
 const rows = await sql`
  SELECT p.store_slug, p.id, p.synced_at
  FROM products p
  WHERE p.image IS NOT NULL AND p.image != ''
  AND p.title NOT ILIKE '%gift card%'
  AND (
   p.shopify_product_id IS NULL
   OR p.collabs_link IS NOT NULL
  )
  ORDER BY p.id DESC
  LIMIT 10000
 `;
 return (rows as { store_slug: string; id: number; synced_at: Date }[]).map((r) => ({
  url: `${BASE_URL}/products/${r.store_slug}-${r.id}`,
  lastModified: r.synced_at ?? new Date(),
  changeFrequency: "daily" as const,
  priority: 0.7,
 }));
 } catch {
 return [];
 }
}

// Live seller storefronts (the items-based /s/{handle} sites) + their in-stock product pages, so
// Google discovers the pages we mark up with Product schema. Custom-domain stores are skipped —
// their /s mirror is noindexed + canonical'd to the domain, so the domain carries their SEO.
async function getStorefrontUrls(): Promise<MetadataRoute.Sitemap> {
 try {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return [];
 const sql = neon(dbUrl);
 const homes = (await sql`
  SELECT handle, updated_at FROM storefront_settings
  WHERE enabled = TRUE AND (custom_domain IS NULL OR custom_domain = '')
 `) as { handle: string; updated_at: Date }[];
 const products = (await sql`
  SELECT sf.handle, i.id AS item_id, i.updated_at
  FROM storefront_settings sf
  JOIN sellers s ON s.slug = sf.store_slug
  JOIN items i ON i.seller_id = s.id
  WHERE sf.enabled = TRUE AND (sf.custom_domain IS NULL OR sf.custom_domain = '')
   AND i.status = 'active'
  ORDER BY i.updated_at DESC
  LIMIT 20000
 `) as { handle: string; item_id: string; updated_at: Date }[];

 const homeUrls: MetadataRoute.Sitemap = homes.flatMap((h) => [
  { url: `${BASE_URL}/s/${h.handle}`, lastModified: h.updated_at ?? new Date(), changeFrequency: "daily" as const, priority: 0.8 },
  { url: `${BASE_URL}/s/${h.handle}/shop`, lastModified: h.updated_at ?? new Date(), changeFrequency: "daily" as const, priority: 0.7 },
 ]);
 const productUrls: MetadataRoute.Sitemap = products.map((p) => ({
  url: `${BASE_URL}/s/${p.handle}/p/${p.item_id}`,
  lastModified: p.updated_at ?? new Date(),
  changeFrequency: "daily" as const,
  priority: 0.7,
 }));
 return [...homeUrls, ...productUrls];
 } catch {
 return [];
 }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
 const staticPages: MetadataRoute.Sitemap = [
 { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
 { url: `${BASE_URL}/browse`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
 { url: `${BASE_URL}/new-arrivals`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
 { url: `${BASE_URL}/stores`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
 { url: `${BASE_URL}/categories`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
 { url: `${BASE_URL}/brands`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
 { url: `${BASE_URL}/stories`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
 { url: `${BASE_URL}/for-stores`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
 { url: `${BASE_URL}/faqs`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
 { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
 { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
 ];

 const storePages: MetadataRoute.Sitemap = stores.map((store) => ({
 url: `${BASE_URL}/stores/${store.slug}`,
 lastModified: new Date(),
 changeFrequency: "daily" as const,
 priority: 0.8,
 }));

 const productPages = await getProductUrls();
 const storefrontPages = await getStorefrontUrls();

 return [...staticPages, ...storePages, ...productPages, ...storefrontPages];
}
