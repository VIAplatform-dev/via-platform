export const revalidate = 1800; // re-render homepage in background every 30 minutes

import Link from "next/link";
import Image from "next/image";
import StoreCarousel from "./components/StoreCarousel";
import NewArrivalsSection from "./components/NewArrivalsSection";
import StylingGuideSection from "./components/StylingGuideSection";
import EditorsPicksSection from "./components/EditorsPicksSection";
import { Suspense } from "react";
import HomepageScrollTracker from "./components/HomepageScrollTracker";
import HeroTypeIn from "./components/HeroTypeIn";

export default function HomePage() {
 return (
 <main className="w-full">
 <HomepageScrollTracker />

 {/* ================= HERO — MOBILE ================= */}
 <div data-section="hero" className="md:hidden">
 <section className="relative overflow-hidden" style={{ height: "85vh" }}>
 <Image
 src="/hero-v10.jpg"
 alt=""
 fill
 priority
 className="object-cover"
 style={{ objectPosition: "center center" }}
 sizes="100vw"
 />
 <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0) 70%)" }} />
 <div className="absolute inset-x-0 top-0 h-40" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)" }} />
 <div className="absolute bottom-48 left-6 right-6 z-10">
 <HeroTypeIn
 phrases={[
 "Access the world's best vintage.",
 "Discover your new favorite pieces.",
 "Meet stores from around the world.",
 ]}
 className="text-3xl font-serif text-[#FFFDF8] mb-6 leading-tight"
 />
 <div className="flex gap-3">
 <Link
 href="/stores"
 className="bg-[#FFFDF8] text-[#5D0F17] px-6 py-3 text-xs uppercase tracking-[0.12em] text-center font-sans flex-1 rounded-lg"
 >
 Explore Stores
 </Link>
 <Link
 href="/categories"
 className="border border-[#FFFDF8] text-[#FFFDF8] px-6 py-3 text-xs uppercase tracking-[0.12em] text-center font-sans flex-1 rounded-lg"
 >
 Shop Now
 </Link>
 </div>
 </div>
 </section>
 </div>

 {/* ================= HERO — DESKTOP ================= */}
 <section
 className="hidden md:block relative overflow-x-hidden"
 style={{ backgroundColor: "#D8C8BC", minHeight: "100vh" }}
 >
 <Image
 src="/hero-v10.jpg"
 alt=""
 fill
 priority
 className="object-cover"
 style={{ objectPosition: "center center" }}
 sizes="100vw"
 />
 <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0) 70%)" }} />
 <div className="absolute inset-x-0 top-0 h-44" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)" }} />
 <div className="absolute bottom-[28%] left-10 z-10 animate-hero">
 <HeroTypeIn
 phrases={[
 "Access the world's best vintage.",
 "Discover your new favorite pieces.",
 "Meet stores from around the world.",
 ]}
 className="text-6xl font-serif mb-8 text-[#FFFDF8] leading-tight max-w-xl"
 />
 <div className="flex gap-4">
 <Link
 href="/stores"
 className="bg-[#FFFDF8] text-[#5D0F17] px-10 py-4 text-sm uppercase tracking-[0.12em] hover:bg-white transition-colors duration-300 text-center font-sans rounded-lg"
 >
 Explore Stores
 </Link>
 <Link
 href="/categories"
 className="border border-[#FFFDF8] text-[#FFFDF8] px-10 py-4 text-sm uppercase tracking-[0.12em] hover:bg-white/10 transition-colors duration-300 text-center font-sans rounded-lg"
 >
 Shop Now
 </Link>
 </div>
 </div>
 </section>

 {/* ================= EVERYONE'S FAVORITES ================= */}
 <div data-section="favorites">
 <Suspense fallback={<div className="bg-[#FFFDF8] py-16 sm:py-24 h-64" />}>
 <EditorsPicksSection />
 </Suspense>

 </div>
 {/* ================= EDITORIAL SPLIT PANELS ================= */}
 <section data-section="collections" className="">
 <div className="flex flex-col sm:flex-row">
 <Link
 href="/collections/summer-edit"
 className="relative group overflow-hidden w-full sm:w-1/2"
 style={{ height: "60vw", minHeight: "320px", maxHeight: "100vh" }}
 >
 <Image
 src="/edit-summer-v2.jpg"
 alt="Summer Edit"
 fill
 sizes="(min-width: 640px) 50vw, 100vw"
 className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
 loading="lazy"
 />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
 <div className="absolute bottom-8 left-8 text-[#FFFDF8]">
 <p className="text-[10px] uppercase tracking-[0.2em] mb-1 font-sans opacity-60">Curated by Sophia Tiago</p>
 <h3 className="text-3xl sm:text-4xl font-serif mb-4 leading-none">Summer Edit</h3>
 <span className="text-xs uppercase tracking-[0.15em] border-b border-[#FFFDF8]/60 pb-0.5 font-sans">
 Discover
 </span>
 </div>
 </Link>

 <Link
 href="/collections/y2k-girls"
 className="relative group overflow-hidden w-full sm:w-1/2"
 style={{ height: "60vw", minHeight: "320px", maxHeight: "100vh" }}
 >
 <Image
 src="/edit-y2k.jpg"
 alt="Y2K Girls"
 fill
 sizes="(min-width: 640px) 50vw, 100vw"
 className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
 loading="lazy"
 />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
 <div className="absolute bottom-8 left-8 text-[#FFFDF8]">
 <p className="text-[10px] uppercase tracking-[0.2em] mb-1 font-sans opacity-60">Pure 2000s energy</p>
 <h3 className="text-3xl sm:text-4xl font-serif mb-4 leading-none">Y2K Girls</h3>
 <span className="text-xs uppercase tracking-[0.15em] border-b border-[#FFFDF8]/60 pb-0.5 font-sans">
 Discover
 </span>
 </div>
 </Link>
 </div>
 </section>

 {/* ================= SHOP BY STORE ================= */}
 <section data-section="stores" className="bg-[#FFFDF8] py-12 sm:py-16">
 <div className="max-w-7xl mx-auto">
 <div className="px-6 mb-8 flex items-end justify-between">
 <div>
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-1 font-sans">Shop by</p>
 <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#5D0F17]">Store</h2>
 </div>
 <Link
 href="/stores"
 className="text-sm uppercase tracking-[0.15em] text-[#5D0F17] hover:text-[#5D0F17]/60 transition-colors min-h-[44px] flex items-center font-sans"
 >
 Shop All
 </Link>
 </div>
 <StoreCarousel />
 </div>
 </section>

 {/* ================= NEW ARRIVALS ================= */}
 <div data-section="new-arrivals">
 <Suspense fallback={<div className="bg-[#FFFDF8] py-16 sm:py-24 h-64" />}>
 <NewArrivalsSection />
 </Suspense>
 </div>

 {/* ================= CATEGORY ================= */}
 <section data-section="categories" className="bg-[#FFFDF8] py-16 sm:py-24">
 <div className="max-w-7xl mx-auto">
 <div className="px-6 mb-10 sm:mb-14 flex items-end justify-between">
 <div>
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-1 font-sans">Shop by</p>
 <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#5D0F17]">Category</h2>
 </div>
 <Link
 href="/categories"
 className="text-sm uppercase tracking-[0.15em] text-[#5D0F17] hover:text-[#5D0F17]/60 transition-colors min-h-[44px] flex items-center font-sans"
 >
 Shop All
 </Link>
 </div>

 <div className="overflow-x-auto sm:overflow-visible pb-4 sm:pb-0 scrollbar-hide touch-pan-x [&_img]:select-none [&_img]:pointer-events-none">
 <div className="flex gap-4 pl-6 pr-6 sm:px-6 sm:grid sm:grid-cols-2 lg:grid-cols-5 md:grid-cols-3 sm:gap-6">
 {[
 { label: "Clothing", slug: "clothing", image: "/categories/clothes.jpg", position: "object-center" },
 { label: "Bags", slug: "bags", image: "/categories/bags-v2.jpg", position: "object-bottom" },
 { label: "Shoes", slug: "shoes", image: "/categories/shoes-v2.jpg", position: "object-center" },
 { label: "Accessories", slug: "accessories", image: "/categories/accessories-v3.jpg", position: "object-center" },
 { label: "Home", slug: "home", image: "/categories/home.jpg", position: "object-center" },
 ].map((category) => (
 <Link
 key={category.slug}
 href={`/categories/${category.slug}`}
 className="group block w-[72vw] flex-shrink-0 sm:w-auto"
 >
 <div className="aspect-[3/4] relative overflow-hidden rounded-xl bg-[#D8CABD]/30">
 <Image
 src={category.image}
 alt={category.label}
 fill
 sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 72vw"
 className={`object-cover ${category.position} transition-transform duration-700 ease-out group-hover:scale-105`}
 loading="lazy"
 />
 <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
 <div className="absolute bottom-6 left-6 text-[#FFFDF8]">
 <h3 className="text-xl sm:text-2xl font-serif leading-none">{category.label}</h3>
 <p className="text-[10px] uppercase tracking-[0.15em] font-sans mt-2 opacity-90">Explore</p>
 </div>
 </div>
 </Link>
 ))}
 </div>
 </div>
 </div>
 </section>

 {/* ================= STYLING GUIDE ================= */}
 <StylingGuideSection />

 </main>
 );
}
