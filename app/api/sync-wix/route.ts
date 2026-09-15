import { NextRequest, NextResponse } from "next/server";
import { fetchWixProducts } from "@/app/lib/wixClient";
import { syncProducts, initDatabase } from "@/app/lib/db";
import { stores } from "@/app/lib/stores";

export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const { storeName, storeSlug, siteId, apiKeyEnvVar } = body;

 if (!storeName || !storeSlug || !siteId || !apiKeyEnvVar) {
 return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
 }

 const apiKey = process.env[apiKeyEnvVar];
 if (!apiKey) {
 return NextResponse.json(
 { error: `Missing env var ${apiKeyEnvVar}: add it in Vercel project settings` },
 { status: 500 }
 );
 }

 await initDatabase();

 const storeInfo = stores.find((s) => s.slug === storeSlug);
 const websiteUrl = storeInfo?.website ?? "https://vyaplatform.com";

 const { products: rawProducts, skippedCount } = await fetchWixProducts(
 siteId,
 apiKey,
 storeName,
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

 const { count: productCount } = await syncProducts(storeSlug, storeName, mappedProducts);

 return NextResponse.json({
 success: true,
 productCount,
 skippedCount,
 });
 } catch (error) {
 return NextResponse.json(
 { error: error instanceof Error ? error.message : "Sync failed" },
 { status: 500 }
 );
 }
}
