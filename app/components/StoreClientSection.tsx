"use client";

import { useState, useMemo } from "react";
import FilteredProductGrid from "./FilteredProductGrid";
import type { FilterableProduct } from "./FilteredProductGrid";
import { clothingSlugs } from "@/app/lib/categoryMap";
import type { CategorySlug } from "@/app/lib/categoryMap";

type StoreClientSectionProps = {
 products: FilterableProduct[];
 categoryCounts: { label: string; count: number }[];
 brandCounts: { label: string; count: number }[];
 store: { slug: string; name: string };
};

export default function StoreClientSection({
 products,
 categoryCounts,
 brandCounts,
 store,
}: StoreClientSectionProps) {
 const [activeCategory, setActiveCategory] = useState<string | null>(null);
 const [activeBrand, setActiveBrand] = useState<string | null>(null);

 // Recompute brand counts when a category is active
 const visibleBrandCounts = useMemo(() => {
 if (!activeCategory) return brandCounts;
 const map = new Map<string, number>();
 for (const p of products) {
 const displayCat = clothingSlugs.has(p.category as CategorySlug)
 ? "Clothing"
 : p.categoryLabel || p.category;
 if (displayCat !== activeCategory) continue;
 if (p.brandLabel) {
 map.set(p.brandLabel, (map.get(p.brandLabel) || 0) + 1);
 }
 }
 return Array.from(map.entries())
 .map(([label, count]) => ({ label, count }))
 .sort((a, b) => b.count - a.count);
 }, [products, activeCategory, brandCounts]);

 const filteredProducts = useMemo(() => {
 return products.filter((p) => {
 if (activeCategory) {
 const displayCat = clothingSlugs.has(p.category as CategorySlug)
 ? "Clothing"
 : p.categoryLabel || p.category;
 if (displayCat !== activeCategory) return false;
 }
 if (activeBrand && p.brandLabel !== activeBrand) return false;
 return true;
 });
 }, [products, activeCategory, activeBrand]);

 const toggleCategory = (label: string) => {
 const next = activeCategory === label ? null : label;
 setActiveCategory(next);
 // Clear brand if it's no longer in the new category
 if (next !== null && activeBrand) {
 const stillValid = visibleBrandCounts.some((b) => b.label === activeBrand);
 if (!stillValid) setActiveBrand(null);
 }
 };

 const toggleBrand = (label: string) => {
 setActiveBrand((prev) => (prev === label ? null : label));
 };

 return (
 <div>
 {/* Product grid */}
 <section className="py-6 sm:py-8">
 <div className="max-w-7xl mx-auto px-6">
 <FilteredProductGrid
 products={filteredProducts}
 stores={[store]}
 showCategoryFilter
 showBrandFilter
 showSizeFilter
 emptyMessage="No products found."
 from="store"
 />
 </div>
 </section>
 </div>
 );
}
