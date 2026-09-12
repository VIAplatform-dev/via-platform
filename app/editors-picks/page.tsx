export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getEveryonesFavorites } from "@/app/lib/editors-picks-db";
import { displayCategories, clothingSlugs, categoryMap } from "@/app/lib/categoryMap";
import type { CategorySlug } from "@/app/lib/categoryMap";
import FilteredProductGrid from "@/app/components/FilteredProductGrid";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";
import { getProductPopularityScores } from "@/app/lib/analytics-db";
import { computeProductScore } from "@/app/lib/productRanking";
import { inferBrandFromTitle, inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { brandMap } from "@/app/lib/brandData";
import { deriveSize } from "@/app/lib/inventory";
import { stores } from "@/app/lib/stores";

export const metadata: Metadata = {
 title: "Everyone's Favorites | VYA",
 description: "The most-loved vintage and secondhand pieces from our community of tastemakers.",
 openGraph: {
 title: "Everyone's Favorites | VYA",
 description: "The most-loved vintage and secondhand pieces from our community of tastemakers.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
 twitter: {
 card: "summary_large_image",
 title: "Everyone's Favorites | VYA",
 description: "The most-loved vintage and secondhand pieces from our community of tastemakers.",
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

export default async function EditorsPicksPage() {
 const picks = await getEveryonesFavorites(400);

 const dbIds = picks.map((p) => p.product.id);
 const popularityScores = await getProductPopularityScores(dbIds);

 const products: FilterableProduct[] = picks.map((pick) => {
 const { product } = pick;
 const id = `${product.storeSlug}-${product.id}`;
 const dbId = product.id;
 const engagementScore = popularityScores[dbId] ?? 0;
 const images = parseImages(product.images, product.image);
 const categorySlug = inferCategoryFromTitle(product.title) as CategorySlug;
 const displaySlug = toDisplayCategory(categorySlug);
 const displayLabel = displayCategories.find((c) => c.slug === displaySlug)?.label
 ?? categoryMap[categorySlug];
 const brandSlug = inferBrandFromTitle(product.title);

 const dbProduct = {
 title: product.title,
 size: product.size,
 description: null,
 images: product.images,
 image: product.image,
 } as Parameters<typeof deriveSize>[0];

 return {
 id,
 dbId,
 title: product.title,
 price: product.price,
 compareAtPrice: undefined,
 category: displaySlug,
 categoryLabel: displayLabel,
 brand: brandSlug,
 brandLabel: brandSlug ? (brandMap[brandSlug] ?? null) : null,
 store: product.storeName,
 storeSlug: product.storeSlug,
 externalUrl: product.externalUrl ?? undefined,
 image: product.image ?? "",
 images,
 imageColor: product.imageColor ?? null,
 size: deriveSize(dbProduct),
 engagementScore,
 createdAt: dbId,
 popularityScore: computeProductScore({
 engagementScore,
 syncedAt: new Date().toISOString(),
 imageCount: images.length,
 brandSlug: brandSlug ?? null,
 price: product.price,
 title: product.title,
 }),
 };
 });

 const storeList = stores.map((s) => ({ slug: s.slug, name: s.name }));
 const categoryList = displayCategories.map((c) => ({ slug: c.slug, label: c.label }));

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <section className="">
 <div className="max-w-7xl mx-auto px-6 pt-8 pb-4 sm:pt-10 sm:pb-6">
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-2 font-sans">Curated by the community</p>
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">Everyone&apos;s Favorites</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 The most-loved pieces from our community of tastemakers, ranked by the people with the best taste.
 </p>
 </div>
 </section>

 <section className="py-6 sm:py-8">
 <div className="max-w-7xl mx-auto px-6">
 <FilteredProductGrid
 products={products}
 stores={storeList}
 categories={categoryList}
 showCategoryFilter={true}
 showBrandFilter={true}
 showSizeFilter={true}
 from="/editors-picks"
 initialFilters={{ sort: "newest" }}
 emptyMessage="No favorites yet. Start hearting pieces to see them here."
 />
 </div>
 </section>
 </main>
 );
}
