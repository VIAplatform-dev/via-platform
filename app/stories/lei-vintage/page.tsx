import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "LEI Vintage: The Story Behind the Selection | VYA",
 description:
 "Why we chose LEI Vintage for VYA. A brand built on the idea that the best style already exists.",
};

export default function LEIVintageStory() {
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
 src="/stores/LEI.jpg"
 alt="LEI Vintage"
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
 LEI Vintage
 </h1>

 <div className="prose prose-lg max-w-none text-[#5D0F17]/70 leading-relaxed space-y-6">
 <p>
 Some brands start with a new collection. LEI started with a realization.
 </p>

 <p>
 When Leila began dreaming about building her own clothing line, she hit a
 truth she couldn&apos;t ignore&mdash;the world doesn&apos;t need more clothes. It
 needs better choices. So instead of adding to the noise, she chose to
 rewind it.
 </p>

 <p>
 Inspired by a closet full of secondhand treasures and a lifelong habit of
 &ldquo;borrowing&rdquo; from her mom&apos;s beautifully curated collection, LEI was
 built on the idea that the best style already exists. Think timeless
 designer clothes, heritage luxury brands, and elegant designer pieces
 crafted to last far beyond a single season. Each piece is sourced for its
 quality, character, and quiet ability to become someone&apos;s forever staple.
 </p>

 <p>
 LEI isn&apos;t about more. It&apos;s about meaning. About choosing timeless fashion
 over temporary. About rediscovering luxury fashion that has already proved
 itself.
 </p>

 <p className="font-serif text-[#5D0F17] text-xl">
 Exactly the kind of story we&apos;re proud to bring to VYA.
 </p>
 </div>

 {/* CTA */}
 <div className="mt-12 pt-8">
 <Link
 href="/stores/lei-vintage"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Shop LEI Vintage
 </Link>
 </div>
 </article>
 </main>
 );
}
