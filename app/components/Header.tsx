import { getActiveCategories } from "@/app/lib/getActiveCategories";
import { getActiveBrands } from "@/app/lib/getActiveBrands";
import HeaderClient from "@/app/components/HeaderClient";

export default async function Header() {
 const [categories, allBrands] = await Promise.all([
 getActiveCategories().catch(() => []),
 getActiveBrands().catch(() => []),
 ]);

 // Every active designer (those with inventory), sorted by product count.
 // The nav drawer scrolls, so the full list is fine here.
 const topDesigners = allBrands.map((b) => ({ slug: b.slug, label: b.label }));

 return <HeaderClient categories={categories} topDesigners={topDesigners} />;
}
