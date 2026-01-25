export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { inventory } from "@/app/lib/inventory";
import { categories } from "@/app/lib/categories";
import { stores } from "@/app/lib/stores";
import FilteredProductGrid from "@/app/components/FilteredProductGrid";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";

export default async function CategoryPage({
  params,
}: {
  params: { category: string };
}) {
  const category = (await params).category;

  // Validate category
  const categoryMeta = categories.find((c) => c.slug === category);
  if (!categoryMeta) {
    return notFound();
  }

  // Filter inventory by category and transform for FilteredProductGrid
  const filteredProducts: FilterableProduct[] = inventory
    .filter((item) => item.category === category)
    .map((item, idx) => ({
      id: item.id,
      title: item.title,
      price: item.price,
      category: item.category,
      categoryLabel: categoryMeta.label,
      store: item.store,
      storeSlug: item.storeSlug,
      externalUrl: item.externalUrl,
      image: item.image,
      createdAt: Date.now() - idx * 1000, // Preserve original order for "newest"
    }));

  // Get stores for the filter
  const storeList = stores.map((s) => ({ slug: s.slug, name: s.name }));

  return (
    <main className="bg-white min-h-screen text-black">
      {/* ================= CATEGORY HERO ================= */}
      <section className="bg-[#f7f6f3] py-24 sm:py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
            Category
          </p>

          <h1 className="text-5xl sm:text-6xl font-serif mb-6">
            {categoryMeta.label}
          </h1>

          <p className="text-lg text-neutral-700 max-w-2xl mx-auto">
            Curated {categoryMeta.label.toLowerCase()} from independent vintage
            and resale stores.
          </p>
        </div>
      </section>

      {/* ================= PRODUCTS WITH FILTERS ================= */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-8">
            <h2 className="text-3xl font-serif">Available pieces</h2>

            <Link
              href="/categories"
              className="text-sm uppercase tracking-wide underline hover:no-underline"
            >
              Back to categories
            </Link>
          </div>

          <FilteredProductGrid
            products={filteredProducts}
            stores={storeList}
            emptyMessage="No products found in this category."
          />
        </div>
      </section>
    </main>
  );
}
