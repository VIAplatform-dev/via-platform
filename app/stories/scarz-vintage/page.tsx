import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "Scarz Vintage: The Story Behind the Selection | VYA",
 description:
 "Why we chose Scarz Vintage for VYA. Curated vintage at its best: thoughtful, refined, and intentional.",
};

export default function ScarzVintageStory() {
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
 src="/stores/scarz-vintage.jpg"
 alt="Scarz Vintage"
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
 Scarz Vintage
 </h1>

 <div className="prose prose-lg max-w-none text-[#5D0F17]/70 leading-relaxed space-y-6">
 <p>
 Scarz Vintage is the kind of independent vintage store that understands
 that luxury fashion doesn&apos;t expire; it evolves. Built around a sharp
 eye for designer resale and archival pieces, Scarz focuses on sourcing
 vintage designer clothing that feels as relevant now as it did decades ago.
 </p>

 <p>
 When we discovered Scarz, what stood out immediately wasn&apos;t just the
 brands; it was the edit. This is curated vintage at its best: thoughtful,
 refined, and intentional. You&apos;ll find luxury labels, rare statement
 pieces, and timeless wardrobe staples that can be passed down to generations.
 </p>

 <p>
 Scarz Vintage represents everything we believe secondhand shopping should be.
 Transparent, quality-focused, and deeply curated. No trend chasing. No
 overproduction. Just elevated, authenticated luxury resale selected with care.
 </p>

 <p className="font-serif text-[#5D0F17] text-xl">
 At VYA, our mission is to make it easier to discover the best independent
 vintage stores and designer secondhand boutiques in one place. Scarz Vintage
 is exactly why VYA exists, to connect shoppers with the finest online vintage
 boutiques that prioritize authenticity, longevity, and style that lasts.
 </p>
 </div>

 {/* CTA */}
 <div className="mt-12 pt-8">
 <Link
 href="/stores/scarz-vintage"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Shop Scarz Vintage
 </Link>
 </div>
 </article>
 </main>
 );
}
