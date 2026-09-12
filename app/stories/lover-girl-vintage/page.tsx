import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "Lovergirl Vintage: The Story Behind the Selection | VYA",
 description:
 "Why we chose Lovergirl Vintage for VYA. A curated vintage denim & blazer destination, hand-picked by Lexi.",
};

export default function LovergirlVintageStory() {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* Back nav */}
 <div className="max-w-3xl mx-auto px-6 pt-8 pb-4">
 <Link
 href="/stories"
 className="inline-block text-xs tracking-[0.25em] uppercase text-[#5D0F17]/50 hover:text-[#5D0F17] transition"
 >
 &larr; All Stories
 </Link>
 </div>

 {/* Hero image */}
 <div className="max-w-4xl mx-auto px-6 mb-12">
 <div className="aspect-[16/9] relative overflow-hidden rounded-sm">
 <Image
 src="/stores/lover-girl-vintage.jpg"
 alt="Lovergirl Vintage"
 fill
 priority
 className="object-cover"
 />
 </div>
 </div>

 {/* Article */}
 <article className="max-w-3xl mx-auto px-6 pb-24">
 <p className="text-xs uppercase tracking-[0.25em] text-[#5D0F17]/50 mb-4">
 The Story Behind the Selection
 </p>

 <h1 className="text-3xl sm:text-5xl font-serif mb-8 leading-tight">
 Lovergirl Vintage
 </h1>

 <div className="prose prose-lg max-w-none text-[#5D0F17]/70 leading-relaxed space-y-6">
 <p>
 Lovergirl Vintage is a curated vintage denim &amp; blazer destination, focused on
 sourcing timeless pieces that combine quality, fit, and everyday wearability.
 </p>

 <p>
 When we discovered Lover Girl Vintage, what stood out was its dedication to finding
 quality items, with every item being handpicked by Lexi.
 </p>

 <p>
 Lover Girl Vintage represents everything we believe great vintage should be:
 effortless, essential, and built to last.
 </p>

 <p className="font-serif text-[#5D0F17] text-xl">
 At vya, our mission is to make it easier to discover the best independent vintage
 boutiques and designer resale stores in one place. Lover Girl Vintage is exactly why
 vya exists, to connect shoppers with stores that elevate everyday staples through
 thoughtful, focused curation.
 </p>
 </div>

 {/* CTA */}
 <div className="mt-12 pt-8">
 <Link
 href="/stores/lover-girl-vintage"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Shop Lovergirl Vintage
 </Link>
 </div>
 </article>
 </main>
 );
}
