import type { StoreProduct } from "./types";
import type { CategorySlug } from "@/app/lib/categoryMap";
import { getProductsByStore, type DBProduct } from "./db";

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

// Transform database product to StoreProduct format
function transformDBProduct(product: DBProduct): StoreProduct {
  const priceString = `$${Number(product.price)}`;

  return {
    id: `${product.store_slug}-${product.id}`,
    name: product.title,
    price: priceString,
    category: inferCategoryFromTitle(product.title),
    storeSlug: product.store_slug,
    externalUrl: product.external_url ?? undefined,
    image: product.image ?? undefined,
  };
}

/**
 * Load products for a specific store from the database
 */
export async function loadStoreProducts(storeSlug: string): Promise<StoreProduct[]> {
  try {
    const products = await getProductsByStore(storeSlug);
    return products.map(transformDBProduct);
  } catch (error) {
    console.error(`Failed to load products for store ${storeSlug}:`, error);
    return [];
  }
}
