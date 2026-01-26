import { NextRequest, NextResponse } from "next/server";
import { parseRSSFeed } from "@/app/lib/rssFeedParser";
import { syncProducts, initDatabase } from "@/app/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeName, rssUrl } = body;

    // Validate inputs
    if (!storeName || typeof storeName !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'storeName' parameter" },
        { status: 400 }
      );
    }

    if (!rssUrl || typeof rssUrl !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'rssUrl' parameter" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(rssUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid RSS URL format" },
        { status: 400 }
      );
    }

    // Ensure database table exists
    await initDatabase();

    // Parse the RSS feed
    const { products: rawProducts, skippedCount } = await parseRSSFeed(rssUrl, storeName);

    // Filter out products with null prices and transform for database
    const products = rawProducts
      .filter((p) => p.price !== null)
      .map((p) => ({
        title: p.title,
        price: p.price as number,
        image: p.image ?? undefined,
        externalUrl: p.externalUrl,
      }));

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
      products,
    });
  } catch (error) {
    console.error("RSS sync error:", error);
    return NextResponse.json(
      {
        error: "Failed to sync RSS feed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "RSS Sync API",
    usage: {
      method: "POST",
      body: {
        storeName: "Store Display Name",
        rssUrl: "https://example.com/products?format=rss",
      },
    },
    example: {
      storeName: "LEI Vintage",
      rssUrl: "https://www.leivintage.com/products?format=rss",
    },
  });
}
