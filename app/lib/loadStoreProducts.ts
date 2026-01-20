import leiVintageProducts from "@/app/data/lei-vintage.json";
import { products as staticProducts } from "@/app/stores/productData";
import { StoreProduct } from "./types";

export function loadStoreProducts(storeSlug: string): StoreProduct[] {
  // LEI → external Squarespace data
  if (storeSlug === "lei-vintage") {
    return leiVintageProducts.map((p: any): StoreProduct => ({
      id: p.title,
      name: p.title,
      price: `$${p.price}`,
      category: "Vintage",
      storeSlug: "lei-vintage",
      externalUrl: p.productUrl,
      image: p.image, // ✅ always exists for LEI
    }));
  }

  // All other stores → static internal data
  return staticProducts
    .filter((p) => p.storeSlug === storeSlug)
    .map((p): StoreProduct => ({
      id: p.id,
      name: p.name,
      price: `$${p.price}`,
      category: p.category,
      storeSlug: p.storeSlug,
      image: undefined, // ✅ explicitly undefined
    }));
}
