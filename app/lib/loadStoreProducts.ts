import leiVintageProducts from "@/app/data/lei-vintage.json";
import type { StoreProduct } from "./types";
import type { CategorySlug } from "@/app/lib/categoryMap";
import { products as staticProducts } from "@/app/stores/productData";

// NOTE: This may break for external stores if the shape of the external data changes
// or expected fields (like title, price, productUrl, image) are missing/renamed.
// Also, hardcoding the category as "clothes" and assuming price is present and numeric may break.

export function loadStoreProducts(storeSlug: string): StoreProduct[] {
  // ================= LEI (external Squarespace data) =================
  if (storeSlug === "lei-vintage") {
    return (leiVintageProducts as any[])
      .filter((p) => {
        // Must have title
        if (typeof p.title !== "string" || !p.title.trim()) return false;
        // Must have a valid price (skip items without price)
        if (p.price === null || p.price === undefined) return false;
        return true;
      })
      .map((p, idx): StoreProduct => {
        // Coerce price to a string and ensure $ prefix
        const priceString =
          typeof p.price === "number"
            ? `$${p.price}`
            : String(p.price).startsWith("$")
            ? String(p.price)
            : `$${p.price}`;

        return {
          id: `lei-${idx}`,
          name: p.title,
          price: priceString,
          category: "clothes" as CategorySlug,
          storeSlug: "lei-vintage",
          externalUrl: p.externalUrl || p.productUrl || "",
          image: p.image || undefined,
        };
      });
  }

  // ================= ALL OTHER STORES (including synced JSON files) =================
  return staticProducts
    .filter((p) => p.storeSlug === storeSlug)
    .map((p) => ({
      ...p,
      category: p.category as CategorySlug, // ensure category is a valid CategorySlug
    }));
}
