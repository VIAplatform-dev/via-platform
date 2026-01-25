import { notFound } from "next/navigation";
import Link from "next/link";
import { stores } from "@/app/lib/stores";
import { loadStoreProducts } from "@/app/lib/loadStoreProducts";
import { StoreProduct } from "@/app/lib/types";
import { categoryMap } from "@/app/lib/categoryMap";
import FilteredProductGrid from "@/app/components/FilteredProductGrid";
import type { FilterableProduct } from "@/app/components/FilteredProductGrid";

type StorePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

// Helper to parse price string to number
function parsePrice(priceStr: string): number {
  const cleaned = priceStr.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

export default async function StorePage({ params }: StorePageProps) {
  const { slug } = await params;

  const store = stores.find((s) => s.slug === slug);
  if (!store) return notFound();

  const storeProducts: StoreProduct[] = loadStoreProducts(slug);

  // Transform to FilterableProduct format
  const products: FilterableProduct[] = storeProducts.map((product, idx) => ({
    id: product.id,
    title: product.name,
    price: parsePrice(product.price),
    category: product.category,
    categoryLabel: categoryMap[product.category as keyof typeof categoryMap],
    store: store.name,
    storeSlug: store.slug,
    externalUrl: product.externalUrl,
    image: product.image ?? "",
    createdAt: Date.now() - idx * 1000,
  }));

  return (
    <main className="bg-white min-h-screen">
      {/* ================= STORE HEADER ================= */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-28">
          <Link
            href="/stores"
            className="inline-block mb-12 text-xs tracking-[0.25em] uppercase text-neutral-500 hover:text-black transition"
          >
            ← All Stores
          </Link>

          <h1 className="text-4xl sm:text-5xl font-serif mb-4">{store.name}</h1>

          <p className="text-sm text-neutral-600 mb-6">{store.location}</p>

          {store.description && (
            <p className="text-neutral-700 max-w-xl">{store.description}</p>
          )}
        </div>
      </section>

      {/* ================= PRODUCTS WITH FILTERS ================= */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <FilteredProductGrid
            products={products}
            stores={[{ slug: store.slug, name: store.name }]}
            emptyMessage="Products coming soon."
          />
        </div>
      </section>
    </main>
  );
}
