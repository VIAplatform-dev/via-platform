import { NextResponse } from "next/server";
import { getBaseUrl } from "@/app/lib/base-url";
import { ALL_STORES } from "@/app/lib/storeConfig";
import {
 fetchShopifyProducts,
 fetchShopifyProductsPublic,
 fetchShopifyProductsByCollections,
 fetchProductIdsByCollections,
 toRSSProductFormat,
 scrapeProductPageSections,
} from "@/app/lib/shopifyClient";
import { parseRSSFeed } from "@/app/lib/rssFeedParser";
import { parseSquarespaceJSON, type SquarespaceProduct } from "@/app/lib/squarespaceClient";
import { parseBigCartelJSON } from "@/app/lib/bigcartelClient";
import { fetchSquareProducts } from "@/app/lib/squareClient";
import { fetchStripeProducts } from "@/app/lib/stripeClient";
import { fetchWixProducts } from "@/app/lib/wixClient";
import { stores, convertCurrencyToUSD, refreshExchangeRates } from "@/app/lib/stores";
import { syncProducts, initDatabase, cleanScrapedNavJunk } from "@/app/lib/db";
import { backfillFromProducts } from "@/app/lib/training-data-db";

export async function GET(request: Request) {
 console.log("[Sync Stores] Cron job triggered");

 // Fetch live exchange rates once before syncing all stores
 await refreshExchangeRates();

 const authHeader = request.headers.get("authorization");

 if (!process.env.CRON_SECRET) {
 console.error("[Sync Stores] CRON_SECRET env var is not set!");
 return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
 }

 if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
 console.error("[Sync Stores] Auth failed");
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 await initDatabase();

 const results: { store: string; success: boolean; productCount?: number; error?: string }[] = [];

 for (const store of ALL_STORES) {
 try {
 console.log(`[Sync Stores] Syncing ${store.name}...`);

 const storeSlug = store.name
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-|-$/g, "");

 if (store.type === "shopify") {
 let fetchResult: { products: any[]; skippedCount: number };

 if (store.collectionHandles && store.collectionHandles.length > 0) {
 fetchResult = await fetchShopifyProductsByCollections(
 store.storeDomain,
 store.name,
 store.collectionHandles,
 5000
 );
 } else if (store.storefrontAccessToken) {
 fetchResult = await fetchShopifyProducts(
 store.storeDomain,
 store.storefrontAccessToken,
 store.name,
 1000
 );
 } else {
 const storeInfo = stores.find((s) => s.slug === store.slug) as any;
 // feedCurrency overrides for Markets stores whose products.json is already USD-localized.
 const storeCurrency = storeInfo?.feedCurrency ?? storeInfo?.currency ?? "USD";
 fetchResult = await fetchShopifyProductsPublic(
 store.storeDomain,
 store.name,
 1000,
 storeCurrency,
 store.skipSoldOutFilter === true
 );
 }

 const storeSlug = store.slug;
 const excludedTitles = new Set(
 (store.excludeTitles ?? []).map((t) => t.toLowerCase())
 );
 const excludedKeywords = (store.excludeKeywords ?? []).map((k) => k.toLowerCase());
 const excludedCollectionIds =
 store.excludeCollectionHandles && store.excludeCollectionHandles.length > 0
 ? await fetchProductIdsByCollections(store.storeDomain, store.excludeCollectionHandles)
 : new Set<string>();
 const rawProducts = fetchResult.products.map(toRSSProductFormat);

 // Scrape product pages to pull condition/measurements from tab sections not in body_html.
 // Only scrape products whose body_html is sparse (< 600 plain-text chars) — stores that
 // already write rich descriptions won't be hit, keeping sync time reasonable.
 if (store.scrapeProductPage) {
 const toScrape = rawProducts.filter((p) => {
 const plain = (p.description || "").replace(/<[^>]+>/g, "").trim();
 return plain.length < 600;
 });
 const CONCURRENCY = 5;
 for (let i = 0; i < toScrape.length; i += CONCURRENCY) {
 const batch = toScrape.slice(i, i + CONCURRENCY);
 await Promise.all(
 batch.map(async (p) => {
 const descriptionIsEmpty = !(p.description || "").replace(/<[^>]+>/g, "").trim();
 const scraped = await scrapeProductPageSections(p.externalUrl, descriptionIsEmpty);
 if (scraped.html) p.description = (p.description || "") + scraped.html;
 if (scraped.condition) p.condition = scraped.condition;
 if (scraped.materials) p.materials = scraped.materials;
 if (scraped.measurements) p.measurements = scraped.measurements;
 })
 );
 }
 if (toScrape.length > 0) {
 console.log(`[Sync Stores] Scraped ${toScrape.length} product pages for ${store.name}`);
 }
 }

 const products = rawProducts
 .filter((p) => p.price !== null)
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
 description: p.description ?? undefined,
 variantId: p.variantId ?? undefined,
 shopifyProductId: p.shopifyProductId ?? undefined,
 size: p.size ?? undefined,
 productType: p.productType ?? undefined,
 brand: (p as any).vendor ?? undefined,
 condition: p.condition ?? undefined,
 materials: p.materials ?? undefined,
 measurements: p.measurements ?? undefined,
 tags: p.tags ?? undefined,
 available: p.available, // sold-out items (only fetched when skipSoldOutFilter) → preserved in sold_items, not the catalog
 compareAtPrice: p.compareAtPrice != null
 ? convertCurrencyToUSD(p.compareAtPrice as number, storeCurrency)
 : undefined,
 };
 });

 const { count: productCount } = await syncProducts(storeSlug, store.name, products, {
 excludeKeywords: store.excludeKeywords,
 excludeTitles: store.excludeTitles,
 });
 results.push({ store: store.name, success: true, productCount });
 } else if (store.type === "bigcartel") {
 const { products: rawProducts } = await parseBigCartelJSON(
 store.storeSlug,
 store.name
 );

 const products = rawProducts
 .filter((p) => p.price != null)
 .map((p) => ({
 title: p.title,
 price: p.price,
 compareAtPrice: p.compareAtPrice ?? undefined,
 image: p.image ?? undefined,
 images: p.images,
 externalUrl: p.externalUrl,
 description: p.description ?? undefined,
 }));

 const { count: productCount } = await syncProducts(store.slug, store.name, products);
 results.push({ store: store.name, success: true, productCount });
 } else if (store.type === "square") {
 const storeInfo = stores.find((s) => s.slug === store.slug);
 const websiteUrl = storeInfo?.website ?? "https://vyaplatform.com";
 const { products: rawProducts, skippedCount } = await fetchSquareProducts(
 store.locationId,
 store.name,
 websiteUrl,
 store.accessTokenEnvVar,
 );
 const mappedProducts = rawProducts
 .filter((p) => p.price > 0)
 .map((p) => ({
 title: p.title,
 price: p.price,
 compareAtPrice: p.compareAtPrice ?? undefined,
 image: p.image ?? undefined,
 images: p.images,
 externalUrl: p.externalUrl,
 description: p.description ?? undefined,
 size: p.size ?? undefined,
 variantId: p.variantId ?? undefined,
 }));
 const { count: productCount } = await syncProducts(store.slug, store.name, mappedProducts);
 console.log(`[Sync Stores] Square: ${store.name} synced ${productCount} products, skipped ${skippedCount}`);
 results.push({ store: store.name, success: true, productCount });
 } else if (store.type === "stripe") {
 const { products: rawProducts, skippedCount } = await fetchStripeProducts(
 store.secretKeyEnvVar,
 store.websiteUrl,
 );
 const mappedProducts = rawProducts
 .filter((p) => p.price > 0)
 .map((p) => ({
 title: p.title,
 price: p.price,
 compareAtPrice: p.compareAtPrice ?? undefined,
 image: p.image ?? undefined,
 images: p.images,
 externalUrl: p.externalUrl,
 description: p.description ?? undefined,
 variantId: p.variantId ?? undefined,
 }));
 const { count: productCount } = await syncProducts(store.slug, store.name, mappedProducts);
 console.log(`[Sync Stores] Stripe: ${store.name} synced ${productCount} products, skipped ${skippedCount}`);
 results.push({ store: store.name, success: true, productCount });
 } else if (store.type === "wix") {
 const apiKey = process.env[store.apiKeyEnvVar];
 if (!apiKey) {
 results.push({ store: store.name, success: false, error: `Missing env var ${store.apiKeyEnvVar}` });
 continue;
 }
 const storeInfo = stores.find((s) => s.slug === store.slug);
 const websiteUrl = storeInfo?.website ?? "https://vyaplatform.com";
 const { products: rawProducts, skippedCount } = await fetchWixProducts(
 store.siteId,
 apiKey,
 store.name,
 websiteUrl,
 );
 const mappedProducts = rawProducts
 .filter((p) => p.price > 0)
 .map((p) => ({
 title: p.title,
 price: p.price,
 compareAtPrice: p.compareAtPrice ?? undefined,
 image: p.image ?? undefined,
 images: p.images,
 externalUrl: p.externalUrl,
 description: p.description ?? undefined,
 size: p.size ?? undefined,
 variantId: p.variantId ?? undefined,
 }));
 const { count: productCount } = await syncProducts(store.slug, store.name, mappedProducts, {
 excludeKeywords: store.excludeKeywords,
 excludeTitles: store.excludeTitles,
 });
 console.log(`[Sync Stores] Wix: ${store.name} synced ${productCount} products, skipped ${skippedCount}`);
 results.push({ store: store.name, success: true, productCount });
 } else {
 // Squarespace
 let rawProducts;
 if (store.shopUrls && store.shopUrls.length > 0) {
 // Multi-URL store — fetch each, merge, dedupe by title
 const seen = new Set<string>();
 const merged: SquarespaceProduct[] = [];
 for (const url of store.shopUrls) {
 try {
  const result = await parseSquarespaceJSON(url, store.name);
  for (const p of result.products) {
  if (!seen.has(p.title)) {
   seen.add(p.title);
   merged.push(p);
  }
  }
 } catch (err) {
  console.error(`[Sync Stores] ${store.name}: failed ${url}:`, err);
 }
 }
 rawProducts = merged;
 } else if (store.shopUrl) {
 const result = await parseSquarespaceJSON(store.shopUrl, store.name);
 rawProducts = result.products;
 } else if (store.rssUrl) {
 const result = await parseRSSFeed(store.rssUrl, store.name);
 rawProducts = result.products;
 } else {
 results.push({ store: store.name, success: false, error: "No URL configured" });
 continue;
 }

 const products = rawProducts
 .filter((p) => p.price !== null)
 .map((p) => ({
 title: p.title,
 price: p.price as number,
 compareAtPrice: ("compareAtPrice" in p && typeof p.compareAtPrice === "number" ? p.compareAtPrice : null) ?? undefined,
 image: p.image ?? undefined,
 images: p.images,
 externalUrl: p.externalUrl,
 description: p.description ?? undefined,
 size: p.size ?? undefined,
 }));

 if (products.length === 0) {
 console.warn(`[Sync Stores] ${store.name}: 0 products from feed, skipping sync to avoid data loss`);
 results.push({ store: store.name, success: false, error: "0 products returned — skipped to prevent data loss" });
 continue;
 }

 const { count: productCount } = await syncProducts(store.slug, store.name, products);
 results.push({ store: store.name, success: true, productCount });
 }

 console.log(`[Sync Stores] ${store.name} synced successfully`);
 } catch (error) {
 const errMsg = error instanceof Error ? error.message : String(error);
 console.error(`[Sync Stores] Failed to sync ${store.name}:`, errMsg);
 results.push({ store: store.name, success: false, error: errMsg });
 }
 }

 const succeeded = results.filter((r) => r.success).length;
 const failed = results.filter((r) => !r.success).length;

 console.log(`[Sync Stores] Done — ${succeeded} succeeded, ${failed} failed`);

 // Learn from the sync: every newly-synced listing becomes a labeled training example
 // (idempotent), then trigger the reference-index embedder so the pieces are visually
 // searchable right away — coupling "pull Shopify over" to "learn + cache" in one pass.
 try {
 const added = await backfillFromProducts();
 const baseUrl = getBaseUrl();
 await fetch(`${baseUrl}/api/cron/embed-reference-index`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).catch(() => {});
 console.log(`[Sync Stores] Training capture: +${added} new examples, embedder triggered`);
 } catch (err) {
 console.error("[Sync Stores] Training capture failed:", err);
 }

 // Run favorite notifications after sync
 let notificationResult = null;
 try {
 const baseUrl = getBaseUrl();
 const res = await fetch(`${baseUrl}/api/cron/favorite-notifications`, {
 headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
 });
 notificationResult = await res.json();
 console.log("[Sync Stores] Favorite notifications:", notificationResult);
 } catch (err) {
 console.error("[Sync Stores] Favorite notifications failed:", err);
 }

 // Run collabs link generation after sync so new products get links right away
 let collabsResult = null;
 try {
 const baseUrl = getBaseUrl();
 const res = await fetch(`${baseUrl}/api/cron/generate-collabs-links`, {
 headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
 });
 collabsResult = await res.json();
 console.log("[Sync Stores] Collabs link generation:", collabsResult);
 } catch (err) {
 console.error("[Sync Stores] Collabs link generation failed:", err);
 }

 // Self-heal any leftover scrape-nav pollution in condition/materials/measurements.
 const junkCleaned = await cleanScrapedNavJunk().catch(() => 0);
 if (junkCleaned) console.log(`[Sync Stores] cleaned scrape-nav junk from ${junkCleaned} products`);

 return NextResponse.json({
 success: failed === 0,
 stores: results,
 summary: { total: results.length, succeeded, failed },
 notifications: notificationResult,
 collabsLinks: collabsResult,
 junkCleaned,
 });
}
