import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
 title: "Trust & Authenticity | VYA",
 description:
 "Every store on VYA is hand-vetted for authenticity, quality, and values. Learn how we verify sellers and protect buyers.",
};

const STEPS = [
 {
 number: "01",
 title: "Every store owner is vetted personally",
 body: "Before any store joins VYA, we have a direct conversation with the founder. We learn who they are, how they source, and why they do this, because the people behind the pieces matter as much as the pieces themselves.",
 },
 {
 number: "02",
 title: "We review their authentication process",
 body: "We ask every store how they verify authenticity, whether that's in-house inspection, third-party authenticators like Entrupy or CheckCheck, Certificates of Authenticity, or a combination. Stores that can't speak to their process don't make the cut.",
 },
 {
 number: "03",
 title: "We check their track record",
 body: "We look at their history: how long they've been selling, how they handle disputes, and what their customers say. We only partner with sellers who have demonstrated consistency and care.",
 },
 {
 number: "04",
 title: "Ongoing accountability",
 body: "Being on VYA isn't a one-time approval. We stay in touch with every store, monitor feedback, and remove anyone who doesn't uphold our standards, no exceptions.",
 },
];

const PILLARS = [
 {
 title: "Hand-Picked Sellers",
 body: "We don't accept every store that applies. Every seller on VYA is individually reviewed. We look at their inventory, sourcing practices, and track record before extending an invitation to the platform.",
 },
 {
 title: "Authentic Vintage & Secondhand",
 body: "Each store specialises in genuine pre-owned and vintage pieces. We do not work with stores that sell mass-produced fast fashion or replicas. If something doesn't meet that bar, it doesn't make it onto VYA.",
 },
 {
 title: "Transparent Pricing",
 body: "Prices shown are the real price. When a store runs a markdown we show the original price crossed out so you always know what you're paying and why.",
 },
 {
 title: "Vetted Descriptions",
 body: "Condition, measurements, and provenance notes are pulled directly from each store's own listings. We surface that information on every product page so you can shop with confidence.",
 },
 {
 title: "Community-Backed",
 body: "The Everyone's Favorites section is ranked purely by what our community has hearted most. No paid placement, no algorithm manipulation, just the pieces real people love.",
 },
 {
 title: "Always Evolving",
 body: "Our verification standards grow as VYA grows. We regularly re-review sellers and retire listings that no longer meet our quality bar. If you ever spot something that feels off, reach out. We take every report seriously.",
 },
];

export default function TrustPage() {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">

 {/* ── Hero ── */}
 <section className="">
 <div className="max-w-4xl mx-auto px-6 py-12 sm:py-20">
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">
 Every store on VYA is trusted and verified.
 </h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 We don&apos;t list stores we haven&apos;t spoken to. Every seller on VYA has been personally
 vetted, their sourcing, their authentication process, and their track record.
 </p>
 </div>
 </section>

 {/* ── VYA Verified badge explained ── */}
 <section className="">
 <div className="max-w-4xl mx-auto px-6 py-16 sm:py-24">
 <div className="flex items-center gap-2 mb-4">
 <span className="w-5 h-5 rounded-full bg-[#5D0F17] flex items-center justify-center flex-shrink-0">
 <svg viewBox="0 0 10 10" className="w-3 h-3" fill="none" stroke="#FFFDF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <polyline points="2,5.2 4.2,7.5 8,3" />
 </svg>
 </span>
 <h2 className="font-serif text-2xl sm:text-3xl">The VYA Verified badge</h2>
 </div>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-xl leading-relaxed mb-10">
 You&apos;ll see this badge on every store page. It means we&apos;ve done the work,
 so you don&apos;t have to wonder.
 </p>

 <div className="grid sm:grid-cols-2 gap-x-12 gap-y-10">
 {PILLARS.map((pillar) => (
 <div key={pillar.title}>
 <h3 className="text-sm font-semibold mb-2 tracking-wide">{pillar.title}</h3>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed">{pillar.body}</p>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* ── How we vet ── */}
 <section className="">
 <div className="max-w-4xl mx-auto px-6 py-16 sm:py-24">
 <h2 className="font-serif text-2xl sm:text-3xl mb-12">How we vet every store</h2>
 <div className="space-y-12">
 {STEPS.map((step) => (
 <div key={step.number} className="flex gap-8 sm:gap-12">
 <span className="font-serif text-3xl text-[#5D0F17]/20 flex-shrink-0 w-10 leading-none pt-1">
 {step.number}
 </span>
 <div>
 <h3 className="font-serif text-xl mb-3">{step.title}</h3>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed">{step.body}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* ── What this means for you ── */}
 <section className="">
 <div className="max-w-4xl mx-auto px-6 py-16 sm:py-24">
 <h2 className="font-serif text-2xl sm:text-3xl mb-8">What this means for you</h2>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
 <div>
 <p className="font-serif text-lg mb-2">Shop with confidence</p>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed">
 Every store on VYA has been screened. You&apos;re not rolling the dice on a random
 seller, you&apos;re buying from someone we know and trust.
 </p>
 </div>
 <div>
 <p className="font-serif text-lg mb-2">Transparent policies</p>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed">
 Each store&apos;s authentication approach is listed on their store page, so you can
 see exactly how your item was verified before it ever reached you.
 </p>
 </div>
 <div>
 <p className="font-serif text-lg mb-2">Real accountability</p>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed">
 If a store falls short of our standards, they come off the platform. Our reputation
 depends on theirs.
 </p>
 </div>
 </div>
 </div>
 </section>

 {/* ── CTAs ── */}
 <section>
 <div className="max-w-4xl mx-auto px-6 py-16 sm:py-24 flex flex-col sm:flex-row gap-4">
 <Link
 href="/stores"
 className="inline-block px-8 py-3 bg-[#5D0F17] text-[#FFFDF8] text-sm uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition text-center"
 >
 Browse All Stores
 </Link>
 <Link
 href="/browse"
 className="inline-block px-8 py-3 border border-[#5D0F17] text-[#5D0F17] text-sm uppercase tracking-[0.15em] hover:bg-[#5D0F17]/5 transition text-center"
 >
 Shop All Products
 </Link>
 </div>
 </section>

 </main>
 );
}
