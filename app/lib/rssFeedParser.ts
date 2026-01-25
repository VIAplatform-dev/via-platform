import { parseStringPromise } from "xml2js";

export type RSSProduct = {
  title: string;
  price: number | null;
  image: string | null;
  externalUrl: string;
  store: string;
};

export type RSSFetchResult = {
  products: RSSProduct[];
  skippedCount: number;
};

type RSSItem = {
  title?: string[];
  link?: string[];
  description?: string[];
  "media:content"?: Array<{ $?: { url?: string } }>;
  enclosure?: Array<{ $?: { url?: string } }>;
};

type RSSFeed = {
  rss?: {
    channel?: Array<{
      item?: RSSItem[];
    }>;
  };
};

/**
 * Checks if a URL looks like a blog post rather than a product
 */
function isBlogPost(url: string): boolean {
  const blogPatterns = [
    /\/blog\//i,
    /\/news\//i,
    /\/article\//i,
    /\/post\//i,
    /\/journal\//i,
  ];
  return blogPatterns.some((pattern) => pattern.test(url));
}

/**
 * Checks if a product appears to be sold out based on title/description
 * Common indicators: "SOLD", "Sold Out", "Out of Stock", "Unavailable"
 */
function isSoldOut(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();

  // Patterns that indicate sold out status
  const soldOutPatterns = [
    /\bsold\b/i, // "SOLD" or "Sold" as a word
    /\bsold\s*out\b/i, // "Sold Out", "Sold out"
    /\bout\s*of\s*stock\b/i, // "Out of Stock"
    /\bunavailable\b/i, // "Unavailable"
    /\bno\s*longer\s*available\b/i, // "No longer available"
    /\[sold\]/i, // "[SOLD]" in title
    /\(sold\)/i, // "(SOLD)" in title
  ];

  return soldOutPatterns.some((pattern) => pattern.test(text));
}

/**
 * Checks if an item looks like a product (has price indicators)
 */
function looksLikeProduct(title: string, description: string, url: string): boolean {
  // If URL is clearly a blog post, reject it
  if (isBlogPost(url)) return false;

  // Check for product-like URL patterns
  const productUrlPatterns = [
    /\/shop\//i,
    /\/product/i,
    /\/p\//i,
    /\/store\//i,
    /\/item\//i,
  ];
  const hasProductUrl = productUrlPatterns.some((pattern) => pattern.test(url));

  // Check for price in title or description
  const pricePattern = /\$\s*[\d,]+(?:\.\d{2})?|USD\s*[\d,]+/i;
  const hasPrice = pricePattern.test(title) || pricePattern.test(description);

  // Accept if it has a product URL or a price
  return hasProductUrl || hasPrice;
}

/**
 * Extracts price from text content
 * Looks for patterns like "$123.00", "$123", "USD 123.00", etc.
 */
function extractPrice(text: string): number | null {
  if (!text) return null;

  // Match price patterns: $123.00, $123, USD 123.00, etc.
  const priceMatch = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (priceMatch) {
    return parseFloat(priceMatch[1].replace(",", ""));
  }

  // Try matching "USD X.XX" pattern
  const usdMatch = text.match(/USD\s*([\d,]+(?:\.\d{2})?)/i);
  if (usdMatch) {
    return parseFloat(usdMatch[1].replace(",", ""));
  }

  return null;
}

/**
 * Extracts image URL from item
 * Checks media:content, enclosure, and description for images
 */
function extractImage(item: RSSItem): string | null {
  // Check media:content
  if (item["media:content"]?.[0]?.$?.url) {
    return item["media:content"][0].$.url;
  }

  // Check enclosure
  if (item.enclosure?.[0]?.$?.url) {
    return item.enclosure[0].$.url;
  }

  // Try to extract from description HTML
  const description = item.description?.[0] || "";
  const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }

  return null;
}

/**
 * Fetches and parses an RSS feed from a Squarespace store
 * Filters out products that appear to be sold out based on title/description
 * @param rssUrl - The RSS feed URL (e.g., "https://www.leivintage.com/products?format=rss")
 * @param storeName - The store name to tag products with
 * @returns Object with products array and skipped count
 */
export async function parseRSSFeed(
  rssUrl: string,
  storeName: string
): Promise<RSSFetchResult> {
  const response = await fetch(rssUrl, {
    headers: {
      "User-Agent": "VIA-RSS-Parser/1.0",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parsed: RSSFeed = await parseStringPromise(xml);

  const items = parsed.rss?.channel?.[0]?.item || [];
  const products: RSSProduct[] = [];
  let skippedCount = 0;

  for (const item of items) {
    const title = item.title?.[0]?.trim() || "";
    const externalUrl = item.link?.[0] || "";
    const description = item.description?.[0] || "";

    // Skip if missing required fields
    if (!title || !externalUrl) continue;

    // Filter out blog posts and non-product items
    if (!looksLikeProduct(title, description, externalUrl)) continue;

    // Extract price from description or title
    const price = extractPrice(description) || extractPrice(title);

    // Skip items without a price (likely not products)
    if (price === null) continue;

    // Skip sold-out products
    if (isSoldOut(title, description)) {
      skippedCount++;
      continue;
    }

    // Extract image
    const image = extractImage(item);

    products.push({
      title,
      price,
      image,
      externalUrl,
      store: storeName,
    });
  }

  return { products, skippedCount };
}
