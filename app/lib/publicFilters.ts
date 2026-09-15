// Shared filter logic for /api/public/* product list endpoints.
import { brands, WHOLE_WORD_ALIASES } from "./brandData";

const BRAND_BY_SLUG = new Map(brands.map((b) => [b.slug, b]));

function escapeRe(s: string): string {
 return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Postgres ~* (case-insensitive regex) patterns for selected designer slugs. Short
// keywords (≤3) AND whole-word aliases (etro/boss/coach… substrings of common
// words) get \y boundaries so they never match inside a word ("etro" must not hit
// "retro"); other keywords match as substrings so plurals still work. Kept in sync
// with resolveBrand / detectBrand / inferBrandFromTitle via WHOLE_WORD_ALIASES.
// Used as: title ~* ANY(${designerPatterns(...)}::text[]).
export function designerPatterns(designerSlugs: string[]): string[] {
 const pats: string[] = [];
 for (const slug of designerSlugs) {
 const b = BRAND_BY_SLUG.get(slug);
 if (!b) continue;
 for (const kw of b.keywords) {
  const wholeWord = kw.length <= 3 || WHOLE_WORD_ALIASES.has(kw);
  pats.push(wholeWord ? `\\y${escapeRe(kw)}\\y` : escapeRe(kw));
 }
 }
 return pats;
}

// Size matching ignores the regional prefix so a filter of "8" matches "US 8",
// "EU 8", "UK 8", "8", etc. we group by the bare size value. The SQL side strips
// the same prefix from the stored size (see SIZE_CORE_SQL).
export function stripSizePrefix(s: string): string {
 return s.trim().toUpperCase().replace(/^(US|UK|EU|IT|FR|DE)\s*/, "").trim();
}

export type PublicFilters = {
 sizes: string[];      // e.g. ["S", "M", "38"]
 categories: string[]; // e.g. ["clothing", "shoes"]
 stores: string[];     // store slugs
 designers: string[];  // brand slugs, e.g. ["chanel", "gucci"]
 priceMin: number | null;
 priceMax: number | null;
 sort: "newest" | "priceAsc" | "priceDesc" | "popular";
};

export function parseFilters(searchParams: URLSearchParams): PublicFilters {
 const csv = (key: string) =>
 (searchParams.get(key) ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

 const num = (key: string) => {
 const v = searchParams.get(key);
 if (!v) return null;
 const n = parseFloat(v);
 return Number.isFinite(n) ? n : null;
 };

 const rawSort = searchParams.get("sort") ?? "newest";
 const sort: PublicFilters["sort"] =
 rawSort === "priceAsc" || rawSort === "priceDesc" || rawSort === "popular" ? rawSort : "newest";

 return {
 sizes: csv("sizes"),
 categories: csv("categories"),
 stores: csv("stores"),
 designers: csv("designers"),
 priceMin: num("priceMin"),
 priceMax: num("priceMax"),
 sort,
 };
}

// Category → title keyword patterns (case-insensitive).
// Mirrors the spirit of inferCategoryFromTitle but works as SQL ILIKE OR groups.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
 clothing: [
 "dress", "top", "shirt", "blouse", "skirt", "pants", "jeans", "trousers",
 "jacket", "coat", "sweater", "cardigan", "vest", "jumpsuit", "romper",
 "blazer", "hoodie", "tee", "t-shirt", "tshirt", "polo", "tank", "shorts",
 "leggings", "set", "suit",
 ],
 bags: [
 "bag", "purse", "clutch", "tote", "backpack", "pouch", "handbag",
 "satchel", "hobo", "duffle", "wallet on chain",
 // Designer styles named without the word "bag"
 "flap", "woc", "puzzle", "matelasse", "matelassé", "birkin", "constance", "speedy", "pochette",
 "boy bag", "capucines", "lady dior", "neverfull", "marmont", "dionysus",
 "peekaboo", "evelyne", "picotin", "lindy", "bolide",
 ],
 shoes: [
 "shoe", "boot", "heel", "sandal", "sneaker", "mule", "loafer", "flat",
 "pump", "slingback", "espadrille", "wedge", "oxford", "stiletto",
 "trainer", "slipper", "clog",
 ],
 accessories: [
 "belt", "scarf", "hat", "jewelry", "earring", "necklace", "bracelet",
 "ring", "sunglasses", "glasses", "tie", "watch", "headband",
 // Brooches/charms + small leather goods (wallets/SLGs live here, not bags,
 // "wallet on chain" is the exception and is matched under bags above)
 "brooch", "charm", "pendant", "choker", "bangle", "cufflink",
 "key holder", "key case", "key ring", "key chain", "card holder", "cardholder",
 "wallet", "coin purse",
 ],
 home: [
 "vase", "lamp", "mug", "cup", "bowl", "plate", "tray", "candle",
 "pillow", "blanket", "throw", "frame", "art print",
 ],
};

export function categoryClauseSql(categories: string[]): {
 sql: string;
 params: string[];
} | null {
 if (categories.length === 0) return null;
 const keywords = categories.flatMap((c) => CATEGORY_KEYWORDS[c] ?? []);
 if (keywords.length === 0) return null;
 const params = keywords.map((kw) => `%${kw}%`);
 const placeholders = params.map((_, i) => `$${i + 1}`).join(" OR title ILIKE ");
 return {
 sql: `(title ILIKE ${placeholders})`,
 params,
 };
}

// Returns the keyword list for a set of categories. Used when we do JS-side
// post-filtering (because neon serverless doesn't easily support dynamic OR lists).
export function categoryKeywords(categories: string[]): string[] {
 return categories.flatMap((c) => CATEGORY_KEYWORDS[c] ?? []);
}

// Best-guess broad category slug (clothing/bags/shoes/accessories/home) for a
// product title. Specific categories are checked before clothing so a "belt bag"
// resolves to bags, not clothing. Returns null when nothing matches.
export function inferBroadCategory(title: string): string | null {
 const t = title.toLowerCase();
 for (const slug of ["bags", "shoes", "accessories", "home", "clothing"]) {
 const kws = CATEGORY_KEYWORDS[slug] ?? [];
 if (kws.some((kw) => t.includes(kw))) return slug;
 }
 return null;
}

// Applies in-memory filtering for fields that are hard to express in SQL with
// neon's tagged-template API (categories, size-list).
//
// `overrideMap` (keyed `${storeSlug}-${id}`, from getCategoryOverrideMap) makes
// category filtering reflect AI/manual corrections: a product with an override is
// matched ONLY against its corrected family; everything else falls back to the
// title-keyword match. Omitting the map preserves the original behavior exactly.
export function applyJsFilters<T extends { name: string; id?: number | string; storeSlug?: string }>(
 products: T[],
 filters: PublicFilters,
 overrideMap?: Map<string, string>,
): T[] {
 let out = products;

 if (filters.categories.length > 0) {
 const lowerKws = categoryKeywords(filters.categories).map((k) => k.toLowerCase());
 out = out.filter((p) => {
  // Corrected category wins, when we have one for this product.
  if (overrideMap && p.id != null && p.storeSlug) {
  const ov = overrideMap.get(`${p.storeSlug}-${p.id}`);
  if (ov) return filters.categories.includes(ov);
  }
  if (lowerKws.length === 0) return true;
  const t = p.name.toLowerCase();
  return lowerKws.some((kw) => t.includes(kw));
 });
 }

 return out;
}
