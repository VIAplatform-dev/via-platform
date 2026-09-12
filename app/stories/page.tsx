import Link from "next/link";
import Image from "next/image";

export const metadata = {
 title: "The Story Behind the Selection | VYA",
 description:
 "Why we chose each store on VYA. Read the stories behind the independent vintage and secondhand sellers we partner with.",
};

const stories = [
 {
 slug: "lei-vintage",
 store: "LEI Vintage",
 teaser:
 "Some brands start with a new collection. LEI started with a realization.",
 logo: "/stores/lei-vintage-logo.jpg",
 logoBg: "#ffffff",
 logoFit: "contain" as const,
 logoZoom: 1.8,
 },
 {
 slug: "vintage-archives-la",
 store: "Vintage Archives LA",
 teaser:
 "Dedicated to the art of curation, specializing in exceptional vintage designer shoes that feel as special as they are timeless.",
 logo: "/stores/vintage-archives-la-logo.jpg",
 logoBg: "#fdf8d8",
 logoFit: "cover" as const,
 },
 {
 slug: "ascensio-vintage",
 store: "Ascensio Vintage",
 teaser:
 "Championing timeless style that transcends the decades: authentic, high-quality vintage designer clothes sourced with intention.",
 logo: "/stores/ascensio-vintage-logo.jpg",
 logoBg: "#ffffff",
 logoFit: "contain" as const,
 },
 {
 slug: "scarz-vintage",
 store: "Scarz Vintage",
 teaser:
 "Luxury fashion doesn't expire; it evolves. Curated vintage at its best: thoughtful, refined, and intentional.",
 logo: "/stores/scarz-vintage-logo.jpg",
 logoBg: "#ffffff",
 logoFit: "contain" as const,
 logoZoom: 1.8,
 },
 {
 slug: "missi-archives",
 store: "Missi Archives",
 teaser:
 "Designer secondhand with depth. Luxury resale with longevity. Curated vintage that feels modern.",
 logo: "/stores/missi-archives-logo.jpg",
 logoBg: "#722f37",
 logoFit: "cover" as const,
 },
 {
 slug: "blodas-choice",
 store: "Bloda's Choice",
 teaser:
 "A creative platform built around the vision of photographer and founder Anna Bloda: vintage fashion, original design, and a singular point of view.",
 logo: "/stores/blodas-choice-logo.png",
 logoBg: "#ffffff",
 logoFit: "contain" as const,
 },
 {
 slug: "source-twenty-four",
 store: "Source Twenty Four",
 teaser:
 "Founded by a mother–daughter duo in New Jersey, built on the idea that the best fashion already has a story.",
 logo: "/stores/source-twenty-four.jpg",
 logoBg: "#ffffff",
 logoFit: "cover" as const,
 },
 {
 slug: "lover-girl-vintage",
 store: "Lovergirl Vintage",
 teaser:
 "A curated vintage denim & blazer destination. Every piece handpicked by Lexi for quality, fit, and everyday wearability.",
 logo: "/stores/lover-girl-vintage-logo.jpg",
 logoBg: "#F2EDE6",
 logoFit: "contain" as const,
 logoZoom: 3,
 },
 {
 slug: "the-objects-of-affection",
 store: "The Objects of Affection",
 teaser:
 "A collector's archive of vintage heels, handbags, and rare designer finds, chosen for history, craftsmanship, and lasting value.",
 logo: "/stores/the-objects-of-affection-brand.jpg",
 logoBg: "#8B2257",
 logoFit: "cover" as const,
 },
];

export default function StoriesPage() {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* Header */}
 <section className="">
 <div className="max-w-7xl mx-auto px-6 pt-8 pb-4 sm:pt-10 sm:pb-6">
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">Stories</h1>
 <p className="max-w-2xl text-[#5D0F17]/60 text-sm sm:text-base">
 Every store on VYA has a story worth telling. Here&apos;s why we selected
 each one.
 </p>
 </div>
 </section>

 {/* Stories grid */}
 <section className="py-6 sm:py-8">
 <div className="max-w-5xl mx-auto px-6">
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10 sm:gap-12">
 {stories.map((story) => (
 <Link
 key={story.slug}
 href={`/stories/${story.slug}`}
 className="group block text-center"
 >
 <div
 className="relative w-48 h-24 sm:w-56 sm:h-28 mx-auto mb-5 overflow-hidden"
 style={{ backgroundColor: story.logoBg ?? "#ffffff" }}
 >
 <Image
 src={story.logo}
 alt={story.store}
 fill
 sizes="224px"
 className={story.logoFit === "cover" ? "object-cover" : "object-contain p-4"}
 style={"logoZoom" in story ? { transform: `scale(${story.logoZoom})` } : undefined}
 />
 </div>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed mb-3">
 {story.teaser}
 </p>
 <span className="inline-block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 group-hover:text-[#5D0F17] transition">
 Read Story &rarr;
 </span>
 </Link>
 ))}
 </div>
 </div>
 </section>
 </main>
 );
}
