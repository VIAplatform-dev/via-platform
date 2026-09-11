export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getBaseUrl } from "@/app/lib/base-url";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllEditorsPicks, COLLECTIONS } from "@/app/lib/editors-picks-db";
import { stores } from "@/app/lib/stores";
import { displayCategories, clothingSlugs, categoryMap } from "@/app/lib/categoryMap";
import type { CategorySlug } from "@/app/lib/categoryMap";
import FilteredProductGrid from "@/app/components/FilteredProductGrid";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";
import { getProductPopularityScores } from "@/app/lib/analytics-db";
import { computeProductScore } from "@/app/lib/productRanking";
import { inferBrandFromTitle, inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { brandMap } from "@/app/lib/brandData";
import { deriveSize } from "@/app/lib/inventory";

type Props = { params: Promise<{ slug: string }> };

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
 const { slug } = await params;
 const collection = COLLECTIONS.find((c) => c.slug === slug);
 if (!collection) return {};

 const BASE_URL = getBaseUrl();
 const curatedBy: string | null = collection.curatedBy ?? null;
 const description = curatedBy
 ? `Curated by ${curatedBy}, hand-selected vintage & secondhand pieces on VYA.`
 : `Hand-selected vintage & secondhand pieces, ${(collection as { name: string }).name} on VYA.`;
 const ogImageUrl = `${BASE_URL}/collections/${slug}/opengraph-image`;

 return {
 title: `${collection.name} | VYA`,
 description,
 openGraph: {
 title: `${collection.name} | VYA`,
 description,
 images: [{ url: ogImageUrl, width: 1200, height: 630 }],
 },
 twitter: {
 card: "summary_large_image",
 title: `${collection.name} | VYA`,
 description,
 images: [ogImageUrl],
 },
 };
}

export default async function CollectionPage({ params }: Props) {
 const { slug } = await params;
 const collection = COLLECTIONS.find((c) => c.slug === slug);
 if (!collection) notFound();

 const picks = await getAllEditorsPicks(slug);

 const dbIdMap = new Map<string, number>();
 for (const pick of picks) {
 const id = `${pick.product.storeSlug}-${pick.product.id}`;
 dbIdMap.set(id, pick.product.id);
 }
 const dbIds = Array.from(dbIdMap.values());
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

 // Build a minimal DBProduct-compatible shape for deriveSize
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
 <div className="max-w-7xl mx-auto px-6 py-6 sm:py-10">
 <Link
 href="/collections"
 className="inline-block mb-6 text-xs tracking-[0.25em] uppercase text-[#5D0F17]/50 hover:text-[#5D0F17] transition"
 >
 &larr; All Collections
 </Link>
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">{collection.name}</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 {collection.description}
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
 from={`/collections/${slug}`}
 emptyMessage="No picks yet, check back soon."
 />
 </div>
 </section>
 </main>
 );
}
