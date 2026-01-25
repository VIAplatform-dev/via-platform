import leiVintage from "@/app/data/lei-vintage.json";
import type { CategorySlug } from "./categoryMap";

export type InventoryItem = {
  id: string;
  title: string;
  category: CategorySlug;
  price: number;
  image: string;
  store: string;
  storeSlug: string;
  externalUrl?: string;
};

const inferCategoryFromTitle = (title: string): CategorySlug => {
  const t = title.toLowerCase();

  if (
    t.includes("heel") ||
    t.includes("shoe") ||
    t.includes("boot") ||
    t.includes("pump") ||
    t.includes("sandal") ||
    t.includes("mule") ||
    t.includes("clog") ||
    t.includes("loafer") ||
    t.includes("sneaker")
  ) {
    return "shoes";
  }

  if (
    t.includes("bag") ||
    t.includes("clutch") ||
    t.includes("tote") ||
    t.includes("purse") ||
    t.includes("handbag")
  ) {
    return "bags";
  }

  if (
    t.includes("belt") ||
    t.includes("scarf") ||
    t.includes("hat") ||
    t.includes("sunglasses") ||
    t.includes("jewelry") ||
    t.includes("necklace") ||
    t.includes("bracelet") ||
    t.includes("earring") ||
    t.includes("watch")
  ) {
    return "accessories";
  }

  // Default to clothes for everything else
  return "clothes";
};

// Process LEI Vintage products
const leiProducts: InventoryItem[] = (leiVintage as any[])
  .filter((item) => item.title && item.price !== null && item.price !== undefined)
  .map((item, idx) => ({
    id: `lei-${idx}`,
    title: item.title,
    category: inferCategoryFromTitle(item.title),
    price: Number(item.price),
    image: item.image ?? "/placeholder.jpg",
    store: item.store ?? "LEI Vintage",
    storeSlug: "lei-vintage",
    externalUrl: item.externalUrl,
  }));

// Export inventory (dynamically loads from JSON files in app/data/)
export const inventory: InventoryItem[] = [...leiProducts];
