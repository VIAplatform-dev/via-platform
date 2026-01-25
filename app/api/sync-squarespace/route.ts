import { NextRequest, NextResponse } from "next/server";
import { parseRSSFeed } from "@/app/lib/rssFeedParser";
import fs from "fs/promises";
import path from "path";

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

    // Parse the RSS feed
    const { products, skippedCount } = await parseRSSFeed(rssUrl, storeName);

    // Create filename from store name (kebab-case)
    const fileName = storeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Write to app/data directory
    const dataDir = path.join(process.cwd(), "app", "data");
    await fs.mkdir(dataDir, { recursive: true });

    const filePath = path.join(dataDir, `${fileName}.json`);
    await fs.writeFile(filePath, JSON.stringify(products, null, 2));

    return NextResponse.json({
      success: true,
      message: `Synced ${products.length} products from ${storeName}`,
      productCount: products.length,
      skippedCount,
      filePath: `app/data/${fileName}.json`,
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
