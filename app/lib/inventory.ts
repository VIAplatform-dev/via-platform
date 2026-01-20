import leiVintage from "@/app/data/lei-vintage.json";
import { categoryMap } from "./categoryMap";
import type { CategorySlug } from "./categories";

export type InventoryItem = {
  id: string;
  title: string;
  category: CategorySlug;
  price: number;
  image: string;
  store: string;
};

export const inventory: InventoryItem[] = (leiVintage as any[])
  .map((item, idx) => {
    const title = item.title?.toLowerCase();

    if (!title) {
      console.warn("Missing title:", item);
      return null;
    }

    // 🔑 infer category from title keywords
    let normalizedCategory: CategorySlug | undefined;

    for (const keyword in categoryMap) {
      if (title.includes(keyword)) {
        normalizedCategory = categoryMap[keyword];
        break;
      }
    }

    if (!normalizedCategory) {
      console.warn("Could not infer category from title:", item.title);
      return null;
    }

    return {
      id: `lei-${idx}`,
      title: item.title,
      category: normalizedCategory,
      price: item.price,
      image: item.image,
      store: item.store,
    };
  })
  .filter(Boolean) as InventoryItem[];
