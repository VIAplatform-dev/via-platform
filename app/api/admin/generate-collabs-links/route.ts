import { NextRequest, NextResponse } from "next/server";
import {
 getProductsMissingCollabsLink,
 getProductsWithCollabsLinks,
 updateCollabsLinkByShopifyProductId,
 getSyncedStores,
 getShopifyIdCoverage,
 deletePermanentlyStuckProducts,
} from "@/app/lib/db";
import {
 COLLABS_STORES,
 COLLABS_STORE_SLUGS,
 fetchCollabsProducts,
 createAffiliateLink,
} from "@/app/lib/collabs";

// Allow up to 5 minutes for bulk generation
export const maxDuration = 300;

// Simple hash function: must match middleware
function hashPassword(password: string): string {
 const crypto = require("crypto");
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;

 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;

 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (adminToken && adminToken === hashPassword(adminPassword)) return true;

 return false;
}

/**
 * POST /api/admin/generate-collabs-links
 *
 * Fetches all products from Collabs for each store, grabs existing affiliate
 * URLs, creates new ones where missing, and saves them to VYA's database.
 * Streams progress as newline-delimited JSON.
 */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const body = await request.json().catch(() => ({}));
 const { cookie, csrfToken, storeSlug } = body as {
 cookie?: string;
 csrfToken?: string;
 storeSlug?: string;
 };

 if (!cookie || !csrfToken) {
 return NextResponse.json(
 { error: "cookie and csrfToken are required" },
 { status: 400 }
 );
 }

 const targetStores = storeSlug
 ? COLLABS_STORES.filter((s) => s.slug === storeSlug)
 : COLLABS_STORES;

 if (targetStores.length === 0) {
 return NextResponse.json(
 { error: `Store '${storeSlug}' not found` },
 { status: 400 }
 );
 }

 // Get products missing collabs links from VYA's database.
 // Build a map from numeric Shopify ID → the exact DB value (may be a full GID
 // like "gid://shopify/Product/12345" or just the numeric string. Normalise
 // to the numeric suffix so it matches what the Collabs API returns).
 const missingProducts = await getProductsMissingCollabsLink(storeSlug);
 // numericId → dbShopifyId (the exact string stored in the DB, used for the UPDATE)
 const missingByShopifyId = new Map<string, string>(
 missingProducts
 .filter((p) => p.shopify_product_id && COLLABS_STORE_SLUGS.has(p.store_slug))
 .map((p) => {
 const dbId = p.shopify_product_id!;
 const numericId = dbId.match(/(\d+)$/)?.[1] ?? dbId;
 return [numericId, dbId] as [string, string];
 })
 );

 const encoder = new TextEncoder();
 const stream = new ReadableStream({
 async start(controller) {
 let saved = 0;
 let created = 0;
 let failed = 0;
 let skipped = 0;
 let rateLimited = false;
 let rateLimitSkipped = 0;
 const skippedProducts: Array<{ title: string; store: string; shopifyId: string }> = [];

 function send(data: Record<string, unknown>) {
 controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
 }

 send({ type: "start", stores: targetStores.length, missingInDb: missingByShopifyId.size });


 for (const store of targetStores) {
 send({ type: "store", store: store.name, slug: store.slug });

 // Fetch all products from Collabs for this store
 const fetchResult = await fetchCollabsProducts(
 store.collabsStoreId,
 cookie,
 csrfToken
 );
 const collabsProducts = fetchResult.products;

 if (fetchResult.error) {
 send({
 type: "fetch_error",
 store: store.name,
 error: fetchResult.error,
 });
 }

 const collabsTotalCount = fetchResult.totalCount;
 const paginationMismatch = collabsTotalCount !== null && collabsProducts.length < collabsTotalCount;

 // Build per-store debug info: how many of this store's missing products appear in Collabs
 const storeMissingIds = new Set(
 missingProducts
 .filter((p) => p.store_slug === store.slug && p.shopify_product_id)
 .map((p) => {
 const dbId = p.shopify_product_id!;
 return dbId.match(/(\d+)$/)?.[1] ?? dbId;
 })
 );
 const collabsIdsForStore = collabsProducts
 .map((p) => p.shopifyProductId?.match(/(\d+)$/)?.[1] ?? null)
 .filter(Boolean) as string[];
 const matchedCount = collabsIdsForStore.filter((id) => storeMissingIds.has(id)).length;

 send({
 type: "store_products",
 store: store.name,
 count: collabsProducts.length,
 totalCount: collabsTotalCount,
 paginationMismatch,
 debug: storeMissingIds.size > 0 ? {
 missingCount: storeMissingIds.size,
 foundInCollabs: matchedCount,
 collabsSampleIds: collabsIdsForStore.slice(0, 3),
 dbSampleIds: Array.from(storeMissingIds).slice(0, 3),
 } : undefined,
 });

 for (const product of collabsProducts) {
 // Extract the numeric Shopify product ID from the GID
 const shopifyId = product.shopifyProductId?.match(/(\d+)$/)?.[1];
 const dbShopifyId = shopifyId ? missingByShopifyId.get(shopifyId) : undefined;
 if (!shopifyId || !dbShopifyId) {
 skipped++;
 skippedProducts.push({
 title: product.title,
 store: store.slug,
 shopifyId: shopifyId ?? product.shopifyProductId ?? "unknown",
 });
 continue;
 }

 let collabsUrl = product.affiliateProduct?.url || null;

 // If no existing affiliate link, create one using the Collabs product ID
 if (!collabsUrl) {
 if (rateLimited) {
 // Already hit daily limit. Skip creating but count it
 rateLimitSkipped++;
 continue;
 }

 const result = await createAffiliateLink(
 product.id,
 cookie,
 csrfToken
 );
 if (result.url) {
 collabsUrl = result.url;
 created++;
 } else {
 failed++;
 // Detect daily limit and stop trying to create new links
 if (result.error?.includes("Daily links limit")) {
 rateLimited = true;
 send({
 type: "rate_limit",
 store: store.name,
 message: "Daily links limit reached. Will save existing links only.",
 });
 } else {
 send({
 type: "error",
 product: product.title,
 store: store.name,
 error: result.error,
 });
 }
 await new Promise((r) => setTimeout(r, 300));
 continue;
 }
 }

 // Save to VYA's database using the exact ID stored in DB
 if (collabsUrl) {
 await updateCollabsLinkByShopifyProductId(dbShopifyId, collabsUrl);
 saved++;
 missingByShopifyId.delete(shopifyId);

 send({
 type: "progress",
 saved,
 created,
 failed,
 skipped,
 product: product.title,
 store: store.name,
 url: collabsUrl,
 });
 }

 // Rate-limit
 await new Promise((r) => setTimeout(r, 200));
 }
 }

 send({
 type: "done",
 success: failed === 0 && rateLimitSkipped === 0,
 saved,
 created,
 failed,
 skipped,
 rateLimitSkipped,
 skippedProducts,
 });

 controller.close();
 },
 });

 return new Response(stream, {
 headers: {
 "Content-Type": "application/x-ndjson",
 "Transfer-Encoding": "chunked",
 },
 });
}

/**
 * GET /api/admin/generate-collabs-links
 * Returns stats on how many products need collabs links generated.
 */
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const products = await getProductsMissingCollabsLink();
 const candidates = products.filter((p) =>
 COLLABS_STORE_SLUGS.has(p.store_slug)
 );

 const byStore = candidates.reduce(
 (acc, p) => {
 acc[p.store_slug] = (acc[p.store_slug] || 0) + 1;
 return acc;
 },
 {} as Record<string, number>
 );

 // Get sample products with collabs links for verification
 const withLinks = await getProductsWithCollabsLinks(undefined, 10);
 const sampleLinks = withLinks.map((p) => ({
 id: p.id,
 title: p.title,
 storeSlug: p.store_slug,
 collabsLink: p.collabs_link,
 compositeId: `${p.store_slug}-${p.id}`,
 }));

 // Follow one collabs.shop link to see the redirect structure
 let redirectInfo: { collabsLink: string; redirectsTo: string } | null = null;
 if (sampleLinks.length > 0 && sampleLinks[0].collabsLink) {
 try {
 const res = await fetch(sampleLinks[0].collabsLink, { redirect: "manual" });
 const location = res.headers.get("location");
 if (location) {
 redirectInfo = {
 collabsLink: sampleLinks[0].collabsLink,
 redirectsTo: location,
 };
 }
 } catch {
 // ignore
 }
 }

 // Debug: show all stores in DB with their product counts
 const syncedStores = await getSyncedStores();
 const dbStoreCounts = syncedStores.reduce(
 (acc, s) => {
 acc[s.store_slug] = s.product_count;
 return acc;
 },
 {} as Record<string, number>
 );

 // Debug: shopify_product_id coverage per collabs store
 const shopifyIdCoverage = await getShopifyIdCoverage(Array.from(COLLABS_STORE_SLUGS));

 // Build per-store list of stuck products with age info
 const now = Date.now();
 const ONE_DAY_MS = 24 * 60 * 60 * 1000;
 const stuckByStore: Record<string, Array<{ title: string; daysOld: number | null; firstSeen: string }>> = {};
 for (const p of candidates) {
 if (!stuckByStore[p.store_slug]) stuckByStore[p.store_slug] = [];
 // created_at = when the product first appeared in VYA (null = pre-Collabs era / initial sync)
 const daysOld = p.created_at ? Math.floor((now - new Date(p.created_at).getTime()) / ONE_DAY_MS) : null;
 stuckByStore[p.store_slug].push({
 title: p.title,
 daysOld,
 firstSeen: p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : "pre-collabs",
 });
 }

 return NextResponse.json({
 total: candidates.length,
 byStore,
 stuckByStore,
 collabsStores: Array.from(COLLABS_STORE_SLUGS),
 sampleLinks,
 redirectInfo,
 debug: {
 dbStoreCounts,
 collabsStoreSlugsList: Array.from(COLLABS_STORE_SLUGS),
 shopifyIdCoverage,
 },
 });
}

/**
 * DELETE /api/admin/generate-collabs-links
 * Purges stuck products invisible on VYA (have shopify_product_id but no collabs_link).
 * ?minDaysStuck=14 also purges products stuck for 14+ days (likely sold-out in Collabs).
 */
export async function DELETE(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { searchParams } = new URL(request.url);
 const minDaysStuck = searchParams.get("minDaysStuck")
 ? parseInt(searchParams.get("minDaysStuck")!, 10)
 : undefined;

 const deleted = await deletePermanentlyStuckProducts(undefined, minDaysStuck);
 return NextResponse.json({ deleted });
}
