// The extraction ladder: ordered strategies for getting products out of ANY storefront.
//
// Each rung is tried in turn and the first that returns products wins, so a platform we know well
// uses its own clean feed while an unknown one still imports through generic signals. Nothing here
// is Shopify-specific — Shopify is just one rung among several (see store-import.ts for its feed
// and Squarespace's).
//
//   1. native feed        — the platform publishes structured products (Shopify, Squarespace, Woo)
//   2. sitemap + JSON-LD  — no feed, but every product page carries schema.org markup
//                           (BigCommerce, Webflow, most custom server-rendered stores)
//   3. embedded state     — the page is a JS app but ships its data inline (Remix/Next/Nuxt)
//   4. decline            — nothing readable; say so and offer CSV / a platform connection
//
// Every fetch goes through safeFetch (SSRF guard + per-hop redirect revalidation) and is bounded,
// so one huge catalog can't turn a single import into thousands of outbound requests.

import { safeFetch } from "../safe-url.ts";
import { parseLooseJson } from "../shopifyClient.ts";
import type { ImportedProduct } from "../store-import.ts";
import type { PlatformId } from "./detect.ts";

// The same browser User-Agent the site capture uses. A bare "VYA-Importer/1.0" is blocked outright
// (403) by common WordPress/Cloudflare bot rules — including on a store whose own public Store API
// serves the data fine to a normal client — so an honest-but-unknown UA just makes imports fail for
// sellers importing their OWN shop. If a site still refuses, we decline and say so rather than
// trying to work around the block.
const UA = {
 "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
 Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
};

/** Thrown when a store actively refuses automated requests, so the caller can explain rather than
 *  silently importing nothing. */
export class BlockedByStoreError extends Error {
 // Explicit fields, not TS parameter properties: Node's type-stripping runs this file directly
 // (that's how these rungs get unit-tested) and rejects parameter-property syntax.
 status: number;
 url: string;
 constructor(status: number, url: string) {
  super(`The store refused our request (HTTP ${status}).`);
  this.name = "BlockedByStoreError";
  this.status = status;
  this.url = url;
 }
}
const LIMITS = {
 sitemapUrls: 400, // product URLs we'll follow from a sitemap
 concurrency: 4, // parallel fetches against ONE store — polite, and enough to be quick
 pageTimeoutMs: 12000,
 maxBytesPerPage: 2_000_000,
};

/** Run `fn` over `items` with a fixed concurrency cap (no external dependency). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
 const out: R[] = new Array(items.length);
 let next = 0;
 await Promise.all(
  Array.from({ length: Math.min(limit, items.length) }, async () => {
   while (next < items.length) {
    const i = next++;
    try { out[i] = await fn(items[i]); } catch { /* one bad page must not fail the import */ }
   }
  }),
 );
 return out.filter((x) => x !== undefined);
}

/** Fetch text with a size ceiling, so a pathological page can't exhaust the invocation. */
async function fetchTextCapped(url: string, opts?: { flagBlocks?: boolean }): Promise<string | null> {
 try {
  const r = await safeFetch(url, { headers: UA, signal: AbortSignal.timeout(LIMITS.pageTimeoutMs) });
  // 403/429 mean "we see you and we're saying no" — distinct from a 404, and worth surfacing.
  if (opts?.flagBlocks && (r.status === 403 || r.status === 429)) throw new BlockedByStoreError(r.status, url);
  if (!r.ok) return null;
  const text = await r.text();
  return text.length > LIMITS.maxBytesPerPage ? text.slice(0, LIMITS.maxBytesPerPage) : text;
 } catch (e) {
  if (e instanceof BlockedByStoreError) throw e;
  return null;
 }
}

// ── Rung 1b: WooCommerce ────────────────────────────────────────────────────────────────────
// Woo ships a PUBLIC Store API (no key) that is as clean as Shopify's feed — names, prices with an
// explicit currency code and minor-unit exponent, images, stock, and variation ids. It's the single
// biggest coverage win outside Shopify, and it was never wired up.

type WooPrices = { price?: string; currency_code?: string; currency_minor_unit?: number };
type WooProduct = {
 id?: number; name?: string; permalink?: string; slug?: string;
 description?: string; short_description?: string;
 prices?: WooPrices; is_in_stock?: boolean;
 images?: { src?: string }[];
 variations?: unknown[];
};

/** Money from Woo's Store API. Prices are integers in minor units with an explicit exponent
 *  ("2495" with minor_unit 2 = 24.95), so no float parsing or currency guessing is needed. */
function wooCents(p?: WooPrices): number | null {
 if (!p?.price) return null;
 const raw = Number(p.price);
 if (!Number.isFinite(raw)) return null;
 const minor = typeof p.currency_minor_unit === "number" ? p.currency_minor_unit : 2;
 // Normalise whatever exponent the store uses to cents (JPY has 0, most have 2).
 return Math.round(raw * Math.pow(10, 2 - minor));
}

export async function fetchWooProducts(origin: string, max = 1500): Promise<ImportedProduct[]> {
 const out: ImportedProduct[] = [];
 for (let page = 1; page <= 20 && out.length < max; page++) {
  const text = await fetchTextCapped(`${origin}/wp-json/wc/store/v1/products?per_page=100&page=${page}`, { flagBlocks: page === 1 });
  if (!text) break;
  let list: WooProduct[];
  try { list = parseLooseJson(text); } catch { break; }
  if (!Array.isArray(list) || !list.length) break;
  for (const p of list) {
   const name = (p.name || "").trim();
   const cents = wooCents(p.prices);
   const images = (p.images || []).map((i) => i.src || "").filter(Boolean);
   if (!name || !cents || !images.length) continue;
   out.push({
    name,
    price: "", // display string is derived downstream from priceCents + currency
    priceCents: cents,
    currency: p.prices?.currency_code || null,
    image: images[0],
    images: images.slice(0, 8),
    description: (p.description || p.short_description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null,
    available: p.is_in_stock !== false,
    sourcePlatform: "woocommerce",
    sourceId: p.id != null ? String(p.id) : p.slug || null,
    sourceUrl: p.permalink || null,
   });
   if (out.length >= max) break;
  }
  if (list.length < 100) break;
 }
 return out;
}

// ── Rung 2: sitemap + JSON-LD ───────────────────────────────────────────────────────────────
// For platforms with no public feed. Product pages almost always carry schema.org Product markup
// (search engines require it), so the sitemap tells us WHICH pages are products and the JSON-LD on
// each tells us what they contain. Slower than a feed — one request per product — hence the caps.

/** Where each platform publishes its product URLs. Tried in order; the first that parses wins. */
export function sitemapCandidates(origin: string, platform: PlatformId): string[] {
 const common = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
 switch (platform) {
  // BigCommerce's entry point is the bare xmlsitemap.php INDEX; it lists "?type=products&page=N"
  // children. Requesting ?type=products directly returns an empty document.
  case "bigcommerce": return [`${origin}/xmlsitemap.php`, ...common];
  case "woocommerce":
  case "wordpress": return [`${origin}/wp-sitemap.xml`, `${origin}/product-sitemap.xml`, ...common];
  case "shopify": return [`${origin}/sitemap.xml`];
  default: return common;
 }
}

const locsIn = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&").trim());

/** Collect product URLs from a store's sitemap(s), following one level of sitemap-index nesting. */
export async function discoverProductUrls(origin: string, platform: PlatformId, max = LIMITS.sitemapUrls): Promise<string[]> {
 // Path-shape heuristic for GENERIC sitemaps only. Plenty of platforms (BigCommerce especially)
 // publish products at the site root — "/1950s-silk-dress/" — so requiring a "/products/" segment
 // found nothing at all on those stores.
 const looksLikeProduct = (u: string) => /\/(products?|shop|item|listing)\//i.test(u);
 const isProductSitemap = (u: string) => /type=products?|product[-_]sitemap|sitemap[-_]products?/i.test(u);
 const found = new Set<string>();
 for (const sm of sitemapCandidates(origin, platform)) {
  const xml = await fetchTextCapped(sm);
  if (!xml || !xml.includes("<loc>")) continue;
  const locs = locsIn(xml);
  // A sitemap index points at more sitemaps; follow the ones that look product-related.
  const nested = locs.filter((u) => /\.xml|xmlsitemap\.php/i.test(u) && /product|item|shop/i.test(u)).slice(0, 12);
  for (const child of nested) {
   const childXml = await fetchTextCapped(child);
   if (!childXml) continue;
   const takeAll = isProductSitemap(child);
   for (const u of locsIn(childXml)) if (takeAll ? !/\.xml$/i.test(u) : looksLikeProduct(u)) { found.add(u); if (found.size >= max) return [...found]; }
  }
  const takeAllHere = isProductSitemap(sm);
  for (const u of locs) if (takeAllHere ? !/\.xml$|xmlsitemap\.php/i.test(u) : looksLikeProduct(u)) { found.add(u); if (found.size >= max) return [...found]; }
  if (found.size) break;
 }
 return [...found];
}

type JsonLdNode = Record<string, unknown>;

/** Every JSON-LD object on a page, flattened through @graph and arrays. */
export function jsonLdNodes(html: string): JsonLdNode[] {
 const nodes: JsonLdNode[] = [];
 for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  let parsed: unknown;
  try { parsed = parseLooseJson(m[1].trim()); } catch { continue; }
  const push = (v: unknown) => {
   if (!v || typeof v !== "object") return;
   if (Array.isArray(v)) { v.forEach(push); return; }
   const node = v as JsonLdNode;
   nodes.push(node);
   if (Array.isArray(node["@graph"])) (node["@graph"] as unknown[]).forEach(push);
  };
  push(parsed);
 }
 return nodes;
}

const typeOf = (n: JsonLdNode) => {
 const t = n["@type"];
 return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
};

/** Turn a page's schema.org Product markup into an ImportedProduct. Null when the page has none. */
export function productFromJsonLd(html: string, pageUrl: string): ImportedProduct | null {
 const nodes = jsonLdNodes(html);
 const product = nodes.find((n) => typeOf(n).includes("Product"));
 if (!product) return null;
 const name = String(product.name || "").trim();
 if (!name) return null;

 // Offers may be a single object, an array, or an AggregateOffer wrapping more.
 const rawOffers = product.offers;
 const offers: JsonLdNode[] = [];
 const collect = (v: unknown) => {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) { v.forEach(collect); return; }
  const o = v as JsonLdNode;
  offers.push(o);
  if (o.offers) collect(o.offers);
 };
 collect(rawOffers);

 const priced = offers.find((o) => o.price != null || o.lowPrice != null);
 const rawPrice = priced?.price ?? priced?.lowPrice;
 const priceNum = rawPrice != null ? Number(String(rawPrice).replace(/[^0-9.]/g, "")) : NaN;
 const priceCents = Number.isFinite(priceNum) && priceNum > 0 ? Math.round(priceNum * 100) : null;
 const currency = typeof priced?.priceCurrency === "string" ? priced.priceCurrency : null;

 const imgRaw = product.image;
 const images = (Array.isArray(imgRaw) ? imgRaw : [imgRaw])
  .map((i) => (typeof i === "string" ? i : (i && typeof i === "object" ? String((i as JsonLdNode).url || "") : "")))
  .filter(Boolean);

 // schema.org availability is a URL ("https://schema.org/InStock"); match the tail only.
 const availability = String(priced?.availability || "");
 const available = availability ? /InStock|PreOrder|BackOrder|LimitedAvailability/i.test(availability) : true;

 const sku = product.sku != null ? String(product.sku) : null;
 return {
  name,
  price: "",
  priceCents,
  currency,
  image: images[0] || "",
  images: images.slice(0, 8),
  description: typeof product.description === "string" ? product.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : null,
  available,
  sourcePlatform: "jsonld",
  // Prefer the page's own path as identity — it's stable and unique where a SKU may be absent.
  sourceId: sku || new URL(pageUrl).pathname.replace(/\/+$/, "").split("/").pop() || null,
  sourceUrl: pageUrl,
 };
}

/** Rung 2 end to end: find product pages, read their JSON-LD, return what parsed. */
export async function fetchViaJsonLd(origin: string, platform: PlatformId, max = 400): Promise<ImportedProduct[]> {
 const urls = (await discoverProductUrls(origin, platform, max)).slice(0, max);
 if (!urls.length) return [];
 const results = await mapLimit(urls, LIMITS.concurrency, async (u) => {
  const html = await fetchTextCapped(u);
  return html ? productFromJsonLd(html, u) : null;
 });
 return results.filter((p): p is ImportedProduct => Boolean(p && p.name && p.image));
}
