import Link from "next/link";

const categories = [
  { slug: "clothes", label: "Clothing" },
  { slug: "bags", label: "Bags" },
  { slug: "shoes", label: "Shoes" },
  { slug: "accessories", label: "Accessories" },
];

export default function CategoriesPage() {
  return (
    <main className="bg-white min-h-screen">

      {/* HEADER */}
      <section className="py-24 sm:py-32">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h1 className="text-5xl sm:text-6xl font-serif mb-6">
            Shop by Category
          </h1>
          <p className="text-neutral-600 text-lg">
            Browse curated resale across our most-loved categories.
          </p>
        </div>
      </section>

      {/* GRID */}
      <section className="pb-32">
  <div className="max-w-7xl mx-auto px-6 flex md:grid md:grid-cols-4 gap-6 overflow-x-auto md:overflow-visible pb-4">

    {categories.map((cat) => (
      <Link
        key={cat.slug}
        href={`/categories/${cat.slug}`}
        className="group min-w-[75%] sm:min-w-[45%] md:min-w-0 transition-transform duration-300 hover:-translate-y-1 hover:scale-[1.01]"
      >
        <div className="aspect-[3/4] bg-neutral-200 mb-4 overflow-hidden relative">
          <div className="absolute inset-0 bg-black/5 group-hover:bg-black/10 transition" />
        </div>

        <h2 className="text-lg font-serif tracking-wide">
          {cat.label}
        </h2>
      </Link>
    ))}

  </div>
</section>
    </main>
  );
}
