import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "The Objects of Affection: The Story Behind the Selection | VYA",
 description:
 "Why we chose The Objects of Affection for VYA. A curated archive of vintage heels, handbags, and rare designer finds.",
};

export default function TheObjectsOfAffectionStory() {
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
 src="/stores/the-objects-of-affection-3.jpg"
 alt="The Objects of Affection"
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
 The Objects of Affection
 </h1>

 {/* Brand image */}
 <div className="w-48 mb-10">
 <Image
 src="/stores/the-objects-of-affection-brand.jpg"
 alt="The Objects of Affection"
 width={400}
 height={400}
 className="w-full object-contain"
 />
 </div>

 <div className="prose prose-lg max-w-none text-[#5D0F17]/70 leading-relaxed space-y-6">
 <p>
 The Objects of Affection is a curated archive of vintage heels, handbags, and rare
 designer finds, centered around pieces that hold both history and lasting value.
 </p>

 <p>
 From iconic Jimmy Choo heels and handbags to standout Fendi shoes, the collection
 reflects a focus on craftsmanship, legacy, and timeless design. When we discovered
 The Objects of Affection, what stood out was its collector mindset, each piece feels
 intentional, rare, and chosen for its place within fashion history rather than
 fleeting trends.
 </p>

 <p className="font-serif text-[#5D0F17] text-xl">
 At vya, we&apos;re drawn to stores like The Objects of Affection that bring a true
 collector&apos;s perspective, making it easy to discover rare designer pieces that
 feel distinctive, intentional, and impossible to replicate.
 </p>
 </div>

 {/* CTA */}
 <div className="mt-12 pt-8">
 <Link
 href="/stores/the-objects-of-affection"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Shop The Objects of Affection
 </Link>
 </div>
 </article>
 </main>
 );
}
