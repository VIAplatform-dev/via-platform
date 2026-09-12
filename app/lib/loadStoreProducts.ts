import type { StoreProduct } from "./types";
import type { CategorySlug } from "@/app/lib/categoryMap";
import { getProductsByStore, type DBProduct } from "./db";
import { brands as brandDefs } from "./brandData";
import { deriveDisplaySize } from "./inventory";
import { getCategoryOverrideMap } from "./category-overrides-db";

// The taxonomy moved to categorize-core.ts so it can be unit-tested and shared with
// inventory.ts. Re-exported here because plenty of callers import it from this module.
import { inferCategoryFromTitle, categoryFor } from "./categorize-core.ts";
export { inferCategoryFromTitle };

export const inferItemTypeFromTitle = (title: string): string | null => {
 const t = title.toLowerCase();
 const types = [
 // Shoes — checked before generic clothing words
 "ballet flat", "ballet flats", "ballerina flat",
 "loafer", "mule", "clog", "slingback", "mary jane", "moccasin",
 "boot", "bootie", "heel", "pump", "sandal", "sneaker", "trainer",
 "espadrille", "wedge", "oxford", "derby", "brogue", "slide",
 "flat", // generic flat (after "ballet flat")
 // Bags
 "clutch", "tote", "handbag", "crossbody", "satchel", "baguette",
 "bucket bag", "shoulder bag",
 "bag",
 // Clothing
 "jacket", "coat", "blazer", "trench", "puffer", "bomber",
 "dress", "gown",
 "skirt",
 "shorts",
 "jumpsuit", "romper",
 "pants", "trousers", "jeans",
 "blouse", "shirt", "top", "tee",
 "sweater", "cardigan", "knit",
 "vest", "suit",
 "cape", "poncho",
 "scarf", "belt",
 ];
 for (const type of types) {
 if (t.includes(type)) return type;
 }
 return null;
};

export const inferColorFromTitle = (title: string): string | null => {
 const t = title.toLowerCase();
 const colors = [
 "multicolor", "burgundy", "maroon", "navy", "cream", "beige",
 "ivory", "coral", "teal", "khaki", "camel", "olive", "silver",
 "gold", "orange", "yellow", "purple", "brown", "green", "pink",
 "grey", "gray", "black", "white", "red", "blue", "tan",
 ];
 for (const color of colors) {
 if (t.includes(color)) return color;
 }
 return null;
};

export const inferBrandFromTitle = (title: string): string | null => {
 const t = title.toLowerCase();
 for (const brand of brandDefs) {
 for (const keyword of brand.keywords) {
 const matches =
 keyword.length <= 3
 ? new RegExp(`(?<![a-z])${keyword}(?![a-z])`).test(t)
 : t.includes(keyword);
 if (matches) return brand.slug;
 }
 }
 return null;
};

/**
 * Like inferBrandFromTitle but returns the first matched keyword string
 * (e.g. "dolce & gabbana", "chanel") — suitable for SQL ILIKE searches.
 */
export const inferBrandKeywordFromTitle = (title: string): string | null => {
 const t = title.toLowerCase();
 for (const brand of brandDefs) {
 for (const keyword of brand.keywords) {
 const matches =
 keyword.length <= 3
 ? new RegExp(`(?<![a-z])${keyword}(?![a-z])`).test(t)
 : t.includes(keyword);
 if (matches) return keyword;
 }
 }
 return null;
};

/**
 * Returns the primary item-type keyword to use for SQL ILIKE title search.
 * Normalizes compound types to their most searchable single word.
 */
export const inferItemTypeKeyword = (title: string): string | null => {
 const type = inferItemTypeFromTitle(title);
 if (!type) return null;
 // Normalize compound types to the most distinctive word
 const normMap: Record<string, string> = {
 "ballet flat": "ballet flat",
 "ballet flats": "ballet flat",
 "ballerina flat": "ballet flat",
 "bucket bag": "bucket bag",
 "shoulder bag": "shoulder bag",
 };
 return normMap[type] ?? type.split(" ")[0]; // first word is usually searchable
};

// Parse images JSON from DB, falling back to single image
function parseImages(product: DBProduct): string[] {
 if (product.images) {
 try {
 const parsed = JSON.parse(product.images);
 if (Array.isArray(parsed) && parsed.length > 0) return parsed;
 } catch {}
 }
 return product.image ? [product.image] : [];
}

// Transform database product to StoreProduct format
function transformDBProduct(product: DBProduct, overrideMap?: Map<string, string>): StoreProduct {
 const priceString = `$${Math.round(Number(product.price))}`;
 // An AI/admin category override wins over the title inference.
 const category = categoryFor(product.title, overrideMap?.get(`${product.store_slug}-${product.id}`));

 return {
 id: `${product.store_slug}-${product.id}`,
 name: product.title,
 price: priceString,
 currency: product.currency || "USD",
 category,
 storeSlug: product.store_slug,
 externalUrl: product.external_url ?? undefined,
 image: product.image ?? undefined,
 images: parseImages(product),
 imageColor: product.image_color ?? null,
 size: deriveDisplaySize(product),
 syncedAt: product.synced_at instanceof Date
 ? product.synced_at.toISOString()
 : String(product.synced_at),
 createdAt: product.created_at instanceof Date
 ? product.created_at.toISOString()
 : product.created_at
 ? String(product.created_at)
 : undefined,
 };
}

/**
 * Load products for a specific store from the database
 */
export async function loadStoreProducts(storeSlug: string): Promise<StoreProduct[]> {
 try {
 const products = await getProductsByStore(storeSlug);
 const overrideMap = await getCategoryOverrideMap().catch(() => new Map<string, string>());
 return products.map((p) => transformDBProduct(p, overrideMap));
 } catch (error) {
 console.error(`Failed to load products for store ${storeSlug}:`, error);
 return [];
 }
}
