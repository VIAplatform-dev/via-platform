export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getNewArrivals } from "@/app/lib/db";
import { visibleStores as stores } from "@/app/lib/stores";
import { displayCategories, clothingSlugs, categoryMap } from "@/app/lib/categoryMap";
import type { CategorySlug } from "@/app/lib/categoryMap";
import FilteredProductGrid from "@/app/components/FilteredProductGrid";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";
import { getProductPopularityScores } from "@/app/lib/analytics-db";
import { computeProductScore } from "@/app/lib/productRanking";
import { inferBrandFromTitle } from "@/app/lib/loadStoreProducts";
import { brandMap } from "@/app/lib/brandData";
import { deriveSize } from "@/app/lib/inventory";

export const metadata: Metadata = {
 title: "New Arrivals | VYA",
 description: "Fresh vintage and secondhand pieces just landed. Be first to shop the newest additions from our curated stores.",
 openGraph: {
 title: "New Arrivals | VYA",
 description: "Fresh vintage and secondhand pieces just landed. Be first to shop the newest additions from our curated stores.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
 twitter: {
 card: "summary_large_image",
 title: "New Arrivals | VYA",
 description: "Fresh vintage and secondhand pieces just landed. Be first to shop the newest additions from our curated stores.",
 images: ["/og-image.png"],
 },
};

function toDisplayCategory(slug: CategorySlug): string {
 return clothingSlugs.has(slug) ? "clothing" : slug;
}

function parseImages(raw: string | null, fallback: string | null): string[] {
 if (raw) {
 try {
 const parsed = JSON.parse(raw);
 if (Array.isArray(parsed) && parsed.length > 0) return parsed;
 } catch {}
 }
 return fallback ? [fallback] : [];
}

export default async function NewArrivalsPage() {
 const dbProducts = await getNewArrivals(2000, 7, 500);

 const dbIdMap = new Map<string, number>();
 for (const item of dbProducts) {
 dbIdMap.set(`${item.store_slug}-${item.id}`, item.id);
 }
 const dbIds = Array.from(dbIdMap.values());
 const popularityScores = await getProductPopularityScores(dbIds);

 const { inferCategoryFromTitle } = await import("@/app/lib/loadStoreProducts");

 const products: FilterableProduct[] = dbProducts.map((item) => {
 const id = `${item.store_slug}-${item.id}`;
 const dbId = item.id;
 const engagementScore = popularityScores[dbId] ?? 0;
 const syncedAt = item.synced_at instanceof Date
 ? item.synced_at.toISOString()
 : String(item.synced_at);
 const categorySlug = inferCategoryFromTitle(item.title) as CategorySlug;
 const displaySlug = toDisplayCategory(categorySlug);
 const displayLabel = displayCategories.find((c) => c.slug === displaySlug)?.label
 ?? categoryMap[categorySlug];
 const brandSlug = inferBrandFromTitle(item.title);
 const images = parseImages(item.images, item.image);

 return {
 id,
 dbId,
 title: item.title,
 price: Number(item.price),
 currency: item.currency,
 compareAtPrice: item.compare_at_price != null ? Number(item.compare_at_price) : undefined,
 category: displaySlug,
 categoryLabel: displayLabel,
 brand: brandSlug,
 brandLabel: brandSlug ? (brandMap[brandSlug] ?? null) : null,
 store: item.store_name,
 storeSlug: item.store_slug,
 externalUrl: item.external_url ?? undefined,
 image: item.image ?? "",
 images,
 imageColor: item.image_color ?? null,
 size: deriveSize(item),
 engagementScore,
 createdAt: item.created_at instanceof Date
 ? item.created_at.getTime()
 : item.created_at ? new Date(item.created_at).getTime() : dbId,
 popularityScore: computeProductScore({
 engagementScore,
 syncedAt,
 imageCount: images.length,
 brandSlug: brandSlug ?? null,
 price: Number(item.price),
 title: item.title,
 }),
 };
 });

 // Pre-sort server-side so the initial SSR render is already newest-first
 products.sort((a, b) => (b.dbId ?? 0) - (a.dbId ?? 0));

 const storeList = stores.map((s) => ({ slug: s.slug, name: s.name }));
 const categoryList = displayCategories.map((c) => ({ slug: c.slug, label: c.label }));

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <section className="">
 <div className="max-w-7xl mx-auto px-6 py-6 sm:py-10">
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">New Arrivals</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 The latest pieces added by our stores this week.
 </p>
 </div>
 </section>

 <section className="py-8 sm:py-12">
 <div className="max-w-7xl mx-auto px-6">
 <FilteredProductGrid
 products={products}
 stores={storeList}
 categories={categoryList}
 showCategoryFilter={true}
 showBrandFilter={true}
 showSizeFilter={true}
 initialFilters={{ sort: "newest" }}
 emptyMessage="No new arrivals right now. Check back soon."
 />
 </div>
 </section>
 </main>
 );
}
