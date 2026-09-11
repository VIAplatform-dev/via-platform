import { notFound } from "next/navigation";
import { getBaseUrl } from "@/app/lib/base-url";
import Link from "next/link";
import type { Metadata } from "next";
import { stores } from "@/app/lib/stores";
import { loadStoreProducts } from "@/app/lib/loadStoreProducts";
import { StoreProduct } from "@/app/lib/types";
import { categoryMap, clothingSlugs } from "@/app/lib/categoryMap";
import type { CategorySlug } from "@/app/lib/categoryMap";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";
import StoreClientSection from "@/app/components/StoreClientSection";
import FavoriteButton from "@/app/components/FavoriteButton";
import { getProductPopularityScores } from "@/app/lib/analytics-db";
import { computeProductScore } from "@/app/lib/productRanking";
import { inferBrandFromTitle } from "@/app/lib/loadStoreProducts";
import { brandMap } from "@/app/lib/brandData";
import { getAllEditorsPicks } from "@/app/lib/editors-picks-db";
import TrackStoreView from "@/app/components/TrackStoreView";
import VyaVerifiedBadge from "@/app/components/VyaVerifiedBadge";

type StorePageProps = {
 params: Promise<{
 slug: string;
 }>;
};

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
 const { slug } = await params;
 const store = stores.find((s) => s.slug === slug);
 if (!store) return {};

 const BASE_URL = getBaseUrl();
 const description = `Shop ${store.name} on VYA, ${store.location}. ${store.description.slice(0, 120)}...`;
 const ogImageUrl = `${BASE_URL}/stores/${slug}/opengraph-image`;

 return {
 title: `${store.name} | VYA`,
 description,
 openGraph: {
 title: store.name,
 description,
 url: `${BASE_URL}/stores/${slug}`,
 images: [{ url: ogImageUrl, width: 1200, height: 630, alt: store.name }],
 type: "website",
 },
 twitter: {
 card: "summary_large_image",
 title: store.name,
 description,
 images: [ogImageUrl],
 },
 };
}

// Helper to parse price string to number
function parsePrice(priceStr: string): number {
 const cleaned = priceStr.replace(/[^0-9.]/g, "");
 return parseFloat(cleaned) || 0;
}

export default async function StorePage({ params }: StorePageProps) {
 const { slug } = await params;

 const store = stores.find((s) => s.slug === slug);
 if (!store) return notFound();

 const storeProducts: StoreProduct[] = await loadStoreProducts(slug).catch(() => []);

 // Extract DB IDs from composite IDs (format: store_slug-dbId)
 const dbIdMap = new Map<string, number>();
 for (const product of storeProducts) {
 const match = product.id.match(/-(\d+)$/);
 if (match) dbIdMap.set(product.id, parseInt(match[1], 10));
 }

 // Fetch popularity scores and editor's picks in parallel
 const dbIds = Array.from(dbIdMap.values());
 const [popularityScores, editorsPicks] = await Promise.all([
 getProductPopularityScores(dbIds).catch(() => ({} as Record<number, number>)),
 getAllEditorsPicks().catch(() => []),
 ]);
 const editorsPickIds = new Set(editorsPicks.map((p) => p.product.id));

 // Transform to FilterableProduct format with composite ranking
 const products: FilterableProduct[] = storeProducts.map((product) => {
 const price = parsePrice(product.price);
 const images = product.images ?? [];
 const brandSlug = inferBrandFromTitle(product.name);
 const engagementScore = popularityScores[dbIdMap.get(product.id) ?? 0] ?? 0;
 const syncedAt = product.syncedAt ?? new Date().toISOString();

 return {
 id: product.id,
 dbId: dbIdMap.get(product.id),
 title: product.name,
 price,
 currency: product.currency,
 category: product.category,
 categoryLabel: categoryMap[product.category as keyof typeof categoryMap],
 brand: brandSlug,
 brandLabel: brandSlug ? (brandMap[brandSlug] ?? null) : null,
 store: store.name,
 storeSlug: store.slug,
 externalUrl: product.externalUrl,
 image: product.image ?? "",
 images,
 imageColor: product.imageColor,
 size: product.size ?? null,
 isEditorsPick: editorsPickIds.has(dbIdMap.get(product.id) ?? -1),
 engagementScore,
 createdAt: product.createdAt ? new Date(product.createdAt).getTime() : (dbIdMap.get(product.id) ?? 0),
 popularityScore: computeProductScore({
 engagementScore,
 syncedAt,
 imageCount: images.length,
 brandSlug,
 price,
 title: product.name,
 }),
 };
 });

 // Compute category counts (display-level: Clothing, Bags, Shoes, Accessories)
 const categoryCounts: { label: string; count: number }[] = [];
 const catCountMap = new Map<string, number>();
 for (const p of products) {
 const displayCat = clothingSlugs.has(p.category as CategorySlug) ? "Clothing" : (categoryMap[p.category as keyof typeof categoryMap] || p.category);
 catCountMap.set(displayCat, (catCountMap.get(displayCat) || 0) + 1);
 }
 for (const [label, count] of catCountMap) {
 categoryCounts.push({ label, count });
 }
 categoryCounts.sort((a, b) => b.count - a.count);

 // Compute brand/designer counts
 const brandCounts: { label: string; count: number }[] = [];
 const brandCountMap = new Map<string, number>();
 for (const p of products) {
 if (p.brandLabel) {
 brandCountMap.set(p.brandLabel, (brandCountMap.get(p.brandLabel) || 0) + 1);
 }
 }
 for (const [label, count] of brandCountMap) {
 brandCounts.push({ label, count });
 }
 brandCounts.sort((a, b) => b.count - a.count);

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <TrackStoreView
 storeSlug={store.slug}
 storeName={store.name}
 inventoryCount={products.length}
 />
 {/* ================= STORE HEADER ================= */}
 <section className="">
 <div className="max-w-7xl mx-auto px-6 py-6 sm:py-10">
 <Link
 href="/stores"
 className="inline-block mb-6 text-xs tracking-[0.25em] uppercase text-[#5D0F17]/50 hover:text-[#5D0F17] transition"
 >
 &larr; All Stores
 </Link>

 <div className="text-center">
 <div className="flex items-center justify-center gap-3 mb-2">
 <h1 className="text-2xl sm:text-3xl font-serif">{store.name}</h1>
 <FavoriteButton type="store" targetId={store.slug} size="md" />
 </div>

 <div className="flex justify-center mb-3">
 <VyaVerifiedBadge />
 </div>

 <p className="text-sm text-[#5D0F17]/50 mb-3">{store.location}</p>

 {store.description && (
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-3xl mx-auto">{store.description}</p>
 )}

 {"perk" in store && store.perk && (
 <p className="mt-4 text-sm font-medium text-[#5D0F17] italic">
 {store.perk}
 </p>
 )}
 </div>

 </div>
 </section>


 {/* ================= PILLS + PRODUCTS ================= */}
 {products.length === 0 ? (
 <section className="py-32 sm:py-48 flex flex-col items-center justify-center">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img
 src="/vya-logo.png"
 alt="VYA"
 className="w-28 sm:w-36 blur-[1px] opacity-40 select-none pointer-events-none"
 />
 <p className="mt-5 text-[10px] uppercase tracking-[0.35em] text-[#5D0F17]/40">
 Coming Soon
 </p>
 </section>
 ) : (
 <StoreClientSection
 products={products}
 categoryCounts={categoryCounts}
 brandCounts={brandCounts}
 store={{ slug: store.slug, name: store.name }}
 />
 )}
 </main>
 );
}
