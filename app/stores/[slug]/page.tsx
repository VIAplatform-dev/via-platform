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

      {/* ================= STORE HEADER ================= */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-28">

          {/* breadcrumb */}
          <Link
            href="/stores"
            className="inline-block mb-12 text-xs tracking-[0.25em] uppercase text-neutral-500 hover:text-black transition"
          >
            ← All Stores
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-start">

            {/* LEFT: STORE INFO */}
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-neutral-500 mb-5">
                Curated Store
              </p>

              <h1 className="text-4xl sm:text-5xl font-serif mb-6">
                {store.name}
              </h1>

              <p className="text-sm text-neutral-600 mb-8">
                {store.location}
              </p>

              <p className="text-neutral-700 leading-relaxed max-w-lg">
                {store.description}
              </p>

              {/* categories */}
              {store.categories && (
                <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4">
                  {store.categories.map((cat) => (
                    <span
                      key={cat}
                      className="text-xs uppercase tracking-wide text-neutral-500"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT: EDITORIAL IMAGE (SMALLER) */}
<div className="flex md:justify-end">
  <div className="w-full md:w-[70%] aspect-[3/4] bg-neutral-100">
    {/* later: store hero image */}
  </div>
</div>
</div>
        </div>
      </section>

      {/* ================= PRODUCT BAR ================= */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-12 flex items-center justify-between">

          <p className="text-sm text-neutral-600">
            {storeProducts.length} pieces available
          </p>

          <div className="flex gap-8">
            <button className="text-xs uppercase tracking-[0.2em] text-neutral-600 hover:text-black transition">
              Featured
            </button>
            <button className="text-xs uppercase tracking-[0.2em] text-neutral-600 hover:text-black transition">
              New
            </button>
            <button className="text-xs uppercase tracking-[0.2em] text-neutral-600 hover:text-black transition">
              Price
            </button>
          </div>

        </div>
      </section>

      {/* ================= PRODUCTS ================= */}
      <section className="py-28">
        <div className="max-w-7xl mx-auto px-6">

          {storeProducts.length === 0 ? (
            <p className="text-neutral-500">
              Products coming soon.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-8 gap-y-16">
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
