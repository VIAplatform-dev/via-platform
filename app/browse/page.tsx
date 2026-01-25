export const dynamic = "force-dynamic";

import Link from "next/link";
import { inventory } from "@/app/lib/inventory";
import { stores } from "@/app/lib/stores";
import { categories } from "@/app/lib/categories";
import { categoryMap } from "@/app/lib/categoryMap";
import FilteredProductGrid from "@/app/components/FilteredProductGrid";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";

export default function BrowsePage() {
  // Transform inventory to FilterableProduct format
  const products: FilterableProduct[] = inventory.map((item, idx) => ({
    id: item.id,
    title: item.title,
    price: item.price,
    category: item.category,
    categoryLabel: categoryMap[item.category as keyof typeof categoryMap],
    store: item.store,
    storeSlug: item.storeSlug,
    externalUrl: item.externalUrl,
    image: item.image,
    createdAt: Date.now() - idx * 1000,
  }));

  // Get stores for the filter
  const storeList = stores.map((s) => ({ slug: s.slug, name: s.name }));

  // Get categories for the filter
  const categoryList = categories.map((c) => ({ slug: c.slug, label: c.label }));

  return (
    <main className="bg-white min-h-screen text-black">
      {/* ================= HERO ================= */}
      <section className="bg-[#f7f6f3] py-24 sm:py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
            Explore
          </p>

          <h1 className="text-5xl sm:text-6xl font-serif mb-6">
            Browse All Pieces
          </h1>

          <p className="text-lg text-neutral-700 max-w-2xl mx-auto">
            Discover curated vintage and resale from our network of independent
            stores.
          </p>
        </div>
      </section>

      {/* ================= PRODUCTS WITH FILTERS ================= */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-8">
            <h2 className="text-3xl font-serif">All Products</h2>

            <div className="flex items-center gap-6">
              <Link
                href="/categories"
                className="text-sm uppercase tracking-wide underline hover:no-underline"
              >
                Shop by Category
              </Link>
              <Link
                href="/stores"
                className="text-sm uppercase tracking-wide underline hover:no-underline"
              >
                Shop by Store
              </Link>
            </div>
          </div>

          <FilteredProductGrid
            products={products}
            stores={storeList}
            categories={categoryList}
            showCategoryFilter={true}
            emptyMessage="No products found. Check back soon for new arrivals."
          />
        </div>
      </section>
    </main>
  );
}
