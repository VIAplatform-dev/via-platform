/**
 * Shopify Storefront API Client
 *
 * Fetches products from any Shopify store using their public Storefront API.
 * Requires:
 * - storeDomain: The Shopify store domain (e.g., "mystore.myshopify.com" or custom domain)
 * - storefrontAccessToken: Public Storefront API access token
 */

export type ShopifyProduct = {
  title: string;
  price: number | null;
  currency: string;
  image: string | null;
  externalUrl: string;
  store: string;
  vendor: string | null;
  productType: string | null;
  availableForSale: boolean;
};

export type ShopifyFetchResult = {
  products: ShopifyProduct[];
  skippedCount: number;
};

type ShopifyImageNode = {
  url: string;
  altText: string | null;
};

type ShopifyPriceV2 = {
  amount: string;
  currencyCode: string;
};

type ShopifyVariantNode = {
  priceV2: ShopifyPriceV2;
  availableForSale: boolean;
};

type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  availableForSale: boolean;
  totalInventory: number;
  priceRange: {
    minVariantPrice: ShopifyPriceV2;
  };
  images: {
    edges: Array<{ node: ShopifyImageNode }>;
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
          vendor
          productType
          availableForSale
          totalInventory
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 1) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 1) {
            edges {
              node {
                priceV2 {
                  amount
                  currencyCode
                }
                availableForSale
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

      const price = parseFloat(node.priceRange.minVariantPrice.amount);
      const currency = node.priceRange.minVariantPrice.currencyCode;
      const imageUrl = node.images.edges[0]?.node.url || null;

      products.push({
        title: node.title,
        price: isNaN(price) ? null : price,
        currency,
        image: imageUrl,
        externalUrl: getProductUrl(normalizedDomain, node.handle),
        store: storeName,
        vendor: node.vendor || null,
        productType: node.productType || null,
        availableForSale: node.availableForSale,
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
  maxProducts: number = 250
): Promise<ShopifyFetchResult> {
  const normalizedDomain = normalizeStoreDomain(storeDomain);
  const products: ShopifyProduct[] = [];
  let skippedCount = 0;
  let page = 1;
  const limit = 250; // Shopify's max per page

  while (products.length < maxProducts) {
    const url = `https://${normalizedDomain}/products.json?limit=${limit}&page=${page}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Store requires authentication. Please provide a Storefront Access Token."
        );
      }
      throw new Error(
        `Failed to fetch products: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (!data.products || data.products.length === 0) {
      break;
    }

    for (const product of data.products) {
      if (products.length >= maxProducts) break;

      const variants = product.variants || [];

      // CONSERVATIVE sold-out detection:
      // Only skip if we have EXPLICIT evidence the product is unavailable.
      //
      // Check 1: product.available === false (explicitly unavailable)
      // Check 2: ALL variants have available === false
      //
      // If data is null/undefined, assume product IS available (conservative)

      let isSoldOut = false;

      // If product.available is explicitly false, it's sold out
      if (product.available === false) {
        isSoldOut = true;
        console.log(`[Shopify] Skipping "${product.title}" - product.available is false`);
      }
      // If product.available is null/undefined, check variant availability
      else if (product.available === null || product.available === undefined) {
        // Check if ALL variants are explicitly unavailable
        const hasVariants = variants.length > 0;
        const allVariantsUnavailable = hasVariants && variants.every(
          (v: { available?: boolean }) => v.available === false
        );

        if (allVariantsUnavailable) {
          isSoldOut = true;
          console.log(`[Shopify] Skipping "${product.title}" - all variants unavailable`);
        }
      }

      if (isSoldOut) {
        skippedCount++;
        continue;
      }

      const variant = variants[0];
      const price = variant?.price ? parseFloat(variant.price) : null;
      const imageUrl = product.images?.[0]?.src || null;

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
        currency: "USD", // Public endpoint doesn't include currency, default to USD
        image: imageUrl,
        externalUrl: `https://${normalizedDomain}/products/${product.handle}`,
        store: storeName,
        vendor: product.vendor || null,
        productType: product.product_type || null,
        availableForSale: isAvailable,
      });
    }

    if (data.products.length < limit) {
      break;
    }

    page++;
  }

  console.log(`[Shopify] ${storeName}: ${products.length} synced, ${skippedCount} skipped (sold out)`);
  return { products, skippedCount };
}

/**
 * Converts ShopifyProduct to the standard RSSProduct format
 * for compatibility with existing product storage
 */
export function toRSSProductFormat(product: ShopifyProduct): {
  title: string;
  price: number | null;
  image: string | null;
  externalUrl: string;
  store: string;
} {
  return {
    title: product.title,
    price: product.price,
    image: product.image,
    externalUrl: product.externalUrl,
    store: product.store,
  };
}
