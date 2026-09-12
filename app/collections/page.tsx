export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getAllCollectionPicks, COLLECTIONS } from "@/app/lib/editors-picks-db";
import { inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { categoryMap } from "@/app/lib/categoryMap";
import Link from "next/link";
import EditorsPicksScroller from "@/app/components/EditorsPicksScroller";

export const metadata: Metadata = {
 title: "Collections | VYA",
 description: "Hand-selected vintage & secondhand pieces from our editors and partners.",
 openGraph: {
 title: "Collections | VYA",
 description: "Hand-selected vintage & secondhand pieces from our editors and partners.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
 twitter: {
 card: "summary_large_image",
 title: "Collections | VYA",
 description: "Hand-selected vintage & secondhand pieces from our editors and partners.",
 images: ["/og-image.png"],
 },
};

export default async function CollectionsPage() {
 const allPicks = await getAllCollectionPicks();
 const visibleCollections = COLLECTIONS.filter((col) => (allPicks[col.slug]?.length ?? 0) > 0);

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <section className="">
 <div className="max-w-7xl mx-auto px-6 pt-8 pb-4 sm:pt-10 sm:pb-6">
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">Collections</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 Hand-selected pieces from our editors and partners.
 </p>
 </div>
 </section>

 {visibleCollections.length === 0 ? (
 <div className="max-w-7xl mx-auto px-6 py-24">
 <p className="text-[#5D0F17]/50 text-sm">No collections yet, check back soon.</p>
 </div>
 ) : (
 <>
 {visibleCollections.map((col) => {
 const picks = allPicks[col.slug] ?? [];
 const scrollerPicks = picks.map((pick) => ({
 pickId: pick.pickId,
 product: {
 id: pick.product.id,
 title: pick.product.title,
 price: pick.product.price,
 currency: pick.product.currency,
 image: pick.product.image ?? "",
 images: pick.product.images ?? "",
 storeSlug: pick.product.storeSlug,
 storeName: pick.product.storeName,
 size: pick.product.size,
 categoryLabel: categoryMap[inferCategoryFromTitle(pick.product.title)],
 compositeId: `${pick.product.storeSlug}-${pick.product.id}`,
 },
 }));

 const viewAllHref = col.slug === "editors-picks" ? "/editors-picks" : `/collections/${col.slug}`;

 return (
 <section key={col.slug} className="pt-16 pb-20 sm:pt-24 sm:pb-28">
 <div className="max-w-7xl mx-auto">
 <div className="px-6 mb-8 sm:mb-12">
 <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
 <div>
 <h2 className="text-3xl sm:text-4xl font-serif text-[#5D0F17]">{col.name}</h2>
 </div>
 <Link
 href={viewAllHref}
 className="text-sm uppercase tracking-[0.15em] text-[#5D0F17] hover:text-[#5D0F17]/60 transition-colors min-h-[44px] flex items-center font-sans"
 >
 View All Picks
 </Link>
 </div>
 </div>
 <EditorsPicksScroller picks={scrollerPicks} />
 </div>
 </section>
 );
 })}
 </>
 )}
 </main>
 );
}
