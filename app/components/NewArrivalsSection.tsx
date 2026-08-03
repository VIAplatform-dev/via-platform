import { getNewArrivals } from "@/app/lib/db";
import { inferCategoryFromTitle } from "@/app/lib/loadStoreProducts";
import { categoryMap } from "@/app/lib/categoryMap";
import { deriveSize } from "@/app/lib/inventory";
import ProductCard from "./ProductCard";
import Link from "next/link";
import { formatPrice } from "@/app/lib/formatPrice";

export default async function NewArrivalsSection() {
  const products = await getNewArrivals(12, 7);

  if (products.length === 0) return null;

  return (
    <section id="new-arrivals" className="bg-[#FFFDF8] pt-16 pb-10 sm:pt-24 sm:pb-14 border-t border-[#5D0F17]/10 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="px-6 mb-8 sm:mb-10">
          <div className="flex items-end justify-between gap-4 border-b border-[#5D0F17]/10 pb-4 sm:pb-5">
            <div>
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-[#5D0F17]/45 mb-1.5 sm:mb-2 font-sans">Just Added</p>
              <h2 className="text-[26px] sm:text-[34px] md:text-[40px] font-serif text-[#5D0F17] leading-none tracking-[-0.01em]">New Arrivals</h2>
            </div>
            <Link
              href="/new-arrivals"
              className="group inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-[#5D0F17]/55 hover:text-[#5D0F17] transition-colors font-sans whitespace-nowrap flex-shrink-0 pb-1"
            >
              Shop All <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-4 scrollbar-hide touch-pan-x [&_img]:select-none [&_img]:pointer-events-none">
          <div className="flex gap-3 sm:gap-4 pl-6 pr-6">
            {products.map((product, i) => {
              const categorySlug = inferCategoryFromTitle(product.title);
              const categoryLabel = categoryMap[categorySlug];
              const compositeId = `${product.store_slug}-${product.id}`;
              const images: string[] = product.images
                ? JSON.parse(product.images)
                : [];

              return (
                <div key={product.id} className="w-[40vw] sm:w-[22vw] md:w-[18vw] flex-shrink-0">
                  <ProductCard
                    id={compositeId}
                    dbId={product.id}
                    name={product.title}
                    price={formatPrice(Number(product.price), product.currency)}
                    category={categoryLabel}
                    storeName={product.store_name}
                    storeSlug={product.store_slug}
                    image={product.image || ""}
                    images={images}
                    size={deriveSize(product)}
                    priority={i < 3}
                  />
                </div>
              );
            })}
          </div>
        </div>
    </section>
  );
}
