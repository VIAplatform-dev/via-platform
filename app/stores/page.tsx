import Link from "next/link";
import Image from "next/image";
import { stores } from "./storeData";

export default function StoresPage() {
  return (
    <main className="bg-white min-h-screen text-black">

      {/* ================= HEADER ================= */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-28">
          <h1 className="text-5xl sm:text-6xl font-serif mb-6">
            Explore Our Stores
          </h1>
          <p className="text-neutral-600 text-lg max-w-2xl">
            A curated selection of independent vintage and resale stores,
            each with a distinct point of view.
          </p>
        </div>
      </section>

      {/* ================= STORES GRID ================= */}
      <section className="py-28">
        <div className="max-w-7xl mx-auto px-6">

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-24">
            {stores.map((store) => (
              <Link
                key={store.slug}
                href={`/stores/${store.slug}`}
                className="group"
              >
                {/* IMAGE */}
                <div className="relative aspect-[4/5] bg-neutral-100 overflow-hidden mb-6">
  <Image
    src={store.image}
    alt={store.name}
    fill
    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
    className="object-cover transition-transform duration-500 group-hover:scale-105"
  />
</div>


                {/* TEXT */}
                <div>
                  <h2 className="text-xl font-serif mb-1 group-hover:underline underline-offset-4">
                    {store.name}
                  </h2>

                  <p className="text-sm text-neutral-500 mb-3">
                    {store.location}
                  </p>

                  <p className="text-neutral-700 leading-relaxed line-clamp-3">
                    {store.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>

        </div>
      </section>

    </main>
  );
}
