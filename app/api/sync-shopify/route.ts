import { NextRequest, NextResponse } from "next/server";
import {
  fetchShopifyProducts,
  fetchShopifyProductsPublic,
  testShopifyConnection,
  toRSSProductFormat,
} from "@/app/lib/shopifyClient";
import { syncProducts, initDatabase } from "@/app/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeName, storeDomain, storefrontAccessToken, maxProducts } = body;

    // Validate inputs
    if (!storeName || typeof storeName !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'storeName' parameter" },
        { status: 400 }
      );
    }

    if (!storeDomain || typeof storeDomain !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'storeDomain' parameter" },
        { status: 400 }
      );
    }

    // Ensure database table exists
    await initDatabase();

    let fetchResult: { products: any[]; skippedCount: number };
    let shopName: string | undefined;

    // If token provided, use Storefront API
    if (storefrontAccessToken && typeof storefrontAccessToken === "string") {
      // Test connection first
      const connectionTest = await testShopifyConnection(
        storeDomain,
        storefrontAccessToken
      );

      if (!connectionTest.success) {
        return NextResponse.json(
          {
            error: "Failed to connect to Shopify store",
            details: connectionTest.error,
          },
          { status: 400 }
        );
      }

      shopName = connectionTest.shopName;

      // Fetch products via Storefront API
      fetchResult = await fetchShopifyProducts(
        storeDomain,
        storefrontAccessToken,
        storeName,
        maxProducts || 250
      );
    } else {
      // Try public products.json endpoint (no token required)
      try {
        fetchResult = await fetchShopifyProductsPublic(
          storeDomain,
          storeName,
          maxProducts || 250
        );
      } catch (publicError) {
        return NextResponse.json(
          {
            error: "Failed to fetch products from public endpoint",
            details:
              publicError instanceof Error
                ? publicError.message
                : "Unknown error. This store may require a Storefront Access Token.",
          },
          { status: 400 }
        );
      }
    }

    // Convert to standard format for storage, filtering out null prices
    const rawProducts = fetchResult.products.map(toRSSProductFormat);
    const products = rawProducts
      .filter((p) => p.price !== null)
      .map((p) => ({
        title: p.title,
        price: p.price as number,
        image: p.image ?? undefined,
        externalUrl: p.externalUrl,
      }));
    const skippedCount = fetchResult.skippedCount;

    // Create store slug from store name (kebab-case)
    const storeSlug = storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Sync products to database
    const productCount = await syncProducts(storeSlug, storeName, products);

    return NextResponse.json({
      success: true,
      message: `Synced ${productCount} products from ${storeName}`,
      productCount,
      skippedCount,
      storeSlug,
      shopName,
      products,
    });
  } catch (error) {
    console.error("Shopify sync error:", error);
    return NextResponse.json(
      {
        error: "Failed to sync Shopify store",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Shopify Sync API",
    description:
      "Sync products from any Shopify store using their Storefront API",
    usage: {
      method: "POST",
      body: {
        storeName: "Store Display Name",
        storeDomain: "mystore.myshopify.com",
        storefrontAccessToken: "your-storefront-access-token",
        maxProducts: 250,
      },
    },
    notes: {
      storefrontAccessToken:
        "Get this from your Shopify admin: Settings > Apps and sales channels > Develop apps",
      storeDomain:
        "Can be either mystore.myshopify.com or a custom domain like www.mystore.com",
      maxProducts: "Optional, defaults to 250. Maximum products to fetch.",
    },
  });
}
