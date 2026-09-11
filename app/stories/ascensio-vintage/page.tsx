import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "Ascensio Vintage: The Story Behind the Selection | VYA",
 description:
 "Why we chose Ascensio Vintage for VYA. Championing timeless style that transcends the decades.",
};

export default function AscensioVintageStory() {
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
 src="/stores/ascensio-vintage.jpg"
 alt="Ascensio Vintage"
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
 Ascensio Vintage
 </h1>

 <div className="prose prose-lg max-w-none text-[#5D0F17]/70 leading-relaxed space-y-6">
 <p>
 Founded by Siann, Ascensio is a curated destination for authentic,
 high-quality vintage designer clothes sourced with intention. Built
 on the belief that style should evolve without costing the earth, the
 brand embraces a simple philosophy: out with the new, in with the old.
 </p>

 <p>
 Each piece is selected for its staying power. Think structured Chanel
 blouses, unmistakable Versace prints, Vivienne Westwood edge, and
 sculptural Miu Miu heels that instantly shift the mood of an outfit.
 These are not fleeting trends. They&apos;re crafted pieces with history,
 ready for their next chapter.
 </p>

 <p>
 Ascensio Vintage champions conscious shopping without sacrificing
 elegance. By elevating premium, pre-loved designer fashion, Siann
 makes sustainability feel refined.
 </p>

 <p className="font-serif text-[#5D0F17] text-xl">
 Exactly the timeless curation that belongs on VYA.
 </p>
 </div>

 {/* CTA */}
 <div className="mt-12 pt-8">
 <Link
 href="/stores/ascensio-vintage"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Shop Ascensio Vintage
 </Link>
 </div>
 </article>
 </main>
 );
}
