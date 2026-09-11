import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "Bloda's Choice: The Story Behind the Selection | VYA",
 description:
 "Why we chose Bloda's Choice for VYA. A creative platform built around the vision of photographer and founder Anna Bloda.",
};

export default function BlodasChoiceStory() {
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
 src="/stores/blodas-choice.jpg"
 alt="Bloda's Choice"
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
 Bloda&apos;s Choice
 </h1>

 <div className="prose prose-lg max-w-none text-[#5D0F17]/70 leading-relaxed space-y-6">
 <p>
 Bloda&apos;s Choice is more than a vintage store, it&apos;s a creative platform
 built around the vision of its founder, Anna Bloda. Born in Poland and now
 based in New York City, Anna is a renowned photographer whose creative work
 extends naturally into fashion, styling, and cultural curation. Through
 Bloda&apos;s Choice, she brings together vintage fashion, original design,
 photography, and creative casting into one evolving digital space.
 </p>

 <p>
 One of the most recognizable elements of Bloda&apos;s Choice is its collection
 of Italian leather jackets, vintage leather belts, and statement designer
 pieces. From perfectly worn leather outerwear to incredible designer dresses,
 the pieces capture the confidence and glamour of European luxury fashion.
 </p>

 <p className="font-serif text-[#5D0F17] text-xl">
 At VYA, we aim to highlight independent vintage boutiques that bring something
 unique to the world of designer resale and curated vintage fashion.
 Bloda&apos;s Choice perfectly embodies that spirit, offering a distinctive
 taste shaped by Anna&apos;s singular point of view.
 </p>
 </div>

 {/* CTA */}
 <div className="mt-12 pt-8">
 <Link
 href="/stores/blodas-choice"
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-4 text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition"
 >
 Shop Bloda&apos;s Choice
 </Link>
 </div>
 </article>
 </main>
 );
}
