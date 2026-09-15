import { NextResponse } from "next/server";
import {
 getProductsMissingCollabsLink,
 updateCollabsLinkByShopifyProductId,
} from "@/app/lib/db";
import {
 COLLABS_STORES,
 COLLABS_STORE_SLUGS,
 fetchCollabsProducts,
 createAffiliateLink,
} from "@/app/lib/collabs";
import { backfillDtIds } from "@/app/lib/collabsDtId";

// Allow up to 5 minutes for bulk generation
export const maxDuration = 300;

export async function GET(request: Request) {
 console.log("[Generate Collabs Links] Cron job triggered");

 const authHeader = request.headers.get("authorization");

 if (!process.env.CRON_SECRET) {
 console.error("[Generate Collabs Links] CRON_SECRET env var is not set!");
 return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
 }

 if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
 console.error("[Generate Collabs Links] Auth failed");
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const cookie = process.env.COLLABS_COOKIE;
 const csrfToken = process.env.COLLABS_CSRF_TOKEN;

 if (!cookie || !csrfToken) {
 const missing = [!cookie && "COLLABS_COOKIE", !csrfToken && "COLLABS_CSRF_TOKEN"]
 .filter(Boolean)
 .join(", ");
 console.error(`[Generate Collabs Links] Missing env vars: ${missing}`);
 return NextResponse.json(
 {
 error: `Missing required environment variables: ${missing}. Set them in Vercel dashboard → Settings → Environment Variables.`,
 },
 { status: 500 }
 );
 }

 // Get all products missing collabs links from VYA's database
 const missingProducts = await getProductsMissingCollabsLink();
 const missingByShopifyId = new Map<string, string>(
 missingProducts
 .filter((p) => p.shopify_product_id && COLLABS_STORE_SLUGS.has(p.store_slug))
 .map((p) => {
 const dbId = p.shopify_product_id!;
 const numericId = dbId.match(/(\d+)$/)?.[1] ?? dbId;
 return [numericId, dbId] as [string, string];
 })
 );

 console.log(
 `[Generate Collabs Links] ${missingByShopifyId.size} products missing links across ${COLLABS_STORES.length} stores`
 );

 let totalSaved = 0;
 let totalCreated = 0;
 let totalFailed = 0;
 let rateLimited = false;
 const storeResults: Array<{
 store: string;
 slug: string;
 saved: number;
 created: number;
 failed: number;
 error?: string;
 }> = [];

 for (const store of COLLABS_STORES) {
 console.log(`[Generate Collabs Links] Processing ${store.name}...`);

 const { products: collabsProducts, error: fetchError } = await fetchCollabsProducts(
 store.collabsStoreId,
 cookie,
 csrfToken
 );

 if (fetchError) {
 console.error(`[Generate Collabs Links] Fetch error for ${store.name}:`, fetchError);
 storeResults.push({ store: store.name, slug: store.slug, saved: 0, created: 0, failed: 0, error: fetchError });
 if (fetchError.includes("401")) {
 console.error("[Generate Collabs Links] 401 detected. Collabs credentials may be expired");
 }
 continue;
 }

 console.log(`[Generate Collabs Links] ${store.name}: ${collabsProducts.length} products from Collabs`);

 let storeSaved = 0;
 let storeCreated = 0;
 let storeFailed = 0;

 for (const product of collabsProducts) {
 const shopifyId = product.shopifyProductId?.match(/(\d+)$/)?.[1];
 const dbShopifyId = shopifyId ? missingByShopifyId.get(shopifyId) : undefined;
 if (!shopifyId || !dbShopifyId) continue;

 let collabsUrl = product.affiliateProduct?.url || null;

 if (!collabsUrl) {
 if (rateLimited) continue;

 const result = await createAffiliateLink(product.id, cookie, csrfToken);
 if (result.url) {
 collabsUrl = result.url;
 storeCreated++;
 totalCreated++;
 } else {
 storeFailed++;
 totalFailed++;
 if (result.error?.includes("Daily links limit")) {
 rateLimited = true;
 console.warn("[Generate Collabs Links] Daily links limit reached. Stopping link creation");
 } else {
 console.error(
 `[Generate Collabs Links] Failed to create link for ${product.title}:`,
 result.error
 );
 }
 await new Promise((r) => setTimeout(r, 300));
 continue;
 }
 }

 if (collabsUrl) {
 await updateCollabsLinkByShopifyProductId(dbShopifyId, collabsUrl);
 storeSaved++;
 totalSaved++;
 missingByShopifyId.delete(shopifyId);
 console.log(`[Generate Collabs Links] Saved link for ${product.title} (${store.name})`);
 }

 await new Promise((r) => setTimeout(r, 200));
 }

 storeResults.push({
 store: store.name,
 slug: store.slug,
 saved: storeSaved,
 created: storeCreated,
 failed: storeFailed,
 });
 }

 // Detect products still unmatched after processing all stores.
 // These are in our DB with a shopify_product_id but were never found in any
 // Collabs catalog: they'll stay invisible on VYA until resolved.
 const stillMissingDbIds = new Set(missingByShopifyId.values());
 const stillMissingProducts = missingProducts.filter(
 (p) => p.shopify_product_id && stillMissingDbIds.has(p.shopify_product_id)
 );

 const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
 const stuckProducts = stillMissingProducts.filter(
 (p) => p.created_at && Date.now() - new Date(p.created_at).getTime() > THREE_DAYS_MS
 );

 if (stuckProducts.length > 0) {
 console.warn(
 `[Generate Collabs Links] ${stuckProducts.length} products stuck without links for 3+ days`
 );
 }

 // Pre-warm dt_id for every product that now has a link but no cached dt_id, so checkout
 // never has to resolve it live (and multi-item carts keep full Collabs attribution).
 const dtIds = await backfillDtIds().catch(() => ({ resolved: 0, attempted: 0 }));

 const summary = {
 success: totalFailed === 0 && !rateLimited,
 storesProcessed: COLLABS_STORES.length,
 linksSaved: totalSaved,
 linksCreated: totalCreated,
 failures: totalFailed,
 rateLimited,
 stillMissing: stillMissingProducts.length,
 stuckOver3Days: stuckProducts.length,
 dtIdsResolved: dtIds.resolved,
 dtIdsAttempted: dtIds.attempted,
 stores: storeResults,
 };

 console.log("[Generate Collabs Links] Done:", summary);

 return NextResponse.json(summary);
}
