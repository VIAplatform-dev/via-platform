"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import FilteredProductGrid from "./FilteredProductGrid";
import type { FilterableProduct } from "./FilteredProductGrid";

type StoreCount = { slug: string; name: string; count: number };
type BrandCount = { slug: string; label: string; count: number };

type Props = {
 label: string;
 products: FilterableProduct[];
 stores: { slug: string; name: string }[];
 storeCounts: StoreCount[];
 brandCounts: BrandCount[];
 categories?: { slug: string; label: string }[];
 showCategoryFilter?: boolean;
 showSizeFilter?: boolean;
 showTypeFilter?: boolean;
 from?: string;
 emptyMessage?: string;
};

export default function CategoryContent({
 label,
 products,
 stores,
 storeCounts,
 brandCounts,
 categories = [],
 showCategoryFilter = false,
 showSizeFilter = false,
 showTypeFilter = false,
 from,
 emptyMessage,
}: Props) {
 const [activeStore, setActiveStore] = useState<string | null>(null);
 const [activeBrand, setActiveBrand] = useState<string | null>(null);

 const visibleProducts = useMemo(() => {
 let result = products;
 if (activeStore) result = result.filter((p) => p.storeSlug === activeStore);
 if (activeBrand) result = result.filter((p) => p.brand === activeBrand);
 return result;
 }, [products, activeStore, activeBrand]);

 function toggleStore(slug: string) {
 setActiveStore((prev) => (prev === slug ? null : slug));
 setActiveBrand(null);
 }

 function toggleBrand(slug: string) {
 setActiveBrand((prev) => (prev === slug ? null : slug));
 setActiveStore(null);
 }

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* Header */}
 <section className="">
 <div className="max-w-7xl mx-auto px-6 pt-8 pb-4 sm:pt-10 sm:pb-6">
 <Link
 href="/categories"
 className="inline-block mb-6 text-xs tracking-[0.25em] uppercase text-[#5D0F17]/50 hover:text-[#5D0F17] transition"
 >
 &larr; All Categories
 </Link>
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">{label}</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 {label} sourced by our partner stores.
 </p>

 </div>
 </section>

 {/* Products */}
 <section className="py-6 sm:py-8">
 <div className="max-w-7xl mx-auto px-6">
 <FilteredProductGrid
 products={visibleProducts}
 stores={stores}
 categories={categories}
 showCategoryFilter={showCategoryFilter}
 showSizeFilter={showSizeFilter}
 showTypeFilter={showTypeFilter}
 from={from}
 emptyMessage={emptyMessage}
 />
 </div>
 </section>
 </main>
 );
}
