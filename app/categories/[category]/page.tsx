import { notFound } from "next/navigation";
import Link from "next/link";
import { products } from "../../stores/productData";
import { stores } from "../../stores/storeData";
import ProductCard from "../../components/ProductCard";

const CATEGORY_LABELS: Record<string, string> = {
  clothes: "Clothes",
  bags: "Bags",
  shoes: "Shoes",
  accessories: "Accessories",
};

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const label = CATEGORY_LABELS[category];

  if (!label) return notFound();

  const filteredProducts = products.filter(
    (p) => p.category === label
  );

  return (
    <main className="bg-white min-h-screen text-black">

      {/* ================= CATEGORY HERO ================= */}
      <section className="bg-[#f7f6f3] py-24 sm:py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
            Category
          </p>

          <h1 className="text-5xl sm:text-6xl font-serif mb-6">
            {label}
          </h1>

          <p className="text-lg text-neutral-700 max-w-2xl mx-auto">
            Curated {label.toLowerCase()} from independent vintage and resale stores.
          </p>
        </div>
      </section>

      {/* ================= PRODUCTS ================= */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">

          <div className="flex items-end justify-between mb-12">
            <h2 className="text-3xl font-serif">
              Available pieces
            </h2>

            <Link
              href="/categories"
              className="text-sm uppercase tracking-wide underline"
            >
              Back to categories
            </Link>
          </div>

          {filteredProducts.length === 0 ? (
            <p className="text-black/70 text-center">
              Products coming soon.
            </p>
          ) : (
            <div className="flex md:grid md:grid-cols-4 gap-6 overflow-x-auto md:overflow-visible pb-4">
              {filteredProducts.map((product) => {
                const store = stores.find(
                  (s) => s.slug === product.storeSlug
                );

                return (
                  <div
  key={product.id}
  className="group min-w-[70%] sm:min-w-[45%] md:min-w-0"
>
<ProductCard
  name={product.name}
  price={product.price}
  category={product.category}
  storeName={store?.name ?? ""}
  storeSlug={product.storeSlug}
  externalId={product.id}
/>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

    </main>
  );
}

