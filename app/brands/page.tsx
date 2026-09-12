export const revalidate = 300;

import type { Metadata } from "next";
import Link from "next/link";
import { getActiveBrands } from "@/app/lib/getActiveBrands";

export const metadata: Metadata = {
 title: "Shop by Brand | VYA",
 description: "Browse vintage and secondhand pieces by designer and brand, all from trusted independent stores.",
 openGraph: {
 title: "Shop by Brand | VYA",
 description: "Browse vintage and secondhand pieces by designer and brand, all from trusted independent stores.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
 twitter: {
 card: "summary_large_image",
 title: "Shop by Brand | VYA",
 description: "Browse vintage and secondhand pieces by designer and brand, all from trusted independent stores.",
 images: ["/og-image.png"],
 },
};

export default async function BrandsPage() {
 const brands = await getActiveBrands();

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* ================= HEADER ================= */}
 <section className="">
 <div className="max-w-7xl mx-auto px-6 py-6 sm:py-10">
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">Shop by Designer</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 Browse vintage and secondhand pieces from the world&apos;s most sought-after designers.
 </p>
 </div>
 </section>

 {/* ================= BRANDS GRID ================= */}
 <section className="py-8 sm:py-12">
 <div className="max-w-7xl mx-auto px-6">
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
 {brands.map((brand) => (
 <Link
 key={brand.slug}
 href={`/brands/${brand.slug}`}
 className="group block border border-[#5D0F17]/20 p-4 sm:p-8 text-center hover:bg-[#5D0F17] hover:border-[#5D0F17] transition-all duration-300"
 >
 <h2 className="font-serif text-lg sm:text-xl text-[#5D0F17] group-hover:text-[#FFFDF8] transition-colors duration-300">
 {brand.label}
 </h2>
 <p className="text-xs text-[#5D0F17]/40 group-hover:text-[#FFFDF8]/60 mt-2 transition-colors duration-300">
 {brand.productCount} {brand.productCount === 1 ? "piece" : "pieces"}
 </p>
 </Link>
 ))}
 </div>
 </div>
 </section>
 </main>
 );
}
