export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { getInventory } from "@/app/lib/inventory";
import { visibleStores as stores } from "@/app/lib/stores";
import { categories } from "@/app/lib/categories";
import { categoryMap } from "@/app/lib/categoryMap";
import FilteredProductGrid from "@/app/components/FilteredProductGrid";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";
import { getProductPopularityScores } from "@/app/lib/analytics-db";
import { computeProductScore } from "@/app/lib/productRanking";
import { getAllEditorsPicks } from "@/app/lib/editors-picks-db";

export const metadata: Metadata = {
 title: "Browse Vintage & Secondhand. VYA",
 description: "Discover unique vintage and secondhand pieces from the world's best independent stores, all in one place.",
 openGraph: {
 title: "Browse Vintage & Secondhand. VYA",
 description: "Discover unique vintage and secondhand pieces from the world's best independent stores, all in one place.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
 twitter: {
 card: "summary_large_image",
 title: "Browse Vintage & Secondhand. VYA",
 description: "Discover unique vintage and secondhand pieces from the world's best independent stores, all in one place.",
 images: ["/og-image.png"],
 },
};

export default async function BrowsePage() {
 const inventory = await getInventory();

 // Extract DB IDs and fetch popularity scores
 const dbIdMap = new Map<string, number>();
 for (const item of inventory) {
 const match = item.id.match(/-(\d+)$/);
 if (match) dbIdMap.set(item.id, parseInt(match[1], 10));
 }
 const dbIds = Array.from(dbIdMap.values());
 const [popularityScores, editorsPicks] = await Promise.all([
 getProductPopularityScores(dbIds),
 getAllEditorsPicks().catch(() => []),
 ]);
 const editorsPickIds = new Set(editorsPicks.map((p) => p.product.id));

 // Transform inventory with composite ranking scores
 const products: FilterableProduct[] = inventory.map((item) => {
 const engagementScore = popularityScores[dbIdMap.get(item.id) ?? 0] ?? 0;
 const syncedAt = item.syncedAt ?? new Date().toISOString();

 return {
 id: item.id,
 dbId: dbIdMap.get(item.id),
 title: item.title,
 price: item.price,
 currency: item.currency,
 compareAtPrice: item.compareAtPrice,
 category: item.category,
 categoryLabel: categoryMap[item.category as keyof typeof categoryMap],
 brand: item.brand,
 brandLabel: item.brandLabel,
 store: item.store,
 storeSlug: item.storeSlug,
 externalUrl: item.externalUrl,
 image: item.image,
 images: item.images,
 imageColor: item.imageColor,
 size: item.size,
 isEditorsPick: editorsPickIds.has(dbIdMap.get(item.id) ?? -1),
 engagementScore,
 createdAt: item.createdAt ? new Date(item.createdAt).getTime() : (dbIdMap.get(item.id) ?? 0),
 popularityScore: computeProductScore({
 engagementScore,
 syncedAt,
 imageCount: item.images.length,
 brandSlug: item.brand,
 price: item.price,
 title: item.title,
 }),
 };
 });

 // Get stores for the filter
 const storeList = stores.map((s) => ({ slug: s.slug, name: s.name }));

 // Get categories for the filter
 const categoryList = categories.map((c) => ({ slug: c.slug, label: c.label }));

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* ================= HERO ================= */}
 <section className="">
 <div className="max-w-7xl mx-auto px-6 py-6 sm:py-10">
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">Browse All</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 Discover vintage and secondhand from our network of independent stores.
 </p>
 </div>
 </section>

 {/* ================= PRODUCTS WITH FILTERS ================= */}
 <section className="py-8 sm:py-12">
 <div className="max-w-7xl mx-auto px-6">
 <FilteredProductGrid
 products={products}
 stores={storeList}
 categories={categoryList}
 showCategoryFilter={true}
 showBrandFilter={true}
 from="/browse"
 emptyMessage="No products found. Check back soon for new arrivals."
 />
 </div>
 </section>
 </main>
 );
}
