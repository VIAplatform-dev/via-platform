import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "Source Twenty Four: The Story Behind the Selection | VYA",
 description:
 "Why we chose Source Twenty Four for VYA. Authentic designer accessories, sustainable luxury fashion, and thoughtfully curated resale.",
};

export default function SourceTwentyFourStory() {
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
 src="/stores/source-twenty-four.jpg"
 alt="Source Twenty Four"
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
 Source Twenty Four
 </h1>

 <div className="prose prose-lg max-w-none text-[#5D0F17]/70 leading-relaxed space-y-6">
 <p>
 Source 24 is a vintage destination built on the idea that the best fashion
 already has a story. Founded by a mother&ndash;daughter duo in New Jersey,
 the brand grew from their shared tradition of searching for hidden designer
 treasures and turning those discoveries into a thoughtfully curated collection
 for others to enjoy.
 </p>

 <p>
 The collection focuses heavily on luxury accessories from iconic fashion
 houses. You&apos;ll often find Burberry leather purses, Balenciaga archive bags,
 Bottega Veneta wallets, and classic Celine totes, pieces that represent the
 enduring craftsmanship of European luxury design. These are items chosen for
 their longevity, designed to move seamlessly from one wardrobe to the next.
 </p>

 <p className="font-serif text-[#5D0F17] text-xl">
 At VYA, we love highlighting independent vintage boutiques that prioritize
 authentic designer accessories, sustainable luxury fashion, and thoughtfully
 curated resale. Source Twenty Four is exactly that.
 </p>
 </div>

 {/* CTA */}
 <div className="mt-12 pt-8">
 <Link
 href="/stores/source-twenty-four"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Shop Source Twenty Four
 </Link>
 </div>
 </article>
 </main>
 );
}
