import { notFound } from "next/navigation";
import Link from "next/link";
import { stores } from "../storeData";
import { products } from "../productData";
import ProductCard from "@/app/components/ProductCard";

export default async function StorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const store = stores.find((s) => s.slug === slug);
  if (!store) return notFound();

  const storeProducts = products.filter(
    (p) => p.storeSlug === store.slug
  );

  return (
    <main className="bg-white min-h-screen">

      {/* ================= STORE HERO ================= */}
      <section className="bg-[#f7f6f3] py-24 sm:py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
            Independent Store
          </p>

          <h1 className="text-5xl sm:text-6xl font-serif mb-4">
            {store.name}
          </h1>

          <p className="text-gray-600 mb-6">
            {store.location}
          </p>

          <p className="text-lg text-gray-700 max-w-2xl mx-auto">
            {store.description}
          </p>
        </div>
      </section>

      {/* ================= PRODUCTS ================= */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">

          <div className="flex items-end justify-between mb-12">
            <h2 className="text-3xl font-serif">
              Available from {store.name}
            </h2>

            <Link
              href="/stores"
              className="text-sm uppercase tracking-wide underline"
            >
              Back to stores
            </Link>
          </div>

          {storeProducts.length === 0 ? (
            <p className="text-gray-500">
              Products coming soon.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10">
              {storeProducts.map((product) => (
                <ProductCard
                key={product.id}
                name={product.name}
                price={product.price}
                category={product.category}
                storeName={store.name}
                storeSlug={store.slug}
                externalId={product.id}
              />              
              ))}
            </div>
          )}
        </div>
      </section>

    </main>
  );
}
