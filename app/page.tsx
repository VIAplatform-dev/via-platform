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

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-serif mb-8 text-white leading-tight max-w-5xl">
  Shop the best vintage<br />
  <span className="whitespace-nowrap">
    and resale stores 
  </span>
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

     {/* ================= SHOP BY STORE ================= */}
<section className="bg-neutral-100 py-32">
  <div className="max-w-7xl mx-auto px-6">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-16">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
          Selected by VIA
        </p>
        <h2 className="text-5xl font-serif text-black">
          Shop by Store
        </h2>
      </div>

      <Link
        href="/stores"
        className="mt-6 sm:mt-0 text-sm uppercase tracking-wide underline"
      >
        View all stores
      </Link>
    </div>

    {/* Store grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-10">
      {[
        {
          name: "LEI",
          slug: "lei",
          location: "Boston, MA",
          image: "/stores/LEI.jpg",
        },
        {
          name: "Sourced by Scottie",
          slug: "sourced-by-scottie",
          location: "Washington, DC",
          image: "/stores/sourced-by-scottie.jpg",
        },
        {
          name: "RE Park City",
          slug: "re-park-city",
          location: "Park City, UT",
          image: "/stores/re-park-city.jpg",
        },
      ].map((store) => (
        <Link
          key={store.slug}
          href={`/stores/${store.slug}`}
          className="group block"
        >
          {/* Image */}
          <div className="aspect-[4/5] relative overflow-hidden mb-4">
            <Image
              src={store.image}
              alt={store.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition" />
          </div>

          {/* Text */}
          <h3 className="text-xl font-serif text-black">
            {store.name}
          </h3>
          <p className="text-sm text-gray-600">
            {store.location}
          </p>
        </Link>
      ))}
    </div>
  </div>
</section>

    {/* ================= SHOP BY CATEGORY ================= */}
<section className="bg-[#f1f1ee] py-32">
  <div className="max-w-7xl mx-auto px-6">
    <h2 className="text-6xl font-serif mb-12 text-black">
      Shop by Category
    </h2>

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
      {[
        { label: "Clothes", slug: "clothes", image: "/categories/clothes.jpg" },
        { label: "Bags", slug: "bags", image: "/categories/bags.jpg" },
        { label: "Shoes", slug: "shoes", image: "/categories/shoes.jpg" },
        { label: "Accessories", slug: "accessories", image: "/categories/accessories.jpg" },
      ].map((category) => (
        <Link
          key={category.slug}
          href={`/categories/${category.slug}`}
          className="group relative block overflow-hidden"
        >
          {/* Image */}
          <div className="aspect-[3/4] relative">
            <Image
              src={category.image}
              alt={category.label}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />

            {/* Overlay */}
            <div className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition" />

            {/* Text */}
            <div className="absolute bottom-6 left-6">
              <h3 className="text-2xl font-serif text-white mb-1">
                {category.label}
              </h3>
              <p className="text-xs uppercase tracking-wide text-white/80">
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
            into one seamless browsing experience, while keeping checkout
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
                Purchase directly from the original store, no middlemen.
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

