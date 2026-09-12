export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInventory } from "@/app/lib/inventory";
import { categories, clothingSubcategories } from "@/app/lib/categories";
import { displayCategories, clothingSlugs, shoesSlugs, bagsSlugs, accessoriesSlugs, categoryMap } from "@/app/lib/categoryMap";
import type { CategorySlug } from "@/app/lib/categoryMap";
import { visibleStores as stores } from "@/app/lib/stores";
import CategoryContent from "@/app/components/CategoryContent";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";
import { getProductPopularityScores } from "@/app/lib/analytics-db";
import { computeProductScore } from "@/app/lib/productRanking";
import { getAllEditorsPicks } from "@/app/lib/editors-picks-db";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
 const { category } = await params;
 const display = displayCategories.find((d) => d.slug === category);
 const label = display?.label ?? categoryMap[category as CategorySlug] ?? category;
 const capitalised = label.charAt(0).toUpperCase() + label.slice(1);
 const title = `Vintage ${capitalised} | VYA`;
 const description = `Shop secondhand and vintage ${label.toLowerCase()} from the world's best independent stores on VYA.`;
 const ogImage = display?.image ? display.image : "/og-image.png";
 return {
 title,
 description,
 openGraph: {
 title,
 description,
 images: [{ url: ogImage, width: 1200, height: 1200 }],
 },
 twitter: { card: "summary_large_image", title, description, images: [ogImage] },
 };
}

const ACCESSORY_TYPE_RULES: [string, RegExp][] = [
 ["Jewelry", /necklace|ring|bracelet|earring|brooch|pendant|choker|cuff|anklet|charm|locket|pearl/i],
 ["Belt", /\bbelt\b/i],
 ["Wallet", /wallet|coin purse|cardholder|card holder|card case/i],
 ["Sunglasses", /sunglass|shades|eyewear|spectacle|eyeglass/i],
 ["Scarf", /scarf|scarve|stole|shawl|wrap/i],
 ["Watch", /\bwatch\b|timepiece|wristwatch/i],
 ["Hat", /\bhat\b|cap\b|beanie|beret|fedora|cloche|bucket hat|visor/i],
 ["Gloves", /\bgloves?\b|mittens?\b/i],
 ["Hair Accessory", /hair clip|hairpin|hair pin|barrette|headband|scrunchie|hair tie/i],
];

function inferAccessoryType(title: string): string {
 for (const [label, pattern] of ACCESSORY_TYPE_RULES) {
 if (pattern.test(title)) return label;
 }
 return "Other";
}

export default async function CategoryPage({
 params,
}: {
 params: { category: string };
}) {
 const category = (await params).category;

 // Check if it's a display category (clothing, bags, shoes, accessories)
 const displayMeta = displayCategories.find((c) => c.slug === category);
 // Or a direct subcategory slug
 const subcategoryMeta = categories.find((c) => c.slug === category);

 if (!displayMeta && !subcategoryMeta) {
 return notFound();
 }

 const label = displayMeta?.label ?? subcategoryMeta!.label;
 const isClothing = category === "clothing";
 const isShoes = category === "shoes";
 const isBags = category === "bags";
 const isAccessories = category === "accessories";

 const inventory = await getInventory();

 // Parent display categories aggregate all their subcategory slugs (including legacy catch-all)
 const categoryItems = isClothing
 ? inventory.filter((item) => clothingSlugs.has(item.category))
 : isShoes
 ? inventory.filter((item) => shoesSlugs.has(item.category))
 : isBags
 ? inventory.filter((item) => bagsSlugs.has(item.category))
 : isAccessories
 ? inventory.filter((item) => accessoriesSlugs.has(item.category))
 : inventory.filter((item) => item.category === category);

 // Extract DB IDs and fetch popularity scores
 const dbIdMap = new Map<string, number>();
 for (const item of categoryItems) {
 const match = item.id.match(/-(\d+)$/);
 if (match) dbIdMap.set(item.id, parseInt(match[1], 10));
 }
 const dbIds = Array.from(dbIdMap.values());
 const [popularityScores, editorsPicks] = await Promise.all([
 getProductPopularityScores(dbIds),
 getAllEditorsPicks().catch(() => []),
 ]);
 const editorsPickIds = new Set(editorsPicks.map((p) => p.product.id));

 // Transform for FilteredProductGrid with composite ranking
 const filteredProducts: FilterableProduct[] = categoryItems.map((item) => {
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
 accessoryType: isAccessories ? inferAccessoryType(item.title) : null,
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

 // Show subcategory filters on the clothing page
 const clothingFilterCategories = clothingSubcategories.map((c) => ({
 slug: c.slug,
 label: c.label,
 }));

 // Compute brand/designer counts for this category (with slug for filtering)
 const brandCountMap = new Map<string, { label: string; count: number }>();
 for (const p of filteredProducts) {
 if (p.brand && p.brandLabel) {
 const existing = brandCountMap.get(p.brand);
 if (existing) existing.count++;
 else brandCountMap.set(p.brand, { label: p.brandLabel, count: 1 });
 }
 }
 const brandCounts = Array.from(brandCountMap.entries())
 .map(([slug, { label, count }]) => ({ slug, label, count }))
 .sort((a, b) => b.count - a.count);

 // Compute store counts for this category (with slug for filtering)
 const storeCountMap = new Map<string, { name: string; count: number }>();
 for (const p of filteredProducts) {
 const existing = storeCountMap.get(p.storeSlug);
 if (existing) existing.count++;
 else storeCountMap.set(p.storeSlug, { name: p.store, count: 1 });
 }
 const storeCounts = Array.from(storeCountMap.entries())
 .map(([slug, { name, count }]) => ({ slug, name, count }))
 .sort((a, b) => b.count - a.count);

 return (
 <>
 <CategoryContent
 label={label}
 products={filteredProducts}
 stores={storeList}
 storeCounts={storeCounts}
 brandCounts={brandCounts}
 categories={isClothing ? clothingFilterCategories : []}
 showCategoryFilter={isClothing}
 showSizeFilter={!isAccessories}
 showTypeFilter={isAccessories}
 from={`/categories/${category}`}
 emptyMessage="No products found in this category."
 />
 </>
 );
}
