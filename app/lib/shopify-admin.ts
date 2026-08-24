// ───────────────────────────────────────────────────────────────────────────
// Shopify Admin API client. Shopify is migrating every store to the new Dev
// Dashboard, which issues an ADMIN API token (shpat_…) rather than a Storefront
// token. The Admin API also (a) works on password-protected stores and (b) gives
// exact, structured product data — so it's our preferred Shopify import path.
// Read-only: we only ever query products/shop.
// ───────────────────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedProduct } from "./store-import.ts";
import { formatPrice } from "./formatPrice.ts";

const API_VERSION = "2024-10";

function adminEndpoint(shop: string): string {
 const host = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
 return `https://${host}/admin/api/${API_VERSION}/graphql.json`;
}

/** Admin tokens start with shpat_ (Dev Dashboard / custom-app install token). */
export function isAdminToken(token: string): boolean {
 return /^shpat_/.test((token || "").trim());
}

export async function adminQuery(shop: string, token: string, query: string, variables?: any): Promise<any> {
 const res = await fetch(adminEndpoint(shop), {
 method: "POST",
 headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
 body: JSON.stringify({ query, variables }),
 signal: AbortSignal.timeout(20000),
 });
 if (res.status === 401 || res.status === 403) throw new Error("Token rejected — make sure the app has read_products and is installed on the store.");
 if (res.status === 404) throw new Error("Store not found — use your .myshopify.com domain (e.g. your-store.myshopify.com).");
 const json = await res.json().catch(() => ({}));
 if (json.errors) throw new Error(Array.isArray(json.errors) ? json.errors[0]?.message || "Admin API error" : json.errors.message || "Admin API error");
 return json.data;
}

export async function adminVerify(shop: string, token: string): Promise<{ ok: boolean; shopName?: string; error?: string }> {
 try {
 const d = await adminQuery(shop, token, `{ shop { name } }`);
 return { ok: true, shopName: d?.shop?.name };
 } catch (e: any) {
 return { ok: false, error: e?.message || "Couldn’t connect." };
 }
}

// `handle` and variant ids are the store's OWN identity for each product — the importer matches on
// them so a re-sync updates rather than duplicates. `collections` comes back with the product, so a
// connected store gets exact category membership instead of us scraping each collection page.
// Variants are fetched in full (not just the first) so multi-size listings survive.
const PRODUCTS_QUERY = `query($cursor: String) {
 products(first: 50, after: $cursor, query: "status:active") {
 edges { cursor node {
 id handle title descriptionHtml totalInventory tags onlineStoreUrl
 options { name values }
 featuredImage { url }
 images(first: 12) { edges { node { url } } }
 variants(first: 50) { edges { node { id title price availableForSale selectedOptions { name value } } } }
 collections(first: 25) { edges { node { handle } } }
 } }
 pageInfo { hasNextPage }
 }
}`;

/** Map ONE product node from the Admin API into an ImportedProduct.
 *
 *  Split out from the paging loop so it can be unit-tested without a live store token — a
 *  connected store is supposed to import BETTER than a scraped one (exact prices, real currency,
 *  full size runs, true collection membership), so this mapping is worth pinning down. */
export function adminProductToImported(n: any, currency: string): ImportedProduct {
 const imgs: string[] = (n.images?.edges || []).map((i: any) => i.node?.url).filter(Boolean);
 const img = n.featuredImage?.url || imgs[0] || "";
 const amount = parseFloat(n.variants?.edges?.[0]?.node?.price || "0");
 const sizeOpt = (n.options || []).find((o: any) => /size/i.test(o.name));
 const desc = n.descriptionHtml ? String(n.descriptionHtml).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000) : null;
 // The full size run, not just the first variant — reproduction-vintage sellers list one style
 // across a dozen sizes, and a single price+size can't represent that.
 const optionValue = (v: any, re: RegExp) => (v?.selectedOptions || []).find((o: any) => re.test(String(o?.name || "")))?.value ?? null;
 const variants = (n.variants?.edges || []).map((ve: any) => {
  const v = ve?.node || {};
  const vp = parseFloat(v.price || "0");
  return {
   sourceVariantId: v.id ? String(v.id) : null,
   size: optionValue(v, /size/i) ?? (v.title && v.title !== "Default Title" ? v.title : null),
   color: optionValue(v, /colou?r/i),
   priceCents: Number.isFinite(vp) && vp > 0 ? Math.round(vp * 100) : null,
   available: v.availableForSale !== false,
  };
 });
 return {
  name: String(n.title || "").trim(),
  price: amount > 0 ? formatPrice(amount, currency) : "",
  image: img,
  images: imgs.length ? imgs : img ? [img] : [],
  description: desc,
  size: sizeOpt?.values?.length ? sizeOpt.values.join(", ") : null,
  available: (n.totalInventory ?? 1) > 0,
  tags: Array.isArray(n.tags) ? n.tags.map((t: any) => String(t)).filter(Boolean) : [],
  // Money as numbers plus the shop's OWN currency code, so a connected store never depends on
  // parsing a formatted price back into cents.
  priceCents: amount > 0 ? Math.round(amount * 100) : null,
  currency,
  variants,
  // The store's own identity for this product, so a re-sync matches instead of duplicating.
  sourcePlatform: "shopify",
  sourceId: n.handle ? String(n.handle) : n.id ? String(n.id) : null,
  sourceUrl: n.onlineStoreUrl ? String(n.onlineStoreUrl) : null,
  // Exact collection membership, straight from the API — no scraping each collection page.
  collectionHandles: (n.collections?.edges || []).map((c: any) => c?.node?.handle).filter(Boolean),
 };
}

/** Pull the store's active products as ImportedProduct[] via the Admin API. */
export async function adminGetProducts(shop: string, token: string): Promise<ImportedProduct[]> {
 let currency = "USD";
 try { const s = await adminQuery(shop, token, `{ shop { currencyCode } }`); if (s?.shop?.currencyCode) currency = s.shop.currencyCode; } catch { /* default USD */ }

 const out: ImportedProduct[] = [];
 let cursor: string | undefined;
 for (let page = 0; page < 40; page++) {
  const d = await adminQuery(shop, token, PRODUCTS_QUERY, { cursor });
  const edges = d?.products?.edges || [];
  for (const e of edges) out.push(adminProductToImported(e.node, currency));
  cursor = edges.length ? edges[edges.length - 1].cursor : undefined;
  if (!d?.products?.pageInfo?.hasNextPage) break;
 }
 return out.filter((p) => p.name && p.image);
}

export type AdminPage = { title: string; handle: string; body: string };

/** The store's Online Store content pages (About, FAQ, …) via the Admin REST API
 * (read_content). Exact, and works behind a storefront password. */
export async function adminGetPages(shop: string, token: string): Promise<AdminPage[]> {
 const host = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
 const res = await fetch(`https://${host}/admin/api/${API_VERSION}/pages.json?limit=50&published_status=published`, {
 headers: { "X-Shopify-Access-Token": token },
 signal: AbortSignal.timeout(15000),
 });
 if (!res.ok) return [];
 const j = await res.json().catch(() => ({}));
 return (j.pages || []).map((p: any) => ({ title: String(p.title || "").trim(), handle: String(p.handle || "").trim(), body: String(p.body_html || "") })).filter((p: AdminPage) => p.title);
}

/** Strip a Shopify page's HTML body down to readable text for a VYA text section. */
export function htmlToText(html: string): string {
 return (html || "")
 .replace(/<br\s*\/?>/gi, "\n")
 .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
 .replace(/<li[^>]*>/gi, "• ")
 .replace(/<[^>]+>/g, " ")
 .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
 .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n")
 .trim().slice(0, 4000);
}
