import { stores } from "@/app/lib/stores";

export const COLLABS_GRAPHQL_URL = "https://api.collabs.shopify.com/creator/graphql";

export const COLLABS_STORES = stores
  .filter((s) => "collabsStoreId" in s)
  .map((s) => ({
    slug: s.slug,
    name: s.name,
    collabsStoreId: (s as any).collabsStoreId as string,
  }));

export const COLLABS_STORE_SLUGS = new Set(COLLABS_STORES.map((s) => s.slug));

// Query to list products for a store. Returns Collabs IDs, Shopify IDs, and existing affiliate links
const PRODUCTS_QUERY = `
  query ProductsQuery($searchParams: ProductsSearchInput!, $first: Int, $after: String, $seed: String!) {
    products(searchParams: $searchParams, first: $first, after: $after, seed: $seed) {
      nodes {
        id
        title
        shopifyProductId
        affiliateProduct {
          url
        }
      }
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// Mutation to create an affiliate link for a product (uses Collabs internal product ID)
const CREATE_MUTATION = `
  mutation ProductListAffiliateProductCreateMutation($input: AffiliateProductCreateInput!) {
    affiliateProductCreate(input: $input) {
      affiliateProduct {
        url
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export type CollabsProduct = {
  id: string;
  title: string;
  shopifyProductId: string;
  affiliateProduct: { url: string } | null;
};

export async function fetchCollabsProducts(
  collabsStoreId: string,
  cookie: string,
  csrfToken: string
): Promise<{ products: CollabsProduct[]; totalCount: number | null; error: string | null }> {
  const all: CollabsProduct[] = [];
  let after: string | null = null;
  let totalCount: number | null = null;
  const gid = `gid://dovetale-api/ShopifyStore/${collabsStoreId}`;

  // Generate the seed once and reuse it for all pages so the Collabs API
  // returns a consistent ordering. Changing seed per page causes different
  // random orderings, meaning some products never appear and others repeat.
  const seed = [8, 4, 4, 4, 8]
    .map((n) =>
      Array.from(crypto.getRandomValues(new Uint8Array(n / 2)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    )
    .join("-")
    .toUpperCase();

  while (true) {
    let fetchRes: Response;
    try {
      fetchRes = await fetch(COLLABS_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-Csrf-Token": csrfToken,
        },
        body: JSON.stringify({
          operationName: "ProductsQuery",
          query: PRODUCTS_QUERY,
          variables: {
            first: 100,
            after,
            seed,
            searchParams: {
              brandValues: [],
              categories: [],
              shopifyStoreId: gid,
            },
          },
        }),
      });
    } catch (e) {
      return {
        products: all,
        totalCount,
        error: `Fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    if (!fetchRes.ok) {
      const text = await fetchRes.text().catch(() => "");
      return { products: all, totalCount, error: `HTTP ${fetchRes.status}: ${text.slice(0, 300)}` };
    }

    const json = await fetchRes.json();
    const products = json?.data?.products;
    if (!products?.nodes) {
      return {
        products: all,
        totalCount,
        error: `Unexpected response: ${JSON.stringify(json).slice(0, 300)}`,
      };
    }

    if (totalCount === null && products.totalCount != null) {
      totalCount = products.totalCount;
    }
    all.push(...products.nodes);

    if (products.pageInfo?.hasNextPage && products.pageInfo.endCursor) {
      after = products.pageInfo.endCursor;
      await new Promise((r) => setTimeout(r, 200));
    } else {
      break;
    }
  }

  return { products: all, totalCount, error: null };
}

export async function createAffiliateLink(
  collabsProductId: string,
  cookie: string,
  csrfToken: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const res = await fetch(COLLABS_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-Csrf-Token": csrfToken,
      },
      body: JSON.stringify({
        operationName: "ProductListAffiliateProductCreateMutation",
        query: CREATE_MUTATION,
        variables: {
          input: {
            productId: collabsProductId,
            origin: "LINK_GENERATION",
          },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { url: null, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    const userErrors = data?.data?.affiliateProductCreate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      return {
        url: null,
        error: userErrors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    const url = data?.data?.affiliateProductCreate?.affiliateProduct?.url ?? null;
    return { url, error: url ? null : "No URL in response" };
  } catch (e) {
    return {
      url: null,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
