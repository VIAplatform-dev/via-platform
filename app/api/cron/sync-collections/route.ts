import { NextResponse } from "next/server";
import { ALL_STORES } from "@/app/lib/storeConfig";
import { syncStoreCollections } from "@/app/lib/collections-sync";
import { initDatabase } from "@/app/lib/db";

// Daily capture of each Shopify store's collection membership → products.collections +
// derived products.era. Decoupled from the main product sync so its per-collection fetches
// don't slow the catalog sync. Internal data (era/brand/category ground truth for the
// intake accuracy loop + pricing comps). Manual run: curl -H "Authorization: Bearer $CRON_SECRET" ...
export async function GET(request: Request) {
 const secret = process.env.CRON_SECRET;
 const authHeader = request.headers.get("authorization");
 // Header only — a query-string secret leaks into Vercel/CDN access logs and Referer headers.
 if (!secret || authHeader !== `Bearer ${secret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 await initDatabase();

 const shopifyStores = ALL_STORES.filter(
 (s): s is typeof s & { storeDomain: string } => s.type === "shopify" && !!(s as { storeDomain?: string }).storeDomain,
 );

 const results: { store: string; collections: number; productsUpdated: number; error?: string }[] = [];
 for (const store of shopifyStores) {
 try {
 const r = await syncStoreCollections(store.slug, store.storeDomain);
 results.push({ store: store.name, ...r });
 } catch (err) {
 results.push({ store: store.name, collections: 0, productsUpdated: 0, error: err instanceof Error ? err.message : "failed" });
 }
 }

 const totalUpdated = results.reduce((a, r) => a + r.productsUpdated, 0);
 console.log(`[Sync Collections] Done — ${totalUpdated} products tagged across ${results.length} stores`);
 return NextResponse.json({ ok: true, totalUpdated, stores: results });
}
