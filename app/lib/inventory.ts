import type { CategorySlug } from "./categoryMap";
import { getAllProducts, type DBProduct } from "./db";

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

// Transform database products to InventoryItem format
function transformDBProduct(product: DBProduct, idx: number): InventoryItem {
  return {
    id: `${product.store_slug}-${product.id}`,
    title: product.title,
    category: inferCategoryFromTitle(product.title),
    price: Number(product.price),
    image: product.image ?? "/placeholder.jpg",
    store: product.store_name,
    storeSlug: product.store_slug,
    externalUrl: product.external_url ?? undefined,
  };
}

/**
 * Fetch all inventory from the database
 */
export async function getInventory(): Promise<InventoryItem[]> {
  try {
    const products = await getAllProducts();
    return products.map(transformDBProduct);
  } catch (error) {
    console.error("Failed to fetch inventory from database:", error);
    return [];
  }
}

// Legacy export for backwards compatibility (returns empty array, use getInventory() instead)
export const inventory: InventoryItem[] = [];
