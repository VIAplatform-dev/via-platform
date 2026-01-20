export const dynamic = "force-dynamic";

import Link from "next/link";
import { getActiveCategories } from "@/app/lib/getActiveCategories";
import Container from "@/app/components/container";

export default function CategoriesPage() {
  const categories = getActiveCategories();
  {categories.length === 0 && (
    <p className="text-neutral-500">Categories coming soon.</p>
  )}
  

  return (
    <main className="bg-white min-h-screen">

      {/* ================= HEADER ================= */}
      <section className="border-b border-neutral-200">
        <Container>
          <div className="py-28">
            <h1 className="text-5xl sm:text-6xl font-serif mb-6">
              Shop by Category
            </h1>

            <p className="text-neutral-600 text-lg max-w-2xl">
              Browse curated vintage and resale across our most-loved categories.
            </p>
          </div>
        </Container>
      </section>

      {/* ================= CATEGORY GRID ================= */}
      <section className="py-32">
        <Container>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-10 gap-y-28">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/categories/${cat.slug}`}
                className="group"
              >
                {/* IMAGE */}
                <div className="relative aspect-[3/4] bg-neutral-100 overflow-hidden mb-6">
                  <img
                    src={cat.image}
                    alt={cat.label}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                  />
                </div>

                {/* TEXT */}
                <h2 className="text-xl font-serif group-hover:underline underline-offset-4">
                  {cat.label}
                </h2>
              </Link>
            ))}
          </div>
        </Container>
      </section>

    </main>
  );
}
