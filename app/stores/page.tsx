import Link from "next/link";
import Image from "next/image";
import { stores } from "@/app/lib/stores";

export default function StoresPage() {
  return (
    <main className="bg-white min-h-screen text-black">

      {/* ================= HEADER ================= */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-16 sm:py-28">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif mb-4 sm:mb-6">
            Explore Our Stores
          </h1>
          <p className="text-neutral-600 text-base sm:text-lg max-w-2xl">
            A curated selection of independent vintage and resale stores,
            each with a distinct point of view.
          </p>
        </div>
      </section>

      {/* ================= STORES GRID ================= */}
      <section className="py-16 sm:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 lg:gap-x-12 gap-y-12 sm:gap-y-24">

            {stores.map((store) => (
              <div key={store.slug} className="group">

                {/* IMAGE (CLICKABLE) */}
                <Link href={`/stores/${store.slug}`} className="block mb-6">
                  <div className="relative aspect-[3/4] bg-neutral-100 overflow-hidden">
                    {store.image && (
                      <Image
                        src={store.image}
                        alt={store.name}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                  </div>
                </Link>

                {/* TEXT (ALSO CLICKABLE) */}
                <Link href={`/stores/${store.slug}`} className="block">
                  <h2 className="text-xl font-serif mb-1 group-hover:underline underline-offset-4">
                    {store.name}
                  </h2>
                </Link>

                <p className="text-sm text-neutral-500 mb-3">
                  {store.location}
                </p>

                <p className="text-neutral-700 leading-relaxed line-clamp-3">
                  {store.description}
                </p>

              </div>
            ))}

          </div>
        </div>
      </section>

    </main>
  );
}
