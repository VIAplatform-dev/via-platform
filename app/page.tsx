import Link from "next/link";
import FAQAccordion from "./components/FAQAccordion";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="w-full">
{/* ================= HERO ================= */}
<section className="relative min-h-screen flex items-center overflow-hidden">

  {/* Background image */}
  <div className="absolute inset-0">
    <Image
      src="/hero-v3.jpeg"
      alt="VIA curated vintage"
      fill
      priority
      className="object-cover object-top md:object-center"
    />
    <div className="absolute inset-0 bg-black/60" />
  </div>

  {/* Content wrapper */}
  <div className="relative z-10 w-full">
    <div className="max-w-7xl mx-auto px-6">
      <div className="max-w-2xl animate-hero">

        <p className="text-xs tracking-[0.25em] text-gray-300 mb-6 uppercase">
          Curated Vintage & Resale
        </p>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-serif mb-8 text-white leading-tight">
          Shop the best vintage stores,
          <br className="hidden sm:block" />
          all in one place
        </h1>

        <p className="max-w-xl mb-10 text-lg text-gray-200">
          Discover and browse independent vintage and resale stores nationwide.
          Find what you love, then checkout directly with the store.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 animate-hero delay-150">
          <Link
            href="/stores"
            className="bg-white px-10 py-4 text-sm uppercase tracking-wide hover:bg-neutral-200 transition text-black text-center"
          >
            Explore Stores
          </Link>

          <Link
            href="/categories"
            className="border border-white text-white px-10 py-4 text-sm uppercase tracking-wide hover:bg-white hover:text-black transition text-center"
          >
            Browse Categories
          </Link>
        </div>

      </div>
    </div>
  </div>
</section>

      {/* ================= HIGHLIGHTED STORES ================= */}
      <section className="bg-neutral-100 py-32 text-black">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-end mb-16">
            <div>
              <h2 className="text-5xl font-serif mb-4">
                Selected by VIA
              </h2>

              <p className="max-w-md">
                A curated selection of independent stores we’re excited about.
              </p>
            </div>

            <Link
              href="/stores"
              className="border border-black px-6 py-3 text-sm uppercase"
            >
              Explore all stores
            </Link>
          </div>

          <div className="flex md:grid md:grid-cols-3 gap-6 overflow-x-auto md:overflow-visible pb-4">
            {["LEI", "Sourced by Scottie", "RE Park City"].map((store) => (
              <Link
                key={store}
                href={`/stores/${store.toLowerCase().replace(/\s/g, "-")}`}
                className="group relative min-w-[80%] md:min-w-0"
              >
               <div className="aspect-[3/4] bg-gray-300 mb-4 overflow-hidden relative transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-[1.01]">
  <div className="absolute inset-0 bg-black/10" />
</div>
<h3 className="text-lg font-serif">{store}</h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ================= SHOP BY CATEGORY ================= */}
<section className="bg-[#f1f1ee] py-32">
  <div className="max-w-7xl mx-auto px-6">
  <h2 className="text-5xl font-serif mb-14">
      Shop by Category
    </h2>

    <div className="flex md:grid md:grid-cols-4 gap-6 overflow-x-auto md:overflow-visible pb-4">
      {["Clothes", "Bags", "Shoes", "Accessories"].map((category) => (
        <Link
          key={category}
          href={`/categories/${category.toLowerCase()}`}
          className="group relative min-w-[75%] md:min-w-0"
        >
          <div className="aspect-[3/4] bg-gray-300 overflow-hidden relative transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-[1.01]">
            <div className="absolute inset-0 bg-black/5 group-hover:bg-black/10 transition" />

            <div className="absolute top-6 left-6">
            <h3 className="text-xl font-serif text-black">
                {category}
              </h3>
              <p className="text-xs uppercase tracking-wide text-black/70 mt-1">
                Explore
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  </div>
</section>
      {/* ================= FAQ TEASER ================= */}
      <section className="bg-[#f7f6f3] py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-20">
            <div className="max-w-xl">
              <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
                Have questions?
              </p>

              <h2 className="text-5xl font-serif mb-6">
                Frequently Asked Questions
              </h2>

              <p className="text-gray-700">
                Everything you need to know about shopping, shipping,
                and how VIA works.
              </p>
            </div>

            <div className="mt-8 md:mt-2">
              <Link
                href="/faqs"
                className="inline-block border border-black px-6 py-3 text-sm uppercase tracking-wide hover:bg-black hover:text-white transition"
              >
                Explore FAQs
              </Link>
            </div>
          </div>

          <FAQAccordion
            faqs={[
              {
                q: "Is everything authentic?",
                a: "Yes — we partner only with vetted stores known for authenticity and quality.",
              },
              {
                q: "Who handles shipping?",
                a: "Each store fulfills orders directly using their own shipping policies.",
              },
              {
                q: "What about returns?",
                a: "Return policies are set by each individual store and listed on their product pages.",
              },
              {
                q: "Where do you ship?",
                a: "Stores on VIA ship nationwide, and some offer international shipping.",
              },
            ]}
          />
        </div>
      </section>

      {/* ================= VIA EXPERIENCE / WAITLIST ================= */}
      <section className="bg-black py-32 text-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400 mb-4">
            The VIA Experience
          </p>

          <h2 className="text-5xl font-serif mb-6">
            A better way to shop vintage
          </h2>

          <p className="max-w-2xl mx-auto mb-20 text-gray-300">
            VIA brings together the best independent vintage and resale stores
            into one seamless browsing experience — while keeping checkout
            with the store you love.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-20">
            <div>
              <h3 className="text-xl font-serif mb-3">Browse across stores</h3>
              <p className="text-gray-300">
                Explore curated inventory from multiple stores at once.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-serif mb-3">Discover rare pieces</h3>
              <p className="text-gray-300">
                Find one-of-a-kind items you won’t see everywhere else.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-serif mb-3">Checkout with confidence</h3>
              <p className="text-gray-300">
                Purchase directly from the original store — no middlemen.
              </p>
            </div>
          </div>

          <Link
            href="https://viaplatform.carrd.co"
            className="bg-white text-black px-12 py-4 text-sm uppercase tracking-wide hover:bg-neutral-200 transition"
          >
            Join the waitlist
          </Link>
        </div>
      </section>

    </main>
  );
}

