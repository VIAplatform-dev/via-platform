import { neon } from "@neondatabase/serverless";

// Edge-safe: does this custom domain belong to a store that brought its own site
// over (has captured pages)? Returns that store's slug so the middleware can serve
// the captured site on the seller's own domain; null → fall back to the block
// storefront. Cached briefly per warm instance (domain→store mapping rarely moves).
const cache = new Map<string, { slug: string | null; at: number }>();
const TTL_MS = 60_000;

export async function capturedSlugForDomain(host: string): Promise<string | null> {
 const d = host.toLowerCase().trim().replace(/^www\./, "");
 if (!d) return null;
 const hit = cache.get(d);
 if (hit && Date.now() - hit.at < TTL_MS) return hit.slug;

 let slug: string | null = null;
 try {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (url) {
 const sql = neon(url);
 const rows = (await sql`
 SELECT sc.store_slug AS slug
 FROM storefront_settings ss
 JOIN site_captures sc ON sc.store_slug = ss.store_slug
 WHERE (LOWER(ss.custom_domain) = ${d} OR LOWER(ss.custom_domain) = ${"www." + d})
 AND sc.path <> '__vya_custom_css__'
 LIMIT 1
 `) as { slug: string }[];
 slug = rows[0]?.slug ?? null;
 }
 } catch (e) {
 console.error("capturedSlugForDomain failed:", e instanceof Error ? e.message : e);
 slug = null; // any failure → fall back to the block storefront
 }
 cache.set(d, { slug, at: Date.now() });
 return slug;
}

// Edge-safe: has this store brought its own site over, or is its storefront built from sections?
//
// Both are served from the store's own origin ({slug}.vyasites.com) — a captured site from
// /site/{slug}, a built one from /s/{slug} — so the middleware has to know which before it can
// rewrite. Cached like the domain lookup above: a store rarely changes which kind it is, and the
// answer is needed on every page view of every storefront.
const captureCache = new Map<string, { has: boolean; at: number }>();

export async function storeHasCapture(slug: string): Promise<boolean> {
 const s = (slug || "").toLowerCase().trim();
 if (!s) return false;
 const hit = captureCache.get(s);
 if (hit && Date.now() - hit.at < TTL_MS) return hit.has;

 let has = false;
 try {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
   const sql = neon(url);
   // The same `path <> '__vya_custom_css__'` guard the domain lookup uses: that row is a settings
   // blob, not a page, so a store with only that row has no captured site.
   const rows = (await sql`
    SELECT 1 FROM site_captures WHERE store_slug = ${s} AND path <> '__vya_custom_css__' LIMIT 1
   `) as unknown[];
   has = rows.length > 0;
  }
 } catch (e) {
  console.error("storeHasCapture failed:", e instanceof Error ? e.message : e);
  // A failure must not black-hole a live storefront. Captured sites are the older, more fragile
  // path, so falling back to it on an unknown is the safer wrong answer.
  has = true;
 }
 captureCache.set(s, { has, at: Date.now() });
 return has;
}
