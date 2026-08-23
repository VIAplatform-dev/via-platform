import { unstable_cache } from "next/cache.js";
import { getInventory } from "@/app/lib/inventory";
import { brandMap } from "@/app/lib/brandData";

type ActiveBrand = {
 slug: string;
 label: string;
 productCount: number;
};

async function _getActiveBrandsUncached(): Promise<ActiveBrand[]> {
 const inventory = await getInventory();

 const counts = new Map<string, number>();
 for (const item of inventory) {
 if (item.brand) {
 counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1);
 }
 }

 return Array.from(counts.entries())
 .filter(([slug]) => brandMap[slug]) // only show known brands
 .map(([slug, count]) => ({
 slug,
 label: brandMap[slug],
 productCount: count,
 }))
 .sort((a, b) => b.productCount - a.productCount);
}

// Cache for 10 minutes — inventory is already cached so this is cheap
export const getActiveBrands = unstable_cache(
 _getActiveBrandsUncached,
 ["active-brands"],
 { revalidate: 600 }
);
