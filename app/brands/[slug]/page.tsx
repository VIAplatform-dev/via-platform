export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getInventory } from "@/app/lib/inventory";
import { brandMap } from "@/app/lib/brandData";
import { stores } from "@/app/lib/stores";
import { categoryMap } from "@/app/lib/categoryMap";
import type { CategorySlug } from "@/app/lib/categoryMap";
import FilteredProductGrid from "@/app/components/FilteredProductGrid";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";
import { getProductPopularityScores } from "@/app/lib/analytics-db";
import { computeProductScore } from "@/app/lib/productRanking";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
 const { slug } = await params;
 const label = brandMap[slug];
 if (!label) return {};
 const title = `${label} Vintage & Secondhand | VYA`;
 const description = `Shop secondhand and vintage ${label} pieces from trusted independent stores on VYA.`;
 return {
 title,
 description,
 openGraph: {
 title,
 description,
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
 twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
 };
}

export default async function BrandPage({
 params,
}: {
 params: { slug: string };
}) {
 const slug = (await params).slug;
 const label = brandMap[slug];

 if (!label) {
 return notFound();
 }

 const inventory = await getInventory();
 const brandItems = inventory.filter((item) => item.brand === slug);

 // Extract DB IDs and fetch popularity scores
 const dbIdMap = new Map<string, number>();
 for (const item of brandItems) {
 const match = item.id.match(/-(\d+)$/);
 if (match) dbIdMap.set(item.id, parseInt(match[1], 10));
 }
 const dbIds = Array.from(dbIdMap.values());
 const popularityScores = dbIds.length > 0 ? await getProductPopularityScores(dbIds) : {};

 const products: FilterableProduct[] = brandItems.map((item) => {
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
 categoryLabel: categoryMap[item.category as CategorySlug],
 brand: item.brand,
 brandLabel: item.brandLabel,
 store: item.store,
 storeSlug: item.storeSlug,
 externalUrl: item.externalUrl,
 image: item.image,
 images: item.images,
 imageColor: item.imageColor,
 size: item.size,
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

 const storeList = stores.map((s) => ({ slug: s.slug, name: s.name }));

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* ================= BRAND HEADER ================= */}
 <section className="">
 <div className="max-w-7xl mx-auto px-6 py-6 sm:py-10">
 <Link
 href="/brands"
 className="inline-block mb-6 text-xs tracking-[0.25em] uppercase text-[#5D0F17]/50 hover:text-[#5D0F17] transition"
 >
 &larr; All Designers
 </Link>
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">{label}</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 {products.length > 0
 ? `${products.length} ${products.length === 1 ? "piece" : "pieces"} available`
 : "No pieces available right now, check back soon."}
 </p>
 </div>
 </section>

 {/* ================= PRODUCTS WITH FILTERS ================= */}
 <section className="py-8 sm:py-12">
 <div className="max-w-7xl mx-auto px-6">
 <FilteredProductGrid
 products={products}
 stores={storeList}
 categories={[]}
 showCategoryFilter={false}
 showSizeFilter
 from={`/brands/${slug}`}
 emptyMessage={`No ${label} pieces found. Check back soon.`}
 />
 </div>
 </section>
 </main>
 );
}
