/**
 * Shopify Storefront API Client
 *
 * Fetches products from any Shopify store using their public Storefront API.
 * Requires:
 * - storeDomain: The Shopify store domain (e.g., "mystore.myshopify.com" or custom domain)
 * - storefrontAccessToken: Public Storefront API access token
 */
import { safeFetch } from "./safe-url.ts";
import type { ReadOutcome } from "./feed-completeness";

/** JSON.parse that tolerates the raw control characters real storefronts embed in product
 *  descriptions (every Shopify feed profiled had them; strict parsing rejects the whole payload).
 *  Only the illegal C0 range is stripped — \t, \n and \r are left for JSON's own escaping. */
export function parseLooseJson(text: string): any { // eslint-disable-line @typescript-eslint/no-explicit-any
 try {
  return JSON.parse(text);
 } catch {
  return JSON.parse(text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""));
 }
}

export type ShopifyProduct = {
 title: string;
 price: number | null;
 compareAtPrice: number | null;
 currency: string;
 image: string | null;
 images: string[];
 videoUrl: string | null;
 externalUrl: string;
 store: string;
 vendor: string | null;
 productType: string | null;
 availableForSale: boolean;
 description: string | null;
 variantId: string | null;
 shopifyProductId: string | null;
 size: string | null;
 tags?: string[];
 /** Source identity for the import engine: the product's stable handle, and its full size run. */
 handle?: string | null;
 variants?: { sourceVariantId?: string | null; size?: string | null; color?: string | null; priceCents?: number | null; available: boolean }[];
 // Captured from the product page (scrapeProductPage stores) — the seller's own words.
 condition?: string | null;
 materials?: string | null;
 measurements?: string | null;
};

export type ShopifyFetchResult = {
 products: ShopifyProduct[];
 skippedCount: number;
 /**
  * How the read finished. The import's sold-sweep is only allowed to run on a read that reached the
  * END of the catalogue — see app/lib/feed-completeness.ts. Optional so the other reader in this
  * file (and any caller that does not sweep) need not supply it; absent is treated as "unknown",
  * which refuses the sweep.
  */
 outcome?: ReadOutcome;
};

type ShopifyImageNode = {
 url: string;
 altText: string | null;
};

// Product media (Storefront API). We only care about hosted Video clips, but the
// connection also returns images / external video / 3d models.
type ShopifyMediaNode = {
 mediaContentType: string; // "VIDEO" | "IMAGE" | "EXTERNAL_VIDEO" | "MODEL_3D"
 sources?: Array<{ url: string; mimeType?: string | null }>;
 previewImage?: { url: string } | null;
};

type ShopifyPriceV2 = {
 amount: string;
 currencyCode: string;
};

type ShopifyVariantNode = {
 id: string;
 priceV2: ShopifyPriceV2;
 compareAtPriceV2: ShopifyPriceV2 | null;
 availableForSale: boolean;
 selectedOptions: Array<{ name: string; value: string }>;
};

type ShopifyProductNode = {
 id: string;
 title: string;
 handle: string;
 descriptionHtml: string;
 vendor: string;
 productType: string;
 availableForSale: boolean;
 totalInventory: number;
 tags: string[];
 priceRange: {
 minVariantPrice: ShopifyPriceV2;
 };
 images: {
 edges: Array<{ node: ShopifyImageNode }>;
 };
 media?: {
 edges: Array<{ node: ShopifyMediaNode }>;
 };
 variants: {
 edges: Array<{ node: ShopifyVariantNode }>;
 };
};

type ShopifyProductsResponse = {
 data?: {
 products: {
 edges: Array<{ node: ShopifyProductNode; cursor: string }>;
 pageInfo: {
 hasNextPage: boolean;
 endCursor: string | null;
 };
 };
 };
 errors?: Array<{ message: string }>;
};

// GraphQL query for fetching products
const PRODUCTS_QUERY = `
 query GetProducts($first: Int!, $after: String) {
 products(first: $first, after: $after) {
 edges {
 node {
 id
 title
 handle
 descriptionHtml
 vendor
 productType
 availableForSale
 totalInventory
 tags
 priceRange {
 minVariantPrice {
 amount
 currencyCode
 }
 }
 images(first: 10) {
 edges {
 node {
 url
 altText
 }
 }
 }
 media(first: 10) {
 edges {
 node {
 mediaContentType
 ... on Video {
 sources {
 url
 mimeType
 }
 previewImage {
 url
 }
 }
 }
 }
 }
 variants(first: 1) {
 edges {
 node {
 id
 priceV2 {
 amount
 currencyCode
 }
 compareAtPriceV2 {
 amount
 currencyCode
 }
 availableForSale
 selectedOptions {
 name
 value
 }
 }
 }
 }
 }
 cursor
 }
 pageInfo {
 hasNextPage
 endCursor
 }
 }
 }
`;

const SIZE_VALUE_PATTERN = `(?:US|UK|EU|IT)?\\s*\\d[\\d.]*|XS|S|M|L|XL|XXL|2XL|3XL|XXXL|OS|OSFM|One\\s+Size`;
// Matches sizes that are ONLY generic clothing letters (not numeric, not EU/UK etc.)
export const GENERIC_CLOTHING_SIZE = /^(XS|S|M|L|XL|XXL|2XL|3XL|XXXL|OS|OSFM|One\s+Size)$/i;
// Full-string size validator — used to reject color/other values stored as size
const SIZE_VALUE_REGEX = new RegExp(`^(${SIZE_VALUE_PATTERN})$`, "i");
// Exported so other modules can validate DB-stored sizes (e.g. reject "Gold", "Black")
export function isValidSizeValue(val: string): boolean {
 return SIZE_VALUE_REGEX.test(val.trim());
}

/**
 * Normalizes compound size values from Shopify variant options.
 * e.g. "EU: 37 / UK: 4" → "EU 37"
 * "EU 37 / UK 4" → "EU 37"
 * "EU: 37" → "EU 37"
 * "M" → "M"
 * Returns null if no recognizable size can be extracted.
 */
function normalizeCompoundSize(val: string): string | null {
 if (!val || val === "Default Title") return null;
 // Take the first component of compound sizes like "EU: 37 / UK: 4"
 const firstPart = val.split(/\s*\/\s*/)[0].trim();
 // Remove colon between size prefix and number: "EU: 37" → "EU 37"
 const normalized = firstPart.replace(/^(EU|UK|US|IT|FR|DE)\s*:\s*/i, (_, prefix: string) => prefix.toUpperCase() + " ").trim();
 if (SIZE_VALUE_REGEX.test(normalized)) return normalized;
 if (SIZE_VALUE_REGEX.test(firstPart)) return firstPart;
 if (SIZE_VALUE_REGEX.test(val.trim())) return val.trim();
 return null;
}

/**
 * Extracts a size from a product title as a fallback when no variant size option exists.
 * Matches patterns like "Size M", "Size 38", "/ Size 9.5", "- Size US 8", "(Size L)"
 * Also matches bare trailing numbers common in vintage listings: "Dior Heels 35", "Gucci Slides 40.5"
 */
export function extractSizeFromTitle(title: string): string | null {
 const parenMatch = /\(\s*(?:size|sz)\s*:?\s*([^)]+)\)/i.exec(title);
 if (parenMatch) return parenMatch[1].trim();

 // Match bare size in parentheses: "(S)", "(M)", "(38)", "(EU 38)"
 const bareParenRe = new RegExp(`\\(\\s*(${SIZE_VALUE_PATTERN})\\s*\\)`, "i");
 const bareParenMatch = bareParenRe.exec(title);
 if (bareParenMatch && SIZE_VALUE_REGEX.test(bareParenMatch[1].trim())) return bareParenMatch[1].trim();

 const re = new RegExp(`(?:[-–—|\\/,]\\s*|\\s+)(?:size|sz)\\s*:?\\s*(${SIZE_VALUE_PATTERN})`, "i");
 const sepMatch = re.exec(title);
 if (sepMatch) return sepMatch[1].trim();

 // Match size letter(s) after separator at end of title (no "size" keyword).
 // Catches "Dress – XS-S", "Top – S/M", "Blouse - XS" etc.
 const LETTER_SIZE = `XS|XXL|XL|X|S|M|L`;
 const trailingSizeSepRe = new RegExp(
 `[-\u2013\u2014\\/|,]\\s*((?:${LETTER_SIZE})(?:[\\/-](?:${LETTER_SIZE}))?)\\s*$`,
 "i"
 );
 const trailingSizeSepMatch = trailingSizeSepRe.exec(title);
 if (trailingSizeSepMatch) return trailingSizeSepMatch[1].trim().toUpperCase();

 // Match a bare size at the very end of the title (no "size" keyword needed).
 // Handles "Dior Heels 35", "Jimmy Choo Pumps 40.5", "Loafers EU 38".
 // Capped at 50 to exclude years (2024, 2025) and other large numbers.
 const trailingRe = new RegExp(`\\s((?:US|UK|EU|IT)\\s*\\d[\\d.]*|\\d{1,2}(?:\\.\\d)?)$`);
 const trailingMatch = trailingRe.exec(title);
 if (trailingMatch) {
 const val = trailingMatch[1].trim();
 const num = parseFloat(val.replace(/[^\d.]/g, ""));
 if (SIZE_VALUE_REGEX.test(val) && num >= 1 && num <= 50) return val;
 }

 return null;
}

// Map full word sizes to abbreviations
const WORD_SIZE_MAP: Record<string, string> = {
 "extra small": "XS",
 "extrasmall": "XS",
 "small": "S",
 "medium": "M",
 "large": "L",
 "extra large": "XL",
 "extralarge": "XL",
 "x-large": "XL",
 "xlarge": "XL",
 "xx-large": "XXL",
 "xxlarge": "XXL",
 "xxl": "XXL",
 "one size": "One Size",
 "onesize": "One Size",
};

/**
 * Extracts an explicit US fit size the seller calls out as how the item actually
 * wears, e.g. "runs true to a 6", "true to size 6", "fits like a 6",
 * "best fits a 6.5", "best fits US 2-4". This is the seller's real-world fit
 * guidance and is treated as the most authoritative DISPLAY size — it beats a
 * marked EU tag size because it tells a US buyer what to actually order.
 *
 * Handles ranges ("US 2-4", "2 to 4"). An explicit "US" lets it match without an
 * "a"/"size" filler word; without "US" it still requires "a"/"size" so it won't
 * grab measurements like "fits 40 inch". Requires a number (bare "true to size"
 * doesn't match) and ignores years/large numbers. Returns "US N", "US N-M", or null.
 */
export function extractFitSizeFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
 // Captures a number and an optional second number (range), guarded against
 // being part of a longer number (years, measurements).
 const RANGE = `(\\d{1,2}(?:\\.\\d)?)(?:\\s*(?:[-–—/]|to)\\s*(\\d{1,2}(?:\\.\\d)?))?(?!\\d)`;
 const patterns = [
 // "(runs) true to (a/size)? (us)? N(-M)?"
 new RegExp(`\\btrue\\s+to\\s+(?:(?:a|size)\\s+)*(?:us\\s*)?${RANGE}`, "i"),
 // "(best) fits/runs/wears (like)? (a/size)? US N(-M)?" — explicit US, filler optional
 new RegExp(`\\b(?:best\\s+)?(?:fits?|runs?|wears?)\\s+(?:best\\s+)?(?:like\\s+)?(?:a\\s+|size\\s+)?us\\s*${RANGE}`, "i"),
 // "(best) fits/runs/wears like a N(-M)?"
 new RegExp(`\\b(?:fits?|runs?|wears?)\\s+(?:best\\s+)?like\\s+a\\s+(?:us\\s*)?${RANGE}`, "i"),
 // "(best) fits/runs/wears a/size N(-M)?" — require a/size (1 or 2) when there's no "US"
 new RegExp(`\\b(?:best\\s+)?(?:fits?|runs?|wears?)\\s+(?:like\\s+)?(?:(?:a|size)\\s+){1,2}(?:us\\s*)?${RANGE}`, "i"),
 ];
 const valid = (s: string) => { const n = parseFloat(s); return n >= 1 && n <= 49; };
 for (const re of patterns) {
 const m = re.exec(text);
 if (m && valid(m[1])) {
 if (m[2] != null && valid(m[2])) return `US ${m[1]}-${m[2]}`;
 return `US ${m[1]}`;
 }
 }
 return null;
}

/**
 * Extracts an explicit US size the seller listed in a size-conversion table, e.g.
 * "UK 10 / EU 40 / US 6". The seller's own US number is authoritative for a US buyer
 * and beats formula-converting the EU/UK tag — the generic "EU − 32" rule would turn
 * this designer's EU 40 into US 8, but she states US 6. Only trusted when a UK/EU/IT/
 * FR/DE size sits alongside it, so stray text like "ships from US in 2 days" can't match.
 */
export function extractUSConversionFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
 const hasUkEu = /\b(?:UK|EU|IT|FR|DE)\s*\d{1,2}\b/i.test(text);
 if (!hasUkEu) return null;
 const m = /\bUS\s*(\d{1,2}(?:\.5)?)\b/i.exec(text);
 if (!m) return null;
 const n = parseFloat(m[1]);
 if (n < 0 || n > 24) return null;
 return `US ${m[1]}`;
}

/**
 * Extracts a LETTER fit the seller explicitly states — "Best Fit M - XL",
 * "fits like a large", "Fit: M-L", "best fits medium to large". Returns a single
 * letter ("L") or a range ("M-XL"), normalized + uppercased. Like the numeric
 * fit note this is the seller's own fit guidance, so it must beat a marked
 * numeric/IT tag (which would otherwise be CONVERTED to a US number the seller
 * never stated, e.g. IT 54 → "US 18"). Conservative on purpose — only clear
 * "best fit / fits like a / fit:" phrasings — so we never guess a size.
 */
export function extractFitLetterFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
 // Longest tokens first so "medium" wins over "m", "large" over "l", etc.
 const TOK = `extra\\s+small|extra\\s+large|x-?large|xx-?large|small|medium|large|xxxl|xxl|xl|xs|s|m|l`;
 // (?![a-z]) after each token stops a bare letter matching the START of a word —
 // e.g. "Fit: Labeled IT" must not read the "L" of "Labeled" as size Large.
 const re = new RegExp(
 `\\b(?:best\\s+fits?|fits?\\s+like\\s+a|fit\\s*:)\\s+(?:a\\s+|size\\s+)?(${TOK})(?![a-z])(?:\\s*(?:[-\\u2013\\u2014/]|to)\\s*(${TOK})(?![a-z]))?`,
 "i",
 );
 const m = re.exec(text);
 if (!m) return null;
 const norm = (s: string): string | null => {
 const word = s.toLowerCase().replace(/\s+/g, " ").trim();
 if (WORD_SIZE_MAP[word] || WORD_SIZE_MAP[word.replace(/-/g, "")]) return WORD_SIZE_MAP[word] ?? WORD_SIZE_MAP[word.replace(/-/g, "")];
 const up = s.toUpperCase().replace(/[\s-]+/g, "");
 return /^(XS|S|M|L|XL|XXL|XXXL)$/.test(up) ? up : null;
 };
 const a = norm(m[1]);
 if (!a) return null;
 const b = m[2] ? norm(m[2]) : null;
 return b && b !== a ? `${a}-${b}` : a;
}

/**
 * Extracts size using ONLY authoritative label keywords: "tagged size", "labeled size",
 * "marked size", "label". Used as the top-priority source so "Tagged size: XS" always
 * beats "Size: Large [store bucket]" that appears earlier in the description.
 */
export function extractTaggedSizeFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
 const STRICT = `tagged\\s+size|labeled\\s+size|marked\\s+size|label(?:\\s+size)?`;

 // EU/IT/FR/DE prefix: "Tagged size: EU 37"
 const euRe = new RegExp(`(?:${STRICT})\\s*:?\\s*((?:EU|IT|FR|DE)\\s*:?\\s*\\d[\\d.]*)`, "i");
 const euM = euRe.exec(text);
 if (euM) return euM[1].trim().replace(/:\s*/, " ").replace(/\s+/, " ");

 // Parenthetical abbreviation: "Label: Medium (M)" → "M"
 const parenRe = new RegExp(`(?:${STRICT})\\s*:?[^(\\n]*?\\(\\s*(${SIZE_VALUE_PATTERN})\\s*\\)`, "i");
 const parenM = parenRe.exec(text);
 if (parenM) return parenM[1].trim();

 // Abbreviated size: "Tagged size: XS"
 const abbrRe = new RegExp(`(?:${STRICT})\\s*:?\\s*(${SIZE_VALUE_PATTERN})`, "i");
 const abbrM = abbrRe.exec(text);
 if (abbrM) return abbrM[1].trim();

 // Full word size: "Tagged size: Medium"
 const wordRe = new RegExp(
 `(?:${STRICT})\\s*:?\\s*(extra\\s+small|extra\\s+large|x-?large|xx-?large|small|medium|large)(?:\\s|$|[^a-z])`,
 "i"
 );
 const wordM = wordRe.exec(text);
 if (wordM) {
 const key = wordM[1].toLowerCase().replace(/\s+/g, " ").trim();
 return WORD_SIZE_MAP[key.replace(/-/g, "")] ?? WORD_SIZE_MAP[key] ?? wordM[1];
 }

 return null;
}

/**
 * Extracts a size from product description HTML using all available heuristics.
 * For highest-priority extraction (tagged/labeled/marked keywords), use
 * extractTaggedSizeFromDescription instead — it won't be fooled by an earlier
 * "Size: Large [store bucket]" before "Tagged size: XS [actual tag]".
 */
export function extractSizeFromDescription(description: string | null): string | null {
 if (!description) return null;
 const text = description.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");

 const STRICT_KW = `tagged\\s+size|labeled\\s+size|marked\\s+size|label(?:\\s+size)?`;

 // 0. EU/IT/FR/DE prefixed size after any label keyword (strict or bare "size:")
 const euLabelRe = new RegExp(
 `(?:(?:${STRICT_KW})\\s*:?|size\\s*:)\\s*((?:EU|IT|FR|DE)\\s*:?\\s*\\d[\\d.]*)`,
 "i"
 );
 const euLabelMatch = euLabelRe.exec(text);
 if (euLabelMatch) return euLabelMatch[1].trim().replace(/:\s*/, " ").replace(/\s+/, " ");

 // 1. Parenthetical abbreviation after any label keyword or "size:"
 const parenKw = `${STRICT_KW}|size`;
 const parenRe = new RegExp(
 `(?:${parenKw})\\s*:?[^(\\n]*?\\(\\s*(${SIZE_VALUE_PATTERN})\\s*\\)`,
 "i"
 );
 const parenMatch = parenRe.exec(text);
 if (parenMatch) return parenMatch[1].trim();

 // 2. Full word size — requires colon after bare "size" to avoid freeform matches
 // ("size large" in narrative text, "I'd recommend size large" etc.)
 const wordRe = new RegExp(
 `(?:(?:${STRICT_KW})\\s*:?|size\\s*:)\\s*(extra\\s+small|extra\\s+large|x-?large|xx-?large|small|medium|large)(?:\\s|$|[^a-z])`,
 "i"
 );
 const wordMatch = wordRe.exec(text);
 if (wordMatch) {
 const key = wordMatch[1].toLowerCase().replace(/\s+/g, " ").trim();
 return WORD_SIZE_MAP[key.replace(/-/g, "")] ?? WORD_SIZE_MAP[key] ?? wordMatch[1];
 }

 // 3. Abbreviated size after strict label or "size:" (with colon). The trailing
 // (?![a-z]) stops a letter size matching the FIRST letter of a word — e.g.
 // "Size: Marked 36" must not return "M" (the M of "Marked"); it falls through
 // so the real "36" is found from the title/elsewhere.
 const re = new RegExp(
 `(?:(?:${STRICT_KW})\\s*:?|size\\s*:)\\s*(${SIZE_VALUE_PATTERN})(?![a-z])`,
 "i"
 );
 const match = re.exec(text);
 if (match) return match[1].trim();

 // 3b. "Size 39." / "Size 38.5" — bare "size" + space + numeric (no colon needed; low false-positive)
 const bareNumericRe = /\bsize\s+((?:US|UK|EU|IT)?\s*\d[\d.]*)\.?(?:\s|$)/i;
 const bareNumericMatch = bareNumericRe.exec(text);
 if (bareNumericMatch) return bareNumericMatch[1].trim();

 // 3c. "Size XS," / "Size M." — bare "size" + space + letter abbreviation (no colon)
 const bareLetterRe = new RegExp(`\\bsize\\s+(${SIZE_VALUE_PATTERN})(?:[,.]|\\s|$)`, "i");
 const bareLetterMatch = bareLetterRe.exec(text);
 if (bareLetterMatch) return bareLetterMatch[1].trim();

 // 4. Standalone EU/IT/FR/DE size anywhere in description (e.g. "• EU 39" as a bullet point)
 const euStandaloneRe = /\b((?:EU|IT|FR|DE)\s*\d[\d.]*)\b/i;
 const euStandaloneMatch = euStandaloneRe.exec(text);
 if (euStandaloneMatch) return euStandaloneMatch[1].trim();

 // 5. Fallback: "fits XS", "best fits M" — (?![a-z]) so "fits Marked"/"fits like"
 // can't match the leading letter of the next word.
 const fitsRe = new RegExp(`(?:best\\s+)?fits?\\s+(${SIZE_VALUE_PATTERN})(?![a-z])`, "i");
 const fitsMatch = fitsRe.exec(text);
 if (fitsMatch) return fitsMatch[1].trim();

 return null;
}

/**
 * Normalizes a Shopify store domain to the correct format
 * Handles custom domains and .myshopify.com domains
 */
function normalizeStoreDomain(domain: string): string {
 // Remove protocol if present
 let normalized = domain.replace(/^https?:\/\//, "");
 // Remove trailing slash
 normalized = normalized.replace(/\/$/, "");
 return normalized;
}

/**
 * Constructs the product URL on the Shopify store
 */
function getProductUrl(storeDomain: string, handle: string): string {
 return `https://${storeDomain}/products/${handle}`;
}

/**
 * Fetches products from a Shopify store using the Storefront API
 * Filters out sold-out products using CONSERVATIVE logic.
 *
 * CONSERVATIVE APPROACH: Only skip products that are DEFINITELY sold out.
 * - availableForSale must be explicitly false
 * - If totalInventory is 0 but availableForSale is true, include it (may allow overselling)
 * - If data is unclear, include the product
 *
 * @param storeDomain - The Shopify store domain (e.g., "mystore.myshopify.com")
 * @param storefrontAccessToken - The Storefront API access token
 * @param storeName - Display name for the store
 * @param maxProducts - Maximum number of products to fetch (default: 250)
 * @returns Object with products array and skipped count
 */
export async function fetchShopifyProducts(
 storeDomain: string,
 storefrontAccessToken: string,
 storeName: string,
 maxProducts: number = 250
): Promise<ShopifyFetchResult> {
 const normalizedDomain = normalizeStoreDomain(storeDomain);
 const endpoint = `https://${normalizedDomain}/api/2024-01/graphql.json`;

 const products: ShopifyProduct[] = [];
 let skippedCount = 0;
 let hasNextPage = true;
 let cursor: string | null = null;

 while (hasNextPage && products.length < maxProducts) {
 const batchSize = Math.min(50, maxProducts - products.length);

 const response = await fetch(endpoint, {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 "X-Shopify-Storefront-Access-Token": storefrontAccessToken,
 },
 body: JSON.stringify({
 query: PRODUCTS_QUERY,
 variables: {
 first: batchSize,
 after: cursor,
 },
 }),
 });

 if (!response.ok) {
 throw new Error(
 `Shopify API request failed: ${response.status} ${response.statusText}`
 );
 }

 const data: ShopifyProductsResponse = await response.json();

 if (data.errors && data.errors.length > 0) {
 throw new Error(
 `Shopify API errors: ${data.errors.map((e) => e.message).join(", ")}`
 );
 }

 if (!data.data?.products) {
 throw new Error("Invalid response from Shopify API");
 }

 const productEdges = data.data.products.edges;

 for (const { node } of productEdges) {
 // CONSERVATIVE: Only skip if availableForSale is explicitly false
 // Don't rely on totalInventory alone - some stores don't track inventory
 // or allow overselling
 if (node.availableForSale === false) {
 console.log(`[Shopify API] Skipping "${node.title}" - availableForSale is false`);
 skippedCount++;
 continue;
 }

 if (node.tags?.map((t) => t.toLowerCase()).includes("no-vya")) {
 console.log(`[Shopify API] Skipping "${node.title}" - tagged no-vya`);
 skippedCount++;
 continue;
 }

 const price = parseFloat(node.priceRange.minVariantPrice.amount);
 const currency = node.priceRange.minVariantPrice.currencyCode;
 let allImageUrls = node.images.edges.map((e) => e.node.url);

 // Pull a hosted product video if the listing has one (some stores upload a
 // video instead of, or in addition to, photos). Prefer an mp4 source.
 const videoNodes = (node.media?.edges ?? [])
 .map((e) => e.node)
 .filter((n) => n.mediaContentType === "VIDEO" && n.sources && n.sources.length > 0);
 const firstVideo = videoNodes[0];
 const videoUrl = firstVideo
 ? (firstVideo.sources!.find((s) => /mp4/i.test(s.mimeType || s.url))?.url ?? firstVideo.sources![0].url)
 : null;
 // If the listing is video-only (no photos), use the video's poster frame so
 // grids, cards and link previews still have an image to show.
 if (allImageUrls.length === 0 && firstVideo?.previewImage?.url) {
 allImageUrls = [firstVideo.previewImage.url];
 }
 const imageUrl = allImageUrls[0] || null;

 // Extract numeric IDs from GIDs (e.g. "gid://shopify/Product/12345" -> "12345")
 const productId = node.id?.match(/(\d+)$/)?.[1] ?? null;
 const firstVariant = node.variants?.edges?.[0]?.node;
 const variantGid = firstVariant?.id;
 const variantId = variantGid?.match(/(\d+)$/)?.[1] ?? null;

 // Compare-at price (original price when on sale)
 const compareAtRaw = firstVariant?.compareAtPriceV2?.amount;
 const compareAtPrice = compareAtRaw ? parseFloat(compareAtRaw) : null;
 const effectiveCompareAt = compareAtPrice && compareAtPrice > price ? compareAtPrice : null;

 // Extract size from variant options (look for "Size", "Shoe size", etc.)
 // Validate with SIZE_VALUE_REGEX to reject non-size values like "ANIMAL", "Black", etc.
 const sizeOption = firstVariant?.selectedOptions?.find(
 (opt) => /size/i.test(opt.name)
 );
 const sizeOptionRaw = sizeOption?.value && sizeOption.value !== "Default Title" ? sizeOption.value : null;
 const sizeFromVariant = sizeOptionRaw ? normalizeCompoundSize(sizeOptionRaw) : null;
 const sizeFromTitle = extractSizeFromTitle(node.title);
 const taggedSize = extractTaggedSizeFromDescription(node.descriptionHtml || null);
 const sizeFromDescription = extractSizeFromDescription(node.descriptionHtml || null);
 // Priority: tagged/labeled/marked size > specific variant > title > generic variant > bare description
 const isGenericOnly = !!sizeFromVariant && GENERIC_CLOTHING_SIZE.test(sizeFromVariant);
 const size = taggedSize
 ?? (sizeFromVariant && !isGenericOnly ? sizeFromVariant : null)
 ?? sizeFromTitle
 ?? (isGenericOnly ? sizeFromVariant : null)
 ?? sizeFromDescription;

 products.push({
 title: node.title,
 price: isNaN(price) ? null : price,
 compareAtPrice: effectiveCompareAt,
 currency,
 image: imageUrl,
 images: allImageUrls,
 videoUrl,
 externalUrl: getProductUrl(normalizedDomain, node.handle),
 store: storeName,
 vendor: node.vendor || null,
 productType: node.productType || null,
 availableForSale: node.availableForSale,
 description: node.descriptionHtml || null,
 variantId,
 shopifyProductId: productId,
 size,
 });
 }

 hasNextPage = data.data.products.pageInfo.hasNextPage;
 cursor = data.data.products.pageInfo.endCursor;
 }

 console.log(`[Shopify API] ${storeName}: ${products.length} synced, ${skippedCount} skipped (sold out)`);
 return { products, skippedCount };
}

/**
 * Tests the connection to a Shopify store
 * Returns basic store info if successful
 */
export async function testShopifyConnection(
 storeDomain: string,
 storefrontAccessToken: string
): Promise<{ success: boolean; shopName?: string; error?: string }> {
 const normalizedDomain = normalizeStoreDomain(storeDomain);
 const endpoint = `https://${normalizedDomain}/api/2024-01/graphql.json`;

 const query = `
 query {
 shop {
 name
 primaryDomain {
 url
 }
 }
 }
 `;

 try {
 const response = await fetch(endpoint, {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 "X-Shopify-Storefront-Access-Token": storefrontAccessToken,
 },
 body: JSON.stringify({ query }),
 });

 if (!response.ok) {
 return {
 success: false,
 error: `HTTP ${response.status}: ${response.statusText}`,
 };
 }

 const data = await response.json();

 if (data.errors) {
 return {
 success: false,
 error: data.errors.map((e: { message: string }) => e.message).join(", "),
 };
 }

 return {
 success: true,
 shopName: data.data?.shop?.name,
 };
 } catch (error) {
 return {
 success: false,
 error: error instanceof Error ? error.message : "Unknown error",
 };
 }
}

/**
 * Fetches products from a Shopify store using the public products.json endpoint
 * This doesn't require an access token but may not work for all stores
 * Filters out sold-out products based on available flag and inventory
 *
 * CONSERVATIVE APPROACH: Only skip products that are DEFINITELY sold out.
 * When inventory data is missing or unclear, include the product.
 *
 * @param storeDomain - The Shopify store domain
 * @param storeName - Display name for the store
 * @param maxProducts - Maximum number of products to fetch (default: 250)
 * @returns Object with products array and skipped count
 */
export async function fetchShopifyProductsPublic(
 storeDomain: string,
 storeName: string,
 maxProducts: number = 250,
 defaultCurrency: string = "USD",
 skipSoldOutFilter: boolean = false,
 /** The shop's HOME country (Shopify's `countryCode`). Sent as the `localization` cookie so Shopify
  *  Markets serves the seller's own market. Without it the feed is priced in whatever market the
  *  request's geography suggests — a UK store imported from a US-looking crawler came back in USD at
  *  a converted rate, and every price on the hosted store disagreed with the seller's. Proven: the
  *  same request with `localization=GB` returns £290.00 GBP; without it, $401.00 USD. */
 homeCountry: string | null = null
): Promise<ShopifyFetchResult> {
 const normalizedDomain = normalizeStoreDomain(storeDomain);
 const products: ShopifyProduct[] = [];
 let skippedCount = 0;
 let page = 1;
 // Recorded so the caller can tell "that is the whole catalogue" from "that is where I stopped".
 const outcome: ReadOutcome = { pagesRead: 0, lastPageFull: false, hitCap: false, failed: false };
 // The currency the FEED is actually priced in. Shopify Markets serves a storefront in different
 // presentment currencies depending on how it reads the request, and products.json carries bare
 // price strings with no currency at all — so the same URL can return "245.00" (GBP) or "341.00"
 // (USD converted). It does tell us which, via the `cart_currency` cookie on that same response.
 // Reading it HERE keeps price and currency from the same response; taking currency from a
 // separately-fetched homepage can disagree with the feed and mislabel every price in the import.
 let feedCurrency: string | null = null;
 // Use 50 per page — some stores cap their public API at 50 regardless of the
 // limit param, so requesting 50 ensures correct page-based pagination.
 const limit = 50;

 while (products.length < maxProducts) {
 const url = `https://${normalizedDomain}/products.json?limit=${limit}&page=${page}`;

 let response: Response | null = null;
 for (let attempt = 0; attempt < 4; attempt++) {
 // safeFetch, not bare fetch: `storeDomain` is user-supplied on the import path, so this call
 // has to go through the same SSRF guard (DNS resolution + private-IP rejection + per-hop
 // redirect revalidation) as every other outbound request. The timeout also means a hung store
 // can't pin the invocation open — the outer Promise.race can't cancel this work on its own.
 response = await safeFetch(url, {
  headers: { Accept: "application/json", ...(homeCountry ? { Cookie: `localization=${homeCountry}` } : {}) },
  signal: AbortSignal.timeout(15000),
 });
 if (response.status !== 429) break;
 const retryAfter = parseInt(response.headers.get("Retry-After") ?? "5", 10);
 const waitMs = Math.min(retryAfter * 1000, 30_000);
 console.log(`[Shopify] Rate limited on ${storeDomain} page ${page}, waiting ${waitMs}ms`);
 await new Promise((r) => setTimeout(r, waitMs));
 }

 if (!response!.ok) {
 outcome.failed = true;
 if (response!.status === 401 || response!.status === 403) {
 throw new Error(
 "Store requires authentication. Please provide a Storefront Access Token."
 );
 }
 throw new Error(
 `Failed to fetch products: ${response!.status} ${response!.statusText}`
 );
 }

 // Which currency THIS response is priced in (see feedCurrency above).
 if (!feedCurrency) {
 const setCookie = response!.headers.get("set-cookie") || "";
 const m = setCookie.match(/cart_currency=([A-Z]{3})/);
 if (m) feedCurrency = m[1];
 }

 // Real storefronts ship raw control characters inside product descriptions, which strict
 // JSON.parse rejects outright — every one of the 13 Shopify feeds profiled did it. Strip the
 // C0 range (except the legal \t\n\r escapes) so one bad description can't fail a whole import.
 const data = parseLooseJson(await response!.text());

 if (!data.products || data.products.length === 0) {
 // A `200 {"products":[]}` is what a throttled Shopify returns mid-catalogue — and ALSO what the
 // real end of the catalogue looks like when its size is an exact multiple of the page size
 // (shop-vintage-charm holds exactly 1,550 and we page by 50). The two are indistinguishable in
 // one request, so ask twice: a throttle clears, an ending does not.
 if (page > 1) {
 // Ask again, with room for a throttle to clear. One quick retry is not enough: a shop that is
 // busy enough to answer empty is often busy for more than two seconds, and a sustained throttle
 // that survives the retry would be read as the end of the catalogue — the exact mistake this is
 // here to prevent, just harder to spot.
 let refilled: ReturnType<typeof parseLooseJson> | null = null;
 let reachable = false;
 // Backoff kept short on purpose: the whole read runs under a single outer timeout, and waiting
 // 30s here spent the entire budget, turning a good read of shop-vintage-charm into an empty one.
 for (const waitMs of [1500, 5000]) {
 await new Promise((r) => setTimeout(r, waitMs));
 const retry = await safeFetch(url, {
  headers: { Accept: "application/json", ...(homeCountry ? { Cookie: `localization=${homeCountry}` } : {}) },
  signal: AbortSignal.timeout(15000),
 }).catch(() => null);
 if (!retry?.ok) continue;
 reachable = true;
 const again = parseLooseJson(await retry.text());
 if (again?.products?.length) { refilled = again; break; }
 }
 if (refilled?.products?.length) {
  // It was a throttle. Take this page's products and carry on rather than stopping short.
  console.log(`[Shopify] ${storeName}: page ${page} came back empty and refilled on retry (throttle)`);
  data.products = refilled.products;
 } else if (!reachable) {
  outcome.failed = true; // never got an answer — cannot tell an ending from an outage
  break;
 } else {
  outcome.lastPageFull = false; // answered, and empty every time: the catalogue really does end here
  break;
 }
 } else {
 break;
 }
 }

 for (const product of data.products) {
 if (products.length >= maxProducts) break;

 const variants = product.variants || [];

 let isSoldOut = false;

 if (skipSoldOutFilter) {
 // Store opted out of sold-out filtering — include everything listed
 } else if (product.available === false) {
 isSoldOut = true;
 console.log(`[Shopify] Skipping "${product.title}" - product.available is false`);
 } else {
 const hasVariants = variants.length > 0;
 // All variants explicitly unavailable
 const allVariantsUnavailable = hasVariants && variants.every(
 (v: { available?: boolean }) => v.available === false
 );
 // Only infer sold-out from zero inventory when Shopify itself doesn't say the
 // product is available — if product.available === true the store has overselling
 // enabled and the item can genuinely be purchased, so we trust that signal.
 const allVariantsZeroInventory = product.available !== true && hasVariants && variants.every(
 (v: { inventory_management?: string | null; inventory_quantity?: number }) =>
 v.inventory_management === "shopify" && (v.inventory_quantity ?? 0) <= 0
 );

 if (allVariantsUnavailable || allVariantsZeroInventory) {
 isSoldOut = true;
 console.log(`[Shopify] Skipping "${product.title}" - ${allVariantsZeroInventory ? "zero inventory" : "all variants unavailable"}`);
 }
 }

 if (isSoldOut) {
 skippedCount++;
 continue;
 }

 const rawTags = product.tags as string[] | string | undefined;
 const productTags = Array.isArray(rawTags)
 ? rawTags.map((t) => t.toLowerCase())
 : (rawTags ?? "").split(",").map((t) => t.trim().toLowerCase());
 if (productTags.includes("no-vya")) {
 console.log(`[Shopify] Skipping "${product.title}" - tagged no-vya`);
 skippedCount++;
 continue;
 }

 const variant = variants[0];
 const price = variant?.price ? parseFloat(variant.price) : null;
 const variantId = variant?.id ? String(variant.id) : null;
 const shopifyProductId = product.id ? String(product.id) : null;
 const compareAtRawPublic = variant?.compare_at_price ? parseFloat(variant.compare_at_price) : null;
 const compareAtPricePublic = compareAtRawPublic && price && compareAtRawPublic > price ? compareAtRawPublic : null;

 // Extract size from variant options or product options
 let sizeFromVariant: string | null = null;
 const productOptions: Array<{ name: string; values?: string[] }> = product.options || [];
 const sizeOptionIndex = productOptions.findIndex((opt: { name: string }) => /size/i.test(opt.name));
 if (sizeOptionIndex >= 0 && variant) {
 const optionKey = `option${sizeOptionIndex + 1}` as "option1" | "option2" | "option3";
 const val = variant[optionKey];
 // Validate value looks like an actual size (reject "ANIMAL", "Black", etc.)
 if (val && val !== "Default Title") sizeFromVariant = normalizeCompoundSize(val);
 }
 // Check variant.title as another source (e.g. "M", "US 8") before falling back to text extraction
 // Only accept variant.title as a size if it actually looks like a size (not a color like "Green")
 const rawVariantTitle = variant?.title && variant.title !== "Default Title" ? variant.title : null;
 const variantTitleIfSize = rawVariantTitle ? normalizeCompoundSize(rawVariantTitle) : null;
 const isGenericOnly = !!sizeFromVariant && GENERIC_CLOTHING_SIZE.test(sizeFromVariant);
 const sizeFromTitle = extractSizeFromTitle(product.title);
 const taggedSize = extractTaggedSizeFromDescription(product.body_html || null);
 const sizeFromDescription = extractSizeFromDescription(product.body_html || null);
 // Priority: tagged/labeled/marked size > specific variant > title > generic variant > bare description
 const size = taggedSize
 ?? (sizeFromVariant && !isGenericOnly ? sizeFromVariant : null)
 ?? sizeFromTitle
 ?? variantTitleIfSize
 ?? (isGenericOnly ? sizeFromVariant : null)
 ?? sizeFromDescription;
 const allImageUrls: string[] = (product.images || [])
 .map((img: { src?: string }) => img.src)
 .filter(Boolean) as string[];
 const imageUrl = allImageUrls[0] || null;

 // Determine availability for the product record
 // If any variant is available, or if we don't have clear data, assume available
 const anyVariantAvailable = variants.some(
 (v: { available?: boolean }) => v.available === true
 );
 const isAvailable = product.available === true || anyVariantAvailable ||
 (product.available !== false && !variants.every((v: { available?: boolean }) => v.available === false));

 products.push({
 title: product.title,
 price: isNaN(price as number) ? null : price,
 compareAtPrice: compareAtPricePublic,
 currency: feedCurrency || defaultCurrency, // what THIS feed response was priced in (cart_currency cookie)
 image: imageUrl,
 images: allImageUrls,
 videoUrl: null,
 externalUrl: `https://${normalizedDomain}/products/${product.handle}`,
 store: storeName,
 vendor: product.vendor || null,
 productType: product.product_type || null,
 availableForSale: isAvailable,
 description: product.body_html || null,
 variantId,
 shopifyProductId,
 size,
 tags: productTags,
 // Stable identity + the full size run, so the importer can match on re-sync instead of
 // guessing by title, and multi-size listings survive as more than their first variant.
 handle: product.handle || null,
 variants: variants.map((v: { id?: unknown; title?: string; option1?: string | null; option2?: string | null; price?: string; available?: boolean }) => {
 const vPrice = v.price ? parseFloat(v.price) : null;
 return {
 sourceVariantId: v.id != null ? String(v.id) : null,
 size: v.title && v.title !== "Default Title" ? v.title : (v.option1 ?? null),
 color: v.option2 ?? null,
 priceCents: vPrice != null && !isNaN(vPrice) ? Math.round(vPrice * 100) : null,
 available: v.available !== false,
 };
 }),
 });
 }

 outcome.pagesRead = page;
 outcome.lastPageFull = data.products.length >= limit;

 if (data.products.length < limit) {
 break;
 }

 page++;
 }

 // The while-condition itself: we stopped because our own ceiling was reached, not the shop's end.
 if (products.length >= maxProducts) outcome.hitCap = true;
 console.log(`[Shopify] ${storeName}: ${products.length} synced, ${skippedCount} skipped (sold out)${outcome.hitCap ? " — STOPPED AT OUR LIMIT, not the end of the catalogue" : ""}`);
 return { products, skippedCount, outcome };
}

/**
 * Returns a Set of Shopify product IDs (as strings) for all products in the given collection handles.
 * Used to build an exclusion set before syncing — products whose ID appears here are filtered out.
 */
export async function fetchProductIdsByCollections(
 storeDomain: string,
 collectionHandles: string[]
): Promise<Set<string>> {
 const normalizedDomain = normalizeStoreDomain(storeDomain);
 const ids = new Set<string>();
 const limit = 250;

 for (const handle of collectionHandles) {
 let page = 1;
 while (true) {
 const url = `https://${normalizedDomain}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
 const response = await fetch(url, { headers: { Accept: "application/json" } });
 if (!response.ok) {
 console.warn(`[Shopify] excludeCollectionHandles: could not fetch "${handle}" (${response.status}), skipping`);
 break;
 }
 const data = await response.json();
 if (!data.products || data.products.length === 0) break;
 for (const p of data.products) {
 if (p.id) ids.add(String(p.id));
 }
 if (data.products.length < limit) break;
 page++;
 }
 }

 return ids;
}

/**
 * Fetches products from specific Shopify collections using the public collections.json endpoint.
 * Deduplicates products that appear in multiple collections.
 * No access token required.
 */
export async function fetchShopifyProductsByCollections(
 storeDomain: string,
 storeName: string,
 collectionHandles: string[],
 maxProducts: number = 5000
): Promise<ShopifyFetchResult> {
 const normalizedDomain = normalizeStoreDomain(storeDomain);
 const seenIds = new Set<string>();
 const products: ShopifyProduct[] = [];
 let skippedCount = 0;
 const limit = 250;

 for (const handle of collectionHandles) {
 // Use cursor-based pagination via Shopify's Link header so that products
 // added or sold mid-sync don't shift page offsets and cause items to be
 // missed (which would falsely mark them sold and reset their created_at).
 let nextUrl: string | null =
 `https://${normalizedDomain}/collections/${handle}/products.json?limit=${limit}`;
 console.log(`[Shopify Collections] Fetching collection "${handle}" from ${normalizedDomain}`);

 while (nextUrl && products.length < maxProducts) {
 const response: Response = await fetch(nextUrl, { headers: { Accept: "application/json" } });

 if (!response.ok) {
 console.error(`[Shopify Collections] Failed to fetch collection "${handle}": ${response.status}`);
 break;
 }

 // Extract next-page cursor from Link header before consuming body
 const linkHeader: string = response.headers.get("link") ?? "";
 const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
 nextUrl = nextMatch ? nextMatch[1] : null;

 const data = await response.json();
 if (!data.products || data.products.length === 0) break;

 for (const product of data.products) {
 if (products.length >= maxProducts) break;

 const shopifyProductId = product.id ? String(product.id) : null;
 if (shopifyProductId && seenIds.has(shopifyProductId)) continue;
 if (shopifyProductId) seenIds.add(shopifyProductId);

 const variants = product.variants || [];
 let isSoldOut = false;
 if (product.available === false) {
 isSoldOut = true;
 } else if (product.available === null || product.available === undefined) {
 const hasVariants = variants.length > 0;
 if (hasVariants && variants.every((v: { available?: boolean }) => v.available === false)) {
 isSoldOut = true;
 }
 }
 if (isSoldOut) { skippedCount++; continue; }

 const variant = variants[0];
 const price = variant?.price ? parseFloat(variant.price) : null;
 const variantId = variant?.id ? String(variant.id) : null;
 const compareAtRaw = variant?.compare_at_price ? parseFloat(variant.compare_at_price) : null;
 const compareAtPrice = compareAtRaw && price && compareAtRaw > price ? compareAtRaw : null;

 const productOptions: Array<{ name: string; values?: string[] }> = product.options || [];
 const sizeOptionIndex = productOptions.findIndex((opt: { name: string }) => /size/i.test(opt.name));
 let sizeFromVariant: string | null = null;
 if (sizeOptionIndex >= 0 && variant) {
 const optionKey = `option${sizeOptionIndex + 1}` as "option1" | "option2" | "option3";
 const val = variant[optionKey];
 if (val && val !== "Default Title") sizeFromVariant = normalizeCompoundSize(val);
 }
 const rawVariantTitle = variant?.title && variant.title !== "Default Title" ? variant.title : null;
 const variantTitleIfSize = rawVariantTitle ? normalizeCompoundSize(rawVariantTitle) : null;
 const isGenericOnly = !!sizeFromVariant && GENERIC_CLOTHING_SIZE.test(sizeFromVariant);
 const sizeFromTitle = extractSizeFromTitle(product.title);
 const taggedSize = extractTaggedSizeFromDescription(product.body_html || null);
 const sizeFromDescription = extractSizeFromDescription(product.body_html || null);
 // Priority: tagged/labeled/marked size > specific variant > title > generic variant > bare description
 const size = taggedSize
 ?? (sizeFromVariant && !isGenericOnly ? sizeFromVariant : null)
 ?? sizeFromTitle
 ?? variantTitleIfSize
 ?? (isGenericOnly ? sizeFromVariant : null)
 ?? sizeFromDescription;

 const allImageUrls: string[] = (product.images || []).map((img: { src?: string }) => img.src).filter(Boolean) as string[];
 const imageUrl = allImageUrls[0] || null;
 const anyVariantAvailable = variants.some((v: { available?: boolean }) => v.available === true);
 const isAvailable = product.available === true || anyVariantAvailable ||
 (product.available !== false && !variants.every((v: { available?: boolean }) => v.available === false));

 const rawTags2 = product.tags as string[] | string | undefined;
 const productTags = Array.isArray(rawTags2)
 ? rawTags2.map((t) => t.toLowerCase())
 : (rawTags2 ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

 products.push({
 title: product.title,
 price: isNaN(price as number) ? null : price,
 compareAtPrice,
 currency: "USD",
 image: imageUrl,
 images: allImageUrls,
 videoUrl: null,
 externalUrl: `https://${normalizedDomain}/products/${product.handle}`,
 store: storeName,
 vendor: product.vendor || null,
 productType: product.product_type || null,
 availableForSale: isAvailable,
 description: product.body_html || null,
 variantId,
 shopifyProductId,
 size,
 tags: productTags,
 });
 }
 }
 }

 console.log(`[Shopify Collections] ${storeName}: ${products.length} synced from ${collectionHandles.join(", ")}, ${skippedCount} skipped`);
 return { products, skippedCount };
}

/**
 * Fetches a Shopify product page and extracts metafield sections (h2/p pairs)
 * that aren't in the body_html, such as Condition and Dimensions.
 * Returns appended HTML in a format compatible with splitDescription parsing.
 *
 * When extractFallbackDescription=true, also tries to extract the main product
 * description from a "Details" or "Description" section on the page — useful
 * for stores where body_html is empty but the description renders in a page tab.
 */
export type ScrapedPageSections = {
 /** Combined HTML of the extracted sections, appended to the product description. */
 html: string;
 /** Structured values the seller already wrote — captured so intake/pricing/training
  * don't have to re-guess them. Null when the page doesn't state them. */
 condition: string | null;
 measurements: string | null;
 materials: string | null;
};

const EMPTY_SECTIONS: ScrapedPageSections = { html: "", condition: null, measurements: null, materials: null };

// Site chrome (nav / menu / footer) that leaks into whole-page scraped text. A captured field value
// containing several of these isn't a real value — it's the menu (e.g. a "Condition Guide" nav link
// matched as a "Condition" field and swallowed the whole nav). Used to reject such captures.
const NAV_JUNK_RE = /\b(?:Contact\s+Us|Search|Cart|Log\s?in|Sign\s?(?:in|up)|Shop\s+All|Collections?|Close|Menu|Newsletter|About\s+Us|My\s+Account|Wishlist|Private\s+Sourcing|Sourcing\s+Requests?|Summer\s+Arrivals|Events|Follow\s+us|Subscribe|Home\b|Rarities)\b/gi;
function looksLikeNav(v: string): boolean {
 return (v.match(NAV_JUNK_RE) || []).length >= 2;
}

export async function scrapeProductPageSections(url: string, extractFallbackDescription = false): Promise<ScrapedPageSections> {
 try {
 const res = await fetch(url, {
 headers: { Accept: "text/html" },
 signal: AbortSignal.timeout(8000),
 });
 if (!res.ok) return EMPTY_SECTIONS;
 const html = await res.text();

 const text = html
 .replace(/<script[\s\S]*?<\/script>/gi, " ")
 .replace(/<style[\s\S]*?<\/style>/gi, " ")
 .replace(/<[^>]+>/g, " ")
 .replace(/\s+/g, " ")
 .trim();

 const sections: string[] = [];
 // Structured captures — the seller's own words, kept alongside the HTML so downstream
 // (product display, training labels, pricing condition multiplier) uses truth, not a guess.
 let condition: string | null = null;
 let measurements: string | null = null;
 let materials: string | null = null;

 // Regex to strip Shopify storefront UI text that leaks into scraped content.
 // These strings appear in the raw page text when themes render price/cart UI
 // between product description sections — they must never end up in our data.
 const ECOM_JUNK_RE = /\s+(?:THIS\s+ITEM\s+IS\b|Regular\s+price\b|Sale\s+price\b|Unit\s+price\b|Sold\s+out\b|In\s+stock\b|Out\s+of\s+stock\b|Product\s+variant[s]?\b|Quantity\b|Decrease\s+quantity\b|Increase\s+quantity\b|Add\s+to\s+(?:cart|bag|wishlist)\b|Pick\s+up\s+available\b|Tax\s+included\b|Free\s+(?:shipping|returns?)\b|Ships?\s+(?:from|in|within)\b|Checkout\b|\$\s*\d[\d,.]*)[\s\S]*/i;

 // Stop at recognized page sections AND common Shopify footer/nav markers so
 // we don't accidentally capture footer HTML that appears after product content.
 // Also stops at e-commerce UI keywords (price, cart, stock) that some themes
 // render between product content sections.
 const nextSection = "\\s+(?:Condition|Dimensions?|Measurements?|Materials?|Fabric|Composition|Made\\s+of|Care|Authenticity(?:\\s+Guarantee)?|Model\\s+Number|Serial\\s+Number|Add\\s+to\\s+(?:cart|bag|wishlist)|Subscribe|Order\\s+Polic|Details|Shipping|Returns?|You\\s+may\\s+also|Powered\\s+by|Sign\\s+up|Newsletter|Privacy\\s+(?:Policy|Choices)|Customer\\s+(?:care|service)|Follow\\s+(?:us|me)|Social\\s+Media|Regular\\s+price|Sale\\s+price|Sold\\s+out|In\\s+stock|Unit\\s+price|Product\\s+variant|Decrease\\s+quantity|Increase\\s+quantity|THIS\\s+ITEM\\s+IS|Pick\\s+up\\s+available|Tax\\s+included|\\$\\s*\\d)";

 const dimResult = new RegExp(`\\b(?:Dimensions?|Measurements?)\\b\\s*:\\s*(.+?)(?=${nextSection})`, "i").exec(text);
 if (dimResult) {
 let val = dimResult[1].trim();
 // Strip any e-commerce UI text that leaked past the lookahead
 val = val.replace(ECOM_JUNK_RE, "").trim();
 // Deduplicate: if the text repeats itself, take only the first half
 const half = Math.ceil(val.length / 2);
 const firstHalf = val.slice(0, half);
 if (val.slice(half).trim().startsWith(firstHalf.trim().slice(0, 20))) val = firstHalf.trim();
 if (!looksLikeNav(val) && val.length >= 3 && val.length <= 300) {
 sections.push(`<p>Measurements: ${val}</p>`);
 measurements = val;
 }
 }

 const condResult = new RegExp(`\\bCondition\\b\\s*:\\s*(.+?)(?=${nextSection})`, "i").exec(text);
 if (condResult) {
 let val = condResult[1].trim();
 // Strip any e-commerce UI text that leaked past the lookahead
 val = val.replace(ECOM_JUNK_RE, "").trim();
 // Deduplicate
 const half = Math.ceil(val.length / 2);
 const firstHalf = val.slice(0, half);
 if (val.slice(half).trim().startsWith(firstHalf.trim().slice(0, 20))) val = firstHalf.trim();
 if (!looksLikeNav(val) && val.length >= 3 && val.length <= 400) {
 sections.push(`<p>Condition: ${val}</p>`);
 condition = val;
 }
 }

 // Materials / fabric / composition — sellers state this explicitly; capture it structured
 // so intake/training use the real fibre content instead of guessing from the photo.
 const matResult = new RegExp(`\\b(?:Materials?|Fabric|Composition|Made\\s+of)\\b\\s*:\\s*(.+?)(?=${nextSection})`, "i").exec(text);
 if (matResult) {
 let val = matResult[1].trim();
 val = val.replace(ECOM_JUNK_RE, "").trim();
 const half = Math.ceil(val.length / 2);
 const firstHalf = val.slice(0, half);
 if (val.slice(half).trim().startsWith(firstHalf.trim().slice(0, 20))) val = firstHalf.trim();
 if (!looksLikeNav(val) && val.length >= 2 && val.length <= 200) {
 sections.push(`<p>Materials: ${val}</p>`);
 materials = val;
 }
 }

 // Size — some themes render the size as a "Size:" field driven by a Shopify metafield
 // (e.g. "Size: IT 37.5 UK 4.5"), which never appears in body_html or the public
 // products.json variant options. Pull it off the rendered page so deriveSize can surface
 // it. Require a colon (so we skip "Size guide"/"Size chart"/variant-picker labels) and
 // validate the value actually parses as a size before keeping it.
 const sizeResult = new RegExp(`\\bSize\\b\\s*:\\s*(.{1,50}?)(?=${nextSection})`, "i").exec(text);
 if (sizeResult) {
 const val = sizeResult[1].replace(ECOM_JUNK_RE, "").trim();
 if (val && extractSizeFromDescription(`Size: ${val}`)) {
 sections.push(`<p>Size: ${val}</p>`);
 }
 }

 // When body_html is empty, try to extract the product description from the page.
 // Many Shopify themes render the description in a "Details" or "Description" tab
 // section that doesn't appear in body_html (e.g., Ange Archive's theme).
 if (extractFallbackDescription && sections.length === 0) {
 const descEnd = "(?:Materials?(?:\\s+\\+\\s*|\\s+)Care|Materials?|Care\\s+Instructions?|Shipping|Returns?|You\\s+might|You\\s+may|NEWSLETTER|Newsletter|SHOP\\b|Footer|\\u00a9\\s*\\d{4})";
 const detailsResult = new RegExp(
 `\\bDetails?\\b\\s+(.{20,800}?)\\s+${descEnd}`,
 "is"
 ).exec(text);
 if (detailsResult) {
 const raw = detailsResult[1].trim();
 // Deduplicate repeated text (some themes echo the title into this section)
 const half = Math.ceil(raw.length / 2);
 const firstHalf = raw.slice(0, half);
 const val = raw.slice(half).trim().startsWith(firstHalf.trim().slice(0, 20))
 ? firstHalf.trim()
 : raw;
 if (val.length >= 20 && !looksLikeNav(val)) {
 // Split into individual sentences/lines to produce paragraph HTML
 const paras = val
 .split(/(?<=[.!?])\s{2,}|\.\s+(?=[A-Z])/)
 .map((p) => p.trim())
 .filter((p) => p.length > 5);
 if (paras.length > 0) {
 sections.push(paras.map((p) => `<p>${p}</p>`).join(""));
 }
 }
 }
 }

 return { html: sections.join(""), condition, measurements, materials };
 } catch {
 return EMPTY_SECTIONS;
 }
}

/**
 * Converts ShopifyProduct to the standard RSSProduct format
 * for compatibility with existing product storage
 */
export function toRSSProductFormat(product: ShopifyProduct): {
 title: string;
 price: number | null;
 compareAtPrice: number | null;
 currency: string;
 image: string | null;
 images: string[];
 videoUrl: string | null;
 externalUrl: string;
 store: string;
 description: string | null;
 variantId: string | null;
 shopifyProductId: string | null;
 size: string | null;
 productType: string | null;
 vendor: string | null;
 available: boolean;
 condition?: string | null;
 materials?: string | null;
 measurements?: string | null;
 tags?: string[];
} {
 return {
 title: product.title,
 price: product.price,
 compareAtPrice: product.compareAtPrice,
 currency: product.currency,
 image: product.image,
 images: product.images,
 videoUrl: product.videoUrl,
 externalUrl: product.externalUrl,
 store: product.store,
 description: product.description,
 variantId: product.variantId,
 shopifyProductId: product.shopifyProductId,
 size: product.size,
 productType: product.productType,
 vendor: product.vendor ?? null,
 available: product.availableForSale !== false, // false only when the source explicitly marks it sold out
 tags: product.tags ?? [],
 };
}
