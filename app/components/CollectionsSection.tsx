import { getAllCollectionPicks } from "@/app/lib/editors-picks-db";
import { COLLECTIONS } from "@/app/lib/editors-picks-db";
import { inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { categoryMap } from "@/app/lib/categoryMap";
import Link from "next/link";
import EditorsPicksScroller from "./EditorsPicksScroller";

export default async function CollectionsSection() {
 const allPicks = await getAllCollectionPicks();

 // Homepage only shows Editor's Picks
 const visibleCollections = COLLECTIONS.filter(
 (col) => col.slug === "editors-picks" && (allPicks[col.slug]?.length ?? 0) > 0
 );

 if (visibleCollections.length === 0) return null;

 return (
 <>
 {visibleCollections.map((col, i) => {
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
 <section
 key={col.slug}
 className={`bg-[#FFFDF8] pt-16 pb-20 sm:pt-24 sm:pb-28 ${i === 0 ? "" : ""}`}
 >
 <div className="max-w-7xl mx-auto">
 <div className="px-6 mb-8 sm:mb-12">
 <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
 <div>
 <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif text-[#5D0F17]">{col.name}</h2>
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
 );
}
