import type { CategorySlug } from "./categoryMap";
import { getAllProducts, type DBProduct } from "./db";
import { inferCategoryFromTitle, inferBrandFromTitle } from "./loadStoreProducts";
import { brandMap } from "./brandData";
import { extractSizeFromTitle, extractSizeFromDescription, extractTaggedSizeFromDescription, extractFitSizeFromDescription, extractFitLetterFromDescription, extractUSConversionFromDescription, isValidSizeValue, GENERIC_CLOTHING_SIZE } from "./shopifyClient";


// Pure size helpers moved to ./sizeUtils (no db import) so Client Components can use them without
// dragging the server-only chain into the browser bundle. Re-exported here for existing importers.
import { SHOE_RE, convertSizeToUS, normalizeSize, expandSizeKeys, sortSizes } from "./sizeUtils";
export { convertSizeToUS, normalizeSize, expandSizeKeys, sortSizes };

export type InventoryItem = {
 id: string;
 title: string;
 category: CategorySlug;
 brand: string | null;
 brandLabel: string | null;
 price: number;
 currency?: string;
 compareAtPrice?: number | null;
 image: string;
 images: string[];
 store: string;
 storeSlug: string;
 externalUrl?: string;
 syncedAt?: string;
 createdAt?: string;
 size?: string | null;
 imageColor?: string | null; // colour read off the image by vision (normalized)
};

// Parse images JSON from DB, falling back to single image
function parseImages(product: DBProduct): string[] {
 if (product.images) {
 try {
 const parsed = JSON.parse(product.images);
 if (Array.isArray(parsed) && parsed.length > 0) return parsed;
 } catch {}
 }
 return product.image ? [product.image] : [];
}

/**
 * Derive the best size for a product. The SELLER'S OWN DESCRIPTION wins — what
 * they wrote about fit/size is trusted over the listing title and the raw
 * Shopify variant size. Priority:
 * 0. Seller US fit note in description — "runs true to a 6", "fits like a 6.5"
 * 1. Tagged/labeled/marked size in description — "Tagged size: EU 38"
 * 2. Any explicit size in the description — "Size: 4", "EU 38", "fits XS"
 * 3. Title extraction — size written in the listing title (e.g. "Dress – M")
 * 4. Non-generic DB size — Shopify variant (numeric / EU/UK prefixed)
 * 5. Measurements fallback (bust/waist → S/M/L)
 * 6. Generic DB size (S/M/L) — last resort
 *
 * Exported so it can be used by server components that work directly with DBProduct
 * (NewArrivalsSection, new-arrivals page, account favorites, etc.)
 */
// Some stores write the size as a bare token on the first non-empty line of the
// description ("38 1/2" for a shoe, "8" or "M" for clothing) with no "Size:" label.
// Bare numbers are normally skipped to avoid false positives (a "2001" in a title is
// a year), but a SHORT first line that IS just a size — and in shoe range for
// footwear — is almost certainly the real size.
// Squarespace (and some Shopify) descriptions are HTML — often entity-encoded
// ("&lt;p&gt;38&lt;/p&gt;"). Decode entities, turn block tags into line breaks (so a size on
// its own paragraph becomes its own line), and strip the rest. Plain text passes through.
function htmlToText(html: string | null | undefined): string | null {
 if (!html) return null;
 if (!/[<&]/.test(html)) return html;
 let s = html;
 for (let i = 0; i < 2; i++) {
 s = s
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
  .replace(/&nbsp;/gi, " ").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"');
 }
 s = s.replace(/<\/(p|div|li|h[1-6])>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
 return s.replace(/[ \t]+/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

function extractLeadingSizeFromDescription(description: string | null | undefined, title: string): string | null {
 const lines = (description || "").split(/[\n\r]+/).map((l) => l.trim()).filter((l) => l.length > 0);
 const isShoe = SHOE_RE.test(title) || SHOE_RE.test(inferCategoryFromTitle(title));
 // Many stores put the size on its own line/paragraph with no "Size:" label. Scan the first
 // few lines for a bare size token; for shoes accept the footwear range AND look a few lines
 // in (the size often isn't line 1 — e.g. "sunflower & star details" then "37").
 for (const line of lines.slice(0, isShoe ? 4 : 1)) {
 if (line.length > 8) continue;
 const norm = line.replace("½", " 1/2");
 const numeric = norm.match(/^(\d{1,2})(?:\s?1\/2|\.5)?$/);
 if (numeric) {
  const n = parseInt(numeric[1], 10);
  const value = /1\/2|\.5/.test(norm) ? `${n}.5` : String(n);
  if (isShoe) { if (n >= 4 && n <= 48) return value; continue; }
  if (n >= 0 && n <= 24) return value;
  continue;
 }
 if (/^(XXS|XS|S|M|L|XL|XXL|XXXL)$/i.test(line)) return line.toUpperCase();
 }
 return null;
}

export function deriveSize(product: DBProduct): string | null {
 const result = deriveSizeInner(product);
 // Shoes NEVER use letter sizes (S/M/L) — footwear is numeric, and a letter here
 // is almost always a stray clothing tag/variant or a false-positive description
 // match (e.g. the "M" in "Size: Marked 36"). Prefer a real numeric size from the
 // title; only show nothing if there genuinely isn't one.
 if (result && GENERIC_CLOTHING_SIZE.test(result.trim()) && SHOE_RE.test(inferCategoryFromTitle(product.title))) {
 const fromTitle = extractSizeFromTitle(product.title);
 if (fromTitle && !GENERIC_CLOTHING_SIZE.test(fromTitle.trim())) return fromTitle;
 return null;
 }
 return result;
}

function deriveSizeInner(product: DBProduct): string | null {
 const dbSize = product.size && isValidSizeValue(product.size) ? product.size : null;
 const isGenericDb = dbSize != null && GENERIC_CLOTHING_SIZE.test(dbSize);
 // Descriptions can be HTML (esp. Squarespace) — clean to text once so every extractor
 // below reads the actual words, not the "<p>" tags.
 const desc = htmlToText(product.description);

 // 0. Explicit seller US fit note ("runs true to a 6", "fits like a 6.5") — the
 // seller telling a US buyer what to order, so it beats a marked EU tag size.
 const fitSize = extractFitSizeFromDescription(desc);
 if (fitSize) return fitSize;

 // 0b. Explicit seller LETTER fit ("Best Fit M - XL") — same authority: the
 // seller's stated fit wins over a marked numeric/IT tag, so we show "M-XL"
 // (which filters under M, L and XL) instead of converting IT 54 → "US 18".
 const fitLetter = extractFitLetterFromDescription(desc);
 if (fitLetter) return fitLetter;

 // 0c. Explicit US size from a conversion table the seller wrote ("UK 10 / EU 40 /
 // US 6"). The seller's own US number is authoritative — it beats formula-converting
 // the EU/UK tag (generic EU−32 would wrongly show US 8 for this EU 40 = US 6 piece).
 const usConversion = extractUSConversionFromDescription(desc);
 if (usConversion) return usConversion;

 // 1. Tagged/labeled/marked size in description — most authoritative (actual garment tag)
 // Must run before title/DB to prevent "Size: Large [store bucket]" from winning
 // over "Tagged size: XS [actual tag]" that appears later in the description.
 const taggedSize = extractTaggedSizeFromDescription(desc);
 if (taggedSize) return taggedSize;

 // 2. Any explicit size the seller wrote in the description ("Size: 4",
 // "EU 38", "fits XS"). The seller's own words take precedence over the
 // listing title and the raw Shopify variant size.
 const sizeFromDesc = extractSizeFromDescription(desc);
 if (sizeFromDesc) return sizeFromDesc;

 // 2b. A bare size written as the first line of the description ("38 1/2", "8",
 // "M") — many stores label it this way with no "Size:" prefix. Beats the title.
 const leadingSize = extractLeadingSizeFromDescription(desc, product.title);
 if (leadingSize) return leadingSize;

 // 3. Title — explicit size in the listing title
 const sizeFromTitle = extractSizeFromTitle(product.title);
 if (sizeFromTitle) return sizeFromTitle;

 // 4. Non-generic DB size (Shopify variant — numeric, EU/UK prefixed)
 if (dbSize && !isGenericDb) return dbSize;

 // 5. Generic DB size (S/M/L variant the store set) as last resort.
 // NOTE: we deliberately do NOT infer a size from measurements (bust/waist →
 // S/M/L). If the seller never stated a size, we add none — vintage sizing is
 // too inconsistent to guess, and a wrong size loses sales.
 return dbSize;
}

/**
 * The size shoppers actually SEE and FILTER by — deriveSize, then converted to a
 * US label the same way the product page displays it (so "IT 38" → "US 2",
 * "EU 36" → "US 4", a clothing "40" → "US 8"). Letter sizes, already-US sizes,
 * and ranges pass through unchanged. This is the single source for the size on
 * cards, grids, and the size_keys index — keeping "what you see" === "what you
 * filter". Without this the grid filtered the raw tag (38) while the page showed
 * the conversion (US 2), so the item never matched a US-size filter.
 */
export function deriveDisplaySize(product: DBProduct): string | null {
 const raw = deriveSize(product);
 if (!raw) return null;
 const categorySlug = inferCategoryFromTitle(product.title);
 return convertSizeToUS(raw, categorySlug, product.title, product.currency) ?? raw;
}

// Transform database products to InventoryItem format
function transformDBProduct(product: DBProduct): InventoryItem {
 const brandSlug = inferBrandFromTitle(product.title);
 return {
 id: `${product.store_slug}-${product.id}`,
 title: product.title,
 category: inferCategoryFromTitle(product.title),
 brand: brandSlug,
 brandLabel: brandSlug ? (brandMap[brandSlug] ?? null) : null,
 price: Number(product.price),
 currency: product.currency || "USD",
 compareAtPrice: product.compare_at_price != null ? Number(product.compare_at_price) : null,
 image: product.image ?? "/placeholder.jpg",
 images: parseImages(product),
 imageColor: product.image_color ?? null,
 store: product.store_name,
 storeSlug: product.store_slug,
 externalUrl: product.external_url ?? undefined,
 syncedAt: product.synced_at instanceof Date
 ? product.synced_at.toISOString()
 : String(product.synced_at),
 createdAt: product.created_at instanceof Date
 ? product.created_at.toISOString()
 : product.created_at
 ? String(product.created_at)
 : undefined,
 size: deriveDisplaySize(product),
 };
}

/**
 * Fetch all inventory from the database.
 */
export async function getInventory(): Promise<InventoryItem[]> {
 try {
 const products = await getAllProducts();
 return products.map(transformDBProduct);
 } catch (error) {
 console.error("Failed to fetch inventory from database:", error);
 return [];
 }
}

// Legacy export for backwards compatibility (returns empty array, use getInventory() instead)
export const inventory: InventoryItem[] = [];
