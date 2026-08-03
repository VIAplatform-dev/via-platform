import { getEveryonesFavorites } from "@/app/lib/editors-picks-db";
import { inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { categoryMap } from "@/app/lib/categoryMap";
import Link from "next/link";
import EditorsPicksScroller from "./EditorsPicksScroller";

export default async function EditorsPicksSection() {
 const picks = await getEveryonesFavorites(75);

 if (picks.length === 0) return null;

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

 return (
 <section className="bg-[#FFFDF8] pt-16 pb-20 sm:pt-24 sm:pb-28 overflow-hidden">
 <div className="max-w-7xl mx-auto">
 <div className="px-6 mb-8 sm:mb-10">
 <div className="flex items-end justify-between gap-4 border-b border-[#5D0F17]/10 pb-4 sm:pb-5">
 <div>
 <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-[#5D0F17]/45 mb-1.5 sm:mb-2 font-sans">Curated by the Community</p>
 <h2 className="text-[26px] sm:text-[34px] md:text-[40px] font-serif text-[#5D0F17] leading-none tracking-[-0.01em]">Everyone&apos;s Favorites</h2>
 </div>
 <Link
 href="/editors-picks"
 className="group inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-[#5D0F17]/55 hover:text-[#5D0F17] transition-colors font-sans whitespace-nowrap flex-shrink-0 pb-1"
 >
 View All <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
 </Link>
 </div>
 </div>
 </div>

 <EditorsPicksScroller picks={scrollerPicks} />
 </section>
 );
}
