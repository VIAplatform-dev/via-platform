import { notFound } from "next/navigation";
import Link from "next/link";
import { stores } from "@/app/lib/stores";
import ProductCard from "@/app/components/ProductCard";
import { loadStoreProducts } from "@/app/lib/loadStoreProducts";
import { StoreProduct } from "@/app/lib/types";
import { categoryMap } from "@/app/lib/categoryMap";

const CATEGORY_LABEL_MAP: Record<string, "Clothing" | "Bags" | "Shoes" | "Accessories"> = {
  clothes: "Clothing",
  bags: "Bags",
  shoes: "Shoes",
  accessories: "Accessories",
};
type StorePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function StorePage({ params }: StorePageProps) {
  // ✅ THIS IS THE KEY FIX
  const { slug } = await params;

  console.log("STORE SLUG:", slug);

  const store = stores.find((s) => s.slug === slug);
  if (!store) return notFound();

  const storeProducts: StoreProduct[] = loadStoreProducts(slug);

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

          <h1 className="text-4xl sm:text-5xl font-serif mb-4">
            {store.name}
          </h1>

          <p className="text-sm text-neutral-600 mb-6">
            {store.location}
          </p>

          {store.description && (
            <p className="text-neutral-700 max-w-xl">
              {store.description}
            </p>
          )}
        </div>
      </section>

      {/* ================= PRODUCTS ================= */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          {storeProducts.length === 0 ? (
            <p className="text-neutral-500">Products coming soon.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8">
              {storeProducts.map((product) => (
                <ProductCard
                key={product.id}
                name={product.name}
                price={product.price}
                category={categoryMap[product.category]}
                storeName={store.name}
                storeSlug={store.slug}
                externalId={product.id}
                image={product.image ?? ""}
              />              
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
