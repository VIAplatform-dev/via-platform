import { NextRequest, NextResponse } from "next/server";
import { parseRSSFeed } from "@/app/lib/rssFeedParser";
import { parseSquarespaceJSON, type SquarespaceProduct } from "@/app/lib/squarespaceClient";
import { syncProducts, initDatabase } from "@/app/lib/db";

export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const { storeName, rssUrl, shopUrl, shopUrls } = body as {
 storeName?: string;
 rssUrl?: string;
 shopUrl?: string;
 shopUrls?: string[];
 };

 if (!storeName || typeof storeName !== "string") {
 return NextResponse.json(
 { error: "Missing or invalid 'storeName' parameter" },
 { status: 400 }
 );
 }

 const hasMultiUrls = Array.isArray(shopUrls) && shopUrls.length > 0;
 const url = shopUrl || rssUrl;
 if (!hasMultiUrls && (!url || typeof url !== "string")) {
 return NextResponse.json(
 { error: "Missing or invalid 'shopUrl', 'shopUrls', or 'rssUrl' parameter" },
 { status: 400 }
 );
 }

 // Validate URL format
 const urlsToValidate = hasMultiUrls ? shopUrls! : [url!];
 for (const u of urlsToValidate) {
 try {
  new URL(u);
 } catch {
  return NextResponse.json(
  { error: `Invalid URL format: ${u}` },
  { status: 400 }
  );
 }
 }

 // Ensure database table exists
 await initDatabase();

 let rawProducts;
 let skippedCount = 0;

 if (hasMultiUrls) {
 // Multi-URL store: fetch each, merge, dedupe by title
 const seen = new Set<string>();
 const merged: SquarespaceProduct[] = [];
 for (const u of shopUrls!) {
 try {
  const result = await parseSquarespaceJSON(u, storeName);
  skippedCount += result.skippedCount;
  for (const p of result.products) {
  if (!seen.has(p.title)) {
   seen.add(p.title);
   merged.push(p);
  }
  }
 } catch (err) {
  console.error(`[sync-squarespace] Failed ${u}:`, err);
 }
 }
 rawProducts = merged;
 } else if (shopUrl) {
 const result = await parseSquarespaceJSON(shopUrl, storeName);
 rawProducts = result.products;
 skippedCount = result.skippedCount;
 } else {
 const result = await parseRSSFeed(rssUrl!, storeName);
 rawProducts = result.products;
 skippedCount = result.skippedCount;
 }

 // Filter out products with null prices and transform for database
 const products = rawProducts
 .filter((p) => p.price !== null)
 .map((p) => ({
 title: p.title,
 price: p.price as number,
 image: p.image ?? undefined,
 images: p.images,
 externalUrl: p.externalUrl,
 description: p.description ?? undefined,
 compareAtPrice: ("compareAtPrice" in p && typeof (p as { compareAtPrice?: unknown }).compareAtPrice === "number" ? (p as { compareAtPrice: number }).compareAtPrice : null) ?? undefined,
 }));

 if (products.length === 0) {
 return NextResponse.json({
 success: false,
 error: "0 products returned from store. Sync skipped to prevent data loss",
 skippedCount,
 });
 }

 // Create store slug from store name (kebab-case)
 const storeSlug = storeName
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-|-$/g, "");

 // Sync products to database
 const { count: productCount, inserted, updated } = await syncProducts(storeSlug, storeName, products);

 return NextResponse.json({
 success: true,
 message: `Synced ${productCount} products from ${storeName}`,
 productCount,
 inserted,
 updated,
 skippedCount,
 storeSlug,
 });
 } catch (error) {
 console.error("Squarespace sync error:", error);
 return NextResponse.json(
 {
 error: "Failed to sync Squarespace store",
 details: error instanceof Error ? error.message : "Unknown error",
 },
 { status: 500 }
 );
 }
}

export async function GET() {
 return NextResponse.json({
 message: "Squarespace Sync API",
 usage: {
 method: "POST",
 body: {
 storeName: "Store Display Name",
 shopUrl: "https://example.com/shop (recommended. Uses JSON API with prices)",
 rssUrl: "https://example.com/products?format=rss (fallback: may lack prices)",
 },
 },
 example: {
 storeName: "LEI Vintage",
 shopUrl: "https://www.leivintage.com/shop",
 },
 });
}
