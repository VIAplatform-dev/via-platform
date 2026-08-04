import { NextRequest, NextResponse } from "next/server";
import {
 fetchShopifyProducts,
 fetchShopifyProductsPublic,
 fetchShopifyProductsByCollections,
 fetchProductIdsByCollections,
 testShopifyConnection,
 toRSSProductFormat,
 scrapeProductPageSections,
} from "@/app/lib/shopifyClient";
import { syncProducts, initDatabase } from "@/app/lib/db";
import { backfillFromProducts } from "@/app/lib/training-data-db";
import { convertCurrencyToUSD, refreshExchangeRates, stores } from "@/app/lib/stores";
import { ALL_STORES } from "@/app/lib/storeConfig";
import { getPriceDropCandidates, recordPriceDropNotificationsSent } from "@/app/lib/notification-db";
import { sendPriceDropEmails } from "@/app/lib/email";

// Strip "reach out to <email>" / contact-request boilerplate that sellers put in
// their product descriptions — on VYA, buyers contact through the store, not the
// seller's email, so these lines shouldn't surface on listings.
function stripContactLines(desc: string | null | undefined): string | undefined {
 if (!desc) return desc ?? undefined;
 const cleaned = desc
 // remove any text span that contains an email address (the reach-out lines)
 .replace(/[^.!?<>\n]*\b[\w.+-]+@[\w.-]+\.\w{2,}\b[^.!?<>\n]*/gi, "")
 // tidy emptied tags, leftover ":)" emoticons, and doubled breaks
 .replace(/<p>\s*(?::\))?\s*<\/p>/gi, "")
 .replace(/(<br\s*\/?>\s*){2,}/gi, "<br>")
 .replace(/[ \t]{2,}/g, " ")
 .trim();
 return cleaned || undefined;
}

export async function POST(request: NextRequest) {
 try {
 // Fetch live exchange rates before any price conversion
 await refreshExchangeRates();

 const body = await request.json();
 const { storeName, storeSlug: providedSlug, storeDomain, storefrontAccessToken, maxProducts, collectionHandles } = body;

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

 // If collection handles provided, use collection-based fetch (no token required)
 if (Array.isArray(collectionHandles) && collectionHandles.length > 0) {
 fetchResult = await fetchShopifyProductsByCollections(
 storeDomain,
 storeName,
 collectionHandles,
 maxProducts || 5000
 );
 } else if (storefrontAccessToken && typeof storefrontAccessToken === "string") {
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
 maxProducts || 1000
 );
 } else {
 // Try public products.json endpoint (no token required)
 try {
 const storeEntry = stores.find((s) => s.slug === providedSlug || s.name.toLowerCase() === storeName.toLowerCase()) as any;
 // feedCurrency overrides for Markets stores whose products.json is already USD-localized.
 const storeCurrency = storeEntry?.feedCurrency ?? storeEntry?.currency ?? "USD";
 const skipSoldOut = (storeEntry as any)?.skipSoldOutFilter === true;
 fetchResult = await fetchShopifyProductsPublic(
 storeDomain,
 storeName,
 maxProducts || 1000,
 storeCurrency,
 skipSoldOut
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

 // Use provided slug if available, otherwise derive from store name (kebab-case)
 const storeSlug = (providedSlug && typeof providedSlug === "string")
 ? providedSlug
 : storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

 // Look up store config to apply keyword/title exclusions
 const storeConfig = ALL_STORES.find(
 (s) => s.slug === storeSlug || s.name.toLowerCase() === storeName.toLowerCase()
 );
 const excludedTitles = new Set(
 ((storeConfig as any)?.excludeTitles ?? []).map((t: string) => t.toLowerCase())
 );
 const excludedKeywords: string[] = ((storeConfig as any)?.excludeKeywords ?? []).map(
 (k: string) => k.toLowerCase()
 );
 const excludeCollectionHandles: string[] = (storeConfig as any)?.excludeCollectionHandles ?? [];
 const excludedCollectionIds =
 excludeCollectionHandles.length > 0
 ? await fetchProductIdsByCollections(storeDomain, excludeCollectionHandles)
 : new Set<string>();

 // Convert to standard format for storage, filtering out null prices and excluded titles/keywords
 const rawProducts = fetchResult.products.map(toRSSProductFormat);

 // For stores with scrapeProductPage, enrich descriptions with metafield sections
 // scraped from the product page HTML (e.g. Condition, Dimensions)
 const shouldScrape = (storeConfig as any)?.scrapeProductPage === true;
 if (shouldScrape) {
 await Promise.all(
 rawProducts.map(async (p) => {
 const descriptionIsEmpty = !(p.description || "").replace(/<[^>]+>/g, "").trim();
 const scraped = await scrapeProductPageSections(p.externalUrl, descriptionIsEmpty);
 if (scraped.html) p.description = (p.description || "") + scraped.html;
 // Keep the seller's own condition/materials/measurements structured (not just in the blurb).
 if (scraped.condition) p.condition = scraped.condition;
 if (scraped.materials) p.materials = scraped.materials;
 if (scraped.measurements) p.measurements = scraped.measurements;
 })
 );
 }
 const products = rawProducts
 // Drop null AND $0 prices. A $0 item on a resale marketplace is never a real listing.
 // It means a missing price, a rental (e.g. Venus Vintage rents most pieces, which sync as $0),
 // or "contact for price". Skipping them keeps unbuyable items off the site for every store.
 .filter((p) => p.price !== null && Number(p.price) > 0)
 .filter((p) => !excludedTitles.has(p.title.toLowerCase()))
 .filter((p) => !excludedKeywords.some((kw) => p.title.toLowerCase().includes(kw)))
 .filter((p) => !p.shopifyProductId || !excludedCollectionIds.has(p.shopifyProductId))
 .map((p) => {
 const storeCurrency = p.currency || "USD";
 return {
 title: p.title,
 price: convertCurrencyToUSD(p.price as number, storeCurrency),
 currency: "USD",
 image: p.image ?? undefined,
 images: p.images,
 videoUrl: p.videoUrl ?? undefined,
 externalUrl: p.externalUrl,
 description: stripContactLines(p.description),
 variantId: p.variantId ?? undefined,
 shopifyProductId: p.shopifyProductId ?? undefined,
 size: p.size ?? undefined,
 condition: p.condition ?? undefined,
 materials: p.materials ?? undefined,
 measurements: p.measurements ?? undefined,
 tags: p.tags ?? undefined,
 compareAtPrice: p.compareAtPrice != null
 ? convertCurrencyToUSD(p.compareAtPrice as number, storeCurrency)
 : undefined,
 };
 });
 const skippedCount = fetchResult.skippedCount;

 // Sync products to database
 const { count: productCount, inserted, updated, priceDrops } = await syncProducts(storeSlug, storeName, products);

 // Learn from the import: every synced listing becomes a labeled training example
 // immediately (idempotent — ON CONFLICT DO NOTHING), so a store pulling their Shopify
 // over feeds the reference dataset right away. They're also usable as VYA comps at once
 // (getVyaComps reads the products table live); photo embedding follows via the
 // embed-reference-index cron. Never let a training-capture hiccup break the sync.
 await backfillFromProducts().catch(() => {});

 // Price drop emails disabled

 return NextResponse.json({
 success: true,
 message: `Synced ${productCount} products from ${storeName}`,
 productCount,
 inserted,
 updated,
 skippedCount,
 storeSlug,
 shopName,
 products,
 priceDrops: priceDrops.length,
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
