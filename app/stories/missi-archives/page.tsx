import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "Missi Archives: The Story Behind the Selection | VYA",
 description:
 "Why we chose Missi Archives for VYA. Designer secondhand with depth. Luxury resale with longevity.",
};

export default function MissiArchivesStory() {
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
 src="/stores/missi-archives.jpg"
 alt="Missi Archives"
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
 Missi Archives
 </h1>

 <div className="prose prose-lg max-w-none text-[#5D0F17]/70 leading-relaxed space-y-6">
 <p>
 Missi Archives is a carefully curated vintage and designer resale store
 rooted in timeless fashion and archival luxury. Every piece feels selected,
 not stocked. There&apos;s a distinct sense of intention behind the edit,
 from structured tailoring to iconic designer silhouettes that have already
 proven their place in fashion history.
 </p>

 <p>
 What drew us to Missi is that she focuses on refined secondhand fashion:
 pieces that hold their value in craftsmanship, design, and wearability.
 </p>

 <p>
 This is what true archival style looks like. Designer secondhand with depth.
 Luxury resale with longevity. Curated vintage that feels modern.
 </p>

 <p className="font-serif text-[#5D0F17] text-xl">
 At VYA, we exist to connect shoppers with the best independent resale stores
 and curated vintage boutiques worldwide. Missi Archives reflects exactly what
 we look for in a partner: authenticity, quality, and a clear perspective on
 fashion that transcends trends.
 </p>
 </div>

 {/* CTA */}
 <div className="mt-12 pt-8">
 <Link
 href="/stores/missi-archives"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Shop Missi Archives
 </Link>
 </div>
 </article>
 </main>
 );
}
