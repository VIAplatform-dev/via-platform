import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "Vintage Girlfriend: The Story Behind the Selection | VYA",
 description:
 "Why we chose Vintage Girlfriend Luxury for VYA. Anna's mission to make preowned luxury accessible without compromise.",
};

export default function VintageGirlfriendStory() {
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
 src="/stores/vintage-girlfriend.jpg"
 alt="Vintage Girlfriend"
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
 Vintage Girlfriend
 </h1>

 <div className="prose prose-lg max-w-none text-[#5D0F17]/70 leading-relaxed space-y-6">
 <p>
 Anna, a 28-year-old reseller based in Menlo Park, CA, has always loved bougie,
 beautiful things with a story to tell.
 </p>

 <p>
 In a hyper-commercialized world that insists on putting polyester in everything
 we touch and is constantly pushing us to consume, consume, and consume some more,
 it&apos;s comforting just to hold something well-made, something that you could tell
 was made with heart. She wants to bring this feeling to more people, and that&apos;s
 why she started Vintage Girlfriend Luxury.
 </p>

 <p>
 Unlike the big players in the industry that give resellers a bad rap, the store
 upholds authenticity and transparency as the bare minimum so anyone, anywhere,
 can shop preowned luxury without worry.
 </p>

 <p className="font-serif text-[#5D0F17] text-xl">
 At vya, our mission is to make it easier to discover the best independent vintage
 boutiques and designer resale stores in one place. Vintage Girlfriend is exactly
 why vya exists, a founder who genuinely believes in what she sells, and holds
 herself to a standard that makes shopping secondhand feel safe.
 </p>
 </div>

 {/* CTA */}
 <div className="mt-12 pt-8">
 <Link
 href="/stores/vintage-girlfriend"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Shop Vintage Girlfriend
 </Link>
 </div>
 </article>
 </main>
 );
}
