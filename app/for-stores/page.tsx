import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
 title: "For Stores | VYA",
 description: "List your vintage or secondhand store on VYA and reach thousands of shoppers looking for exactly what you sell.",
 openGraph: {
 title: "For Stores | VYA",
 description: "List your vintage or secondhand store on VYA and reach thousands of shoppers looking for exactly what you sell.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
 twitter: {
 card: "summary_large_image",
 title: "For Stores | VYA",
 description: "List your vintage or secondhand store on VYA and reach thousands of shoppers looking for exactly what you sell.",
 images: ["/og-image.png"],
 },
};

export default function ForStoresPage() {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">

 {/* Header */}
 <section className="">
 <div className="max-w-4xl mx-auto px-6 py-12 sm:py-20">
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">Already a Partner?</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 Follow the guide for your platform to connect your store to VYA.
 </p>
 </div>
 </section>

 {/* Setup Guides */}
 <section className="py-12 sm:py-20">
 <div className="max-w-4xl mx-auto px-6">
 <div className="flex flex-col sm:flex-row gap-4 max-w-xl">
 <Link
 href="/for-stores/shopify-setup"
 className="flex-1 border border-[#5D0F17] py-4 text-sm uppercase tracking-wide text-center hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition min-h-[52px] flex items-center justify-center"
 >
 Shopify Setup Guide
 </Link>
 <Link
 href="/for-stores/squarespace-setup"
 className="flex-1 border border-[#5D0F17] py-4 text-sm uppercase tracking-wide text-center hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition min-h-[52px] flex items-center justify-center"
 >
 Squarespace Setup Guide
 </Link>
 </div>

 <div className="mt-20 pt-16">
 <h3 className="text-2xl font-serif mb-3">Not a partner yet?</h3>
 <p className="text-sm text-[#5D0F17]/60 max-w-xl mb-8">
 Apply to list your store on VYA and reach vintage shoppers worldwide.
 </p>
 <Link
 href="/partner-with-vya"
 className="inline-block border border-[#5D0F17] text-[#5D0F17] px-8 py-3 text-sm uppercase tracking-[0.15em] hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition"
 >
 Partner With VYA
 </Link>
 </div>
 </div>
 </section>

 </main>
 );
}
