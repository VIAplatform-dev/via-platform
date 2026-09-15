import { extractSizeFromTitle, GENERIC_CLOTHING_SIZE } from "./shopifyClient";

export type SquarespaceProduct = {
 title: string;
 price: number;
 compareAtPrice: number | null;
 image: string | null;
 images: string[];
 externalUrl: string;
 store: string;
 description: string | null;
 size: string | null;
};

export type SquarespaceResult = {
 products: SquarespaceProduct[];
 skippedCount: number;
};

type SquarespaceVariant = {
 price: number;
 salePrice: number;
 onSale: boolean;
 unlimited: boolean;
 qtyInStock: number;
};

type SquarespaceGalleryItem = {
 assetUrl?: string;
};

type SquarespaceItem = {
 title?: string;
 fullUrl?: string;
 urlId?: string;
 assetUrl?: string;
 items?: SquarespaceGalleryItem[];
 variants?: SquarespaceVariant[];
 tags?: string[];
 body?: string;
 excerpt?: string;
};

/** True if HTML contains real visible text (ignores empty <p> placeholder tags). */
function htmlHasText(html: string | null | undefined): boolean {
 if (!html) return false;
 return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim().length > 0;
}

/** Strip Squarespace's injected <style>/<script> blocks from a product body. */
function cleanProductBody(html: string | null | undefined): string | null {
 if (!html) return null;
 const cleaned = html
 .replace(/<style[\s\S]*?<\/style>/gi, "")
 .replace(/<script[\s\S]*?<\/script>/gi, "")
 .trim();
 return cleaned || null;
}

/**
 * Some Squarespace stores leave the collection `excerpt`/`body` empty and keep the
 * real description only on the individual product page. Fetch that page's JSON
 * and return its cleaned body when the collection had no usable text.
 */
async function fetchSquarespaceProductBody(externalUrl: string): Promise<string | null> {
 try {
 const url = externalUrl.replace(/\?.*$/, "") + "?format=json";
 const res = await fetch(url, {
 headers: { "User-Agent": "VYA-Sync/1.0", Accept: "application/json" },
 });
 if (!res.ok) return null;
 const data = await res.json();
 const item = data.item ?? (Array.isArray(data.items) ? data.items[0] : null);
 const body = cleanProductBody(item?.body);
 return body && htmlHasText(body) ? body : null;
 } catch {
 return null;
 }
}

const SS_SIZE_VALUE = `(?:US|UK|EU|IT)?\\s*\\d[\\d.]*|XS|S|M|L|XL|XXL|2XL|3XL|XXXL|OS|OSFM|One\\s+Size`;

/** Extract size from Squarespace tags (e.g. "size-m", "xl", "us-8") */
function extractSizeFromTags(tags: string[]): string | null {
 for (const tag of tags) {
 const t = tag.trim();
 // "size-m", "size:xl", "size 38"
 const tagMatch = /^size[-:\s](.+)$/i.exec(t);
 if (tagMatch) return tagMatch[1].trim().toUpperCase();
 // Bare letter sizes
 if (/^(xs|s|m|l|xl|xxl|2xl|3xl|xxxl|os|osfm)$/i.test(t)) return t.toUpperCase();
 }
 return null;
}

/** Extract size from title or description text */
function extractSizeFromText(text: string | null): string | null {
 if (!text) return null;
 const plain = text.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
 // Parenthesized: "(Size M)"
 const parenMatch = /\(\s*(?:size|sz)\s*:?\s*([^)]+)\)/i.exec(plain);
 if (parenMatch) return parenMatch[1].trim();
 // "Size: M", "Tagged size: 38", "Size M" at end, etc.
 const re = new RegExp(
 `(?:tagged\\s+size|labeled\\s+size|marked\\s+size|size)\\s*:?\\s*(${SS_SIZE_VALUE})`,
 "i"
 );
 const match = re.exec(plain);
 if (match) return match[1].trim();
 return null;
}

/**
 * Checks if a product appears to be sold out based on title or tags.
 * Variant stock is only trusted when the store actually tracks inventory,
 * detected at the caller level via `trustVariantStock`.
 */
function isSoldOut(item: SquarespaceItem, trustVariantStock: boolean): boolean {
 const title = (item.title || "").toLowerCase();
 const tags = (item.tags || []).map((t) => t.toLowerCase());

 const soldPatterns = [
 /\bsold\b/,
 /\bsold\s*out\b/,
 /\bout\s*of\s*stock\b/,
 /\bunavailable\b/,
 /\bno\s*longer\s*available\b/,
 /\[sold\]/,
 /\(sold\)/,
 ];

 if (soldPatterns.some((p) => p.test(title))) return true;
 if (tags.some((t) => soldPatterns.some((p) => p.test(t)))) return true;

 // Variant stock check, only meaningful for stores that actually track inventory.
 // Some Squarespace stores leave qtyInStock at 0 across the board and rely on the
 // title/tags to indicate sold status. Trusting qtyInStock there would hide every product.
 if (trustVariantStock) {
 const variants = item.variants || [];
 if (
  variants.length > 0 &&
  variants.every((v) => !v.unlimited && v.qtyInStock === 0)
 ) {
  return true;
 }
 }

 return false;
}

/**
 * Fetches and parses products from a Squarespace store's JSON API.
 * Uses the ?format=json endpoint which includes commerce data (prices, stock).
 * @param shopUrl - The store's shop page URL (e.g., "https://www.leivintage.com/shop")
 * @param storeName - The store name to tag products with
 */
export async function parseSquarespaceJSON(
 shopUrl: string,
 storeName: string
): Promise<SquarespaceResult> {
 const baseJsonUrl = shopUrl.replace(/\?.*$/, "") + "?format=json";
 const products: SquarespaceProduct[] = [];
 let skippedCount = 0;

 // Derive base URL from the shop URL (e.g., "https://www.leivintage.com")
 const baseUrl = new URL(shopUrl).origin;

 // Pass 1: fetch all items from all pages
 const allItems: SquarespaceItem[] = [];
 const seenTitles = new Set<string>();
 let offset = 0;
 let totalFetched = 0;

 while (true) {
 const jsonUrl = offset === 0 ? baseJsonUrl : `${baseJsonUrl}&offset=${offset}`;

 const response = await fetch(jsonUrl, {
 headers: {
 "User-Agent": "VYA-Sync/1.0",
 Accept: "application/json",
 },
 });

 if (!response.ok) {
 throw new Error(
 `Failed to fetch Squarespace JSON: ${response.status} ${response.statusText}`
 );
 }

 const data = await response.json();
 const items: SquarespaceItem[] = data.items || [];

 if (items.length === 0) break;

 totalFetched += items.length;
 let newItemsOnPage = 0;

 for (const item of items) {
 const title = item.title?.trim();
 if (!title) continue;
 if (seenTitles.has(title)) continue;
 seenTitles.add(title);
 newItemsOnPage++;
 allItems.push(item);
 }

 if (newItemsOnPage === 0) break;
 offset = totalFetched;
 }

 // Detect whether the store actually tracks variant inventory.
 // If every variant across the entire catalog has qtyInStock === 0 and !unlimited,
 // the store isn't using inventory tracking. Fall back to title/tag sold detection only.
 const trustVariantStock = allItems.some((item) =>
 (item.variants || []).some((v) => v.unlimited || (v.qtyInStock ?? 0) > 0)
 );

 // Pass 2: transform items into products
 for (const item of allItems) {
 const title = item.title?.trim();
 if (!title) continue;

 // Get price from first variant (Squarespace stores prices in cents)
 const variant = item.variants?.[0];
 if (!variant) continue;

 const price = (variant.onSale ? variant.salePrice : variant.price) / 100;
 const compareAtPrice = variant.onSale ? variant.price / 100 : null;
 if (price <= 0) continue;

 // Skip sold-out items
 if (isSoldOut(item, trustVariantStock)) {
 skippedCount++;
 continue;
 }

 // Build full URL
 const path = item.fullUrl || (item.urlId ? `/shop/p/${item.urlId}` : null);
 if (!path) continue;
 const externalUrl = path.startsWith("http") ? path : `${baseUrl}${path}`;

 // Image URLs. Gallery sub-items (items[].assetUrl) are proper image URLs.
 // item.assetUrl can be a non-image container URL on some Squarespace stores,
 // so always prefer gallery images and only fall back to assetUrl if empty.
 const galleryUrls = (item.items || [])
 .map((gi: { assetUrl?: string }) => gi.assetUrl)
 .filter((url): url is string => !!url);
 const fallbackAsset = (item.assetUrl && /\.(jpe?g|png|gif|webp)/i.test(item.assetUrl))
 ? item.assetUrl
 : null;
 const images = galleryUrls.length > 0 ? galleryUrls : (fallbackAsset ? [fallbackAsset] : []);
 const image = images[0] || null;

 // Product description (HTML body from Squarespace). Some stores leave the
 // collection excerpt empty (just placeholder <p> tags) and keep the real text
 // on the product page. Fetch that page's body when there's nothing usable here.
 let description = item.body || item.excerpt || null;
 if (!htmlHasText(description)) {
 const fetched = await fetchSquarespaceProductBody(externalUrl);
 if (fetched) description = fetched;
 }

 // Extract size. Priority mirrors the Shopify sync: a SPECIFIC size (numeric /
 // EU / UK) always beats a GENERIC letter. A "size-m" tag must NOT override a real
 // size in the title. E.g. shoes titled "...Mules (37.5)" were getting a bogus
 // "M" from a tag. Use the shared title extractor (it reads bare parentheticals
 // like "(37.5)", which extractSizeFromText, needing the word "size". Misses).
 const sizeFromTags = extractSizeFromTags(item.tags || []);
 const tagsGeneric = !!sizeFromTags && GENERIC_CLOTHING_SIZE.test(sizeFromTags);
 const sizeFromTitle = extractSizeFromTitle(title) ?? extractSizeFromText(title);
 const size =
 (sizeFromTags && !tagsGeneric ? sizeFromTags : null) // specific tag
 ?? sizeFromTitle // then the title (incl. EU shoe sizes)
 ?? (tagsGeneric ? sizeFromTags : null) // generic tag only if nothing better
 ?? extractSizeFromText(description);

 products.push({ title, price, compareAtPrice, image, images, externalUrl, store: storeName, description, size });
 }

 return { products, skippedCount };
}
