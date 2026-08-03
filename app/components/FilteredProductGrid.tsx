"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ProductFilter, {
 FilterState,
 PriceRange,
 SortOption,
} from "./ProductFilter";

const COLOR_KEYWORDS = [
 "black", "white", "cream", "ivory", "beige", "off-white",
 "grey", "gray", "silver", "charcoal",
 "brown", "tan", "camel", "chocolate", "cognac",
 "navy", "blue", "cobalt", "teal", "turquoise",
 "red", "burgundy", "wine", "crimson",
 "pink", "blush", "rose", "fuchsia",
 "green", "olive", "sage", "forest", "emerald", "mint",
 "yellow", "mustard", "gold",
 "orange", "coral", "rust",
 "purple", "lilac", "lavender", "violet",
 "nude", "multicolor",
];

function extractColor(title: string): string | null {
 for (const color of COLOR_KEYWORDS) {
 // Use word boundaries so "red" doesn't match inside "colored", "embroidered", etc.
 const regex = new RegExp(`\\b${color.replace("-", "\\-")}\\b`, "i");
 if (regex.test(title)) {
 return color.charAt(0).toUpperCase() + color.slice(1);
 }
 }
 return null;
}

// The colour we filter/group on. The seller's TITLE is authoritative when it
// names a colour ("tan suede skirt") — that's the item being sold. Vision is
// only a FALLBACK for titles with no colour word (e.g. a black pinstripe skirt),
// because a model often wears other garments that fool a whole-image colour read.
// Capitalized to match extractColor's casing so they merge.
function colorOf(p: { imageColor?: string | null; title: string }): string | null {
 const fromTitle = extractColor(p.title);
 if (fromTitle) return fromTitle;
 if (p.imageColor) return p.imageColor.charAt(0).toUpperCase() + p.imageColor.slice(1);
 return null;
}
import { sortSizes, expandSizeKeys } from "@/app/lib/sizeUtils";
import ProductCard from "./ProductCard";
import { formatPrice } from "@/app/lib/formatPrice";
import type { CategoryLabel } from "@/app/lib/categoryMap";
import { diversityInterleave } from "@/app/lib/productRanking";
import {
 trackFilterChange,
 trackViewItemList,
} from "@/app/lib/firebase-analytics";

export type FilterableProduct = {
 id: string;
 dbId?: number;
 title: string;
 price: number;
 currency?: string;
 compareAtPrice?: number | null;
 category: string;
 categoryLabel: CategoryLabel;
 brand?: string | null;
 brandLabel?: string | null;
 store: string;
 storeSlug: string;
 externalUrl?: string;
 image: string;
 images?: string[];
 imageColor?: string | null; // colour read off the image by vision (normalized)
 createdAt?: number; // timestamp for sorting by newest
 popularityScore?: number;
 size?: string | null;
 accessoryType?: string | null;
 isEditorsPick?: boolean;
 soldOut?: boolean;
 engagementScore?: number;
};

type FilteredProductGridProps = {
 products: FilterableProduct[];
 stores: { slug: string; name: string }[];
 categories?: { slug: string; label: string }[];
 showCategoryFilter?: boolean;
 showBrandFilter?: boolean;
 showSizeFilter?: boolean;
 showTypeFilter?: boolean;
 emptyMessage?: string;
 from?: string;
 initialFilters?: Partial<FilterState>;
};

function matchesPriceRange(price: number, range: PriceRange): boolean {
 switch (range) {
 case "all":
 return true;
 case "under100":
 return price < 100;
 case "100to250":
 return price >= 100 && price < 250;
 case "250to500":
 return price >= 250 && price < 500;
 case "over500":
 return price >= 500;
 default:
 return true;
 }
}

function sortProducts(
 products: FilterableProduct[],
 sort: SortOption
): FilterableProduct[] {
 const sorted = [...products];
 switch (sort) {
 case "popular": {
 // Tier 1: products with real engagement (clicks/favorites) sorted by score
 // Tier 2: zero-engagement products sorted by newest first
 // This prevents quality-signal gaming (brand name + many images) from
 // pushing unclicked products to the top.
 const engaged = sorted.filter((p) => (p.engagementScore ?? 0) > 0);
 const unengaged = sorted.filter((p) => (p.engagementScore ?? 0) === 0);
 engaged.sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0));
 unengaged.sort((a, b) => (b.dbId ?? b.createdAt ?? 0) - (a.dbId ?? a.createdAt ?? 0));
 return diversityInterleave([...engaged, ...unengaged], (p) => p.storeSlug, 2);
 }
 case "price-asc":
 return sorted.sort((a, b) => a.price - b.price);
 case "price-desc":
 return sorted.sort((a, b) => b.price - a.price);
 case "newest":
 default:
 return sorted.sort((a, b) => {
 // Primary: DB id descending — higher id = more recently added to VYA,
 // avoids mixing millisecond timestamps with integer fallbacks.
 if (a.dbId != null && b.dbId != null) return b.dbId - a.dbId;
 // Fallback for products without dbId (e.g. favorites page)
 if (a.createdAt && b.createdAt) return b.createdAt - a.createdAt;
 return (b.dbId ?? 0) - (a.dbId ?? 0);
 });
 }
}

const DEFAULT_FILTERS: FilterState = {
 search: "",
 selectedPrices: [],
 selectedStores: [],
 selectedCategories: [],
 selectedBrands: [],
 selectedSizes: [],
 selectedTypes: [],
 selectedColors: [],
 sort: "popular",
};

function getFilterKey() {
 if (typeof window === "undefined") return "via_filters:/";
 return `via_filters:${window.location.pathname}`;
}

function loadSavedFilters(): FilterState {
 try {
 const saved = sessionStorage.getItem(getFilterKey());
 if (saved) return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
 } catch {}
 return DEFAULT_FILTERS;
}

export default function FilteredProductGrid({
 products,
 stores,
 categories = [],
 showCategoryFilter = false,
 showBrandFilter = false,
 showSizeFilter = false,
 showTypeFilter = false,
 emptyMessage = "No products found.",
 from,
 initialFilters,
}: FilteredProductGridProps) {
 const pathname = usePathname();
 const searchParams = useSearchParams();
 const [filters, setFilters] = useState<FilterState>(() => {
 const saved = loadSavedFilters();
 return initialFilters ? { ...saved, ...initialFilters } : saved;
 });
 const hasTrackedFilterChange = useRef(false);

 // Scroll restoration: save position when leaving, restore when returning
 useEffect(() => {
 if (typeof window === "undefined") return;

 // Prevent browser from auto-scrolling on back navigation (we do it manually)
 if ("scrollRestoration" in history) {
 history.scrollRestoration = "manual";
 }

 const key = `via_scroll:${window.location.pathname}${window.location.search}`;
 const saved = sessionStorage.getItem(key);

 if (saved !== null) {
 const y = parseInt(saved, 10);
 sessionStorage.removeItem(key);
 // Double rAF ensures the page has fully painted before scrolling
 requestAnimationFrame(() => {
 requestAnimationFrame(() => {
 window.scrollTo(0, y);
 });
 });
 }

 return () => {
 // Save position when navigating away (e.g. clicking a product)
 if (window.scrollY > 0) {
 sessionStorage.setItem(key, String(window.scrollY));
 }
 };
 }, []);

 const PAGE_SIZE = 48;
 // Initialize from the URL so back navigation always restores the correct page.
 // Local state (not derived from searchParams) avoids Next.js router-cache resets.
 const [currentPage, setCurrentPageState] = useState<number>(() =>
 Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
 );

 const setCurrentPage = useCallback((page: number) => {
 setCurrentPageState(page);
 // pushState (not replace) so each page is its own history entry — browser
 // Back returns to the previous page instead of the page you entered from.
 // We update the URL directly rather than via the Next.js router, which can
 // serve a stale cached render on back navigation.
 if (typeof window !== "undefined") {
 const params = new URLSearchParams(window.location.search);
 if (page === 1) params.delete("page");
 else params.set("page", String(page));
 const qs = params.toString();
 const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
 const currentPageParam = new URLSearchParams(window.location.search).get("page") ?? "1";
 // Only push when the page actually changes (avoids duplicate entries).
 if (String(page) !== currentPageParam && !(page === 1 && currentPageParam === "1")) {
 window.history.pushState(null, "", url);
 } else {
 window.history.replaceState(null, "", url);
 }
 }
 }, []);

 // Sync the visible page with browser Back/Forward (each page change pushes a
 // history entry above). Reads the page straight from the URL on popstate.
 useEffect(() => {
 const onPop = () => {
 const p = Math.max(1, parseInt(new URLSearchParams(window.location.search).get("page") ?? "1", 10) || 1);
 setCurrentPageState(p);
 };
 window.addEventListener("popstate", onPop);
 return () => window.removeEventListener("popstate", onPop);
 }, []);

 const handleFilterChange = useCallback((newFilters: FilterState) => {
 setFilters(newFilters);
 setCurrentPage(1);
 try {
 sessionStorage.setItem(getFilterKey(), JSON.stringify(newFilters));
 } catch {}
 }, [setCurrentPage]);

 const filteredProducts = useMemo(() => {
 let result = products;

 // Search filter — split query into category-intent words and text words.
 // Category words (e.g. "top", "bag", "shoe") narrow to the inferred category
 // so "black top" returns black tops, not black top-handle bags.
 if (filters.search.trim()) {
 const SEARCH_CATEGORY_MAP: Record<string, string[]> = {
 "tops": ["top", "tops", "shirt", "shirts", "blouse", "blouses", "tee", "tees", "tank", "tanks", "cami"],
 "bags": ["bag", "bags", "clutch", "clutches", "tote", "totes", "purse", "purses", "handbag", "handbags", "pouch"],
 "shoes": ["shoe", "shoes", "heel", "heels", "boot", "boots", "sandal", "sandals", "sneaker", "sneakers", "loafer", "loafers", "pump", "pumps", "flat", "flats", "mule", "mules", "slingback", "stiletto", "stilettos"],
 "dresses": ["dress", "dresses", "gown", "gowns"],
 "pants": ["pant", "pants", "trouser", "trousers", "jean", "jeans", "legging", "leggings"],
 "skirts": ["skirt", "skirts"],
 "accessories": ["accessory", "accessories", "belt", "belts", "scarf", "scarves", "hat", "hats", "watch", "watches", "necklace", "necklaces", "ring", "rings", "earring", "earrings", "bracelet", "bracelets", "jewelry", "jewellery", "sunglasses", "glasses", "brooch"],
 "coats-jackets": ["jacket", "jackets", "coat", "coats", "blazer", "blazers", "trench"],
 "sweaters": ["sweater", "sweaters", "cardigan", "cardigans", "knitwear", "knit"],
 "shorts": ["short", "shorts"],
 "jumpsuits": ["jumpsuit", "jumpsuits", "romper", "rompers"],
 };

 const words = filters.search.trim().toLowerCase().split(/\s+/);
 const categoryWords: string[] = [];
 const textWords: string[] = [];

 for (const word of words) {
 const cat = Object.entries(SEARCH_CATEGORY_MAP).find(([, terms]) => terms.includes(word));
 if (cat) {
 categoryWords.push(cat[0]);
 } else {
 textWords.push(word);
 }
 }

 result = result.filter((p) => {
 const title = p.title.toLowerCase();
 const store = p.store.toLowerCase();
 // All non-category words must appear in title or store name
 const textMatch = textWords.every((w) => title.includes(w) || store.includes(w));
 // If category words were detected, product must be in that category
 const categoryMatch = categoryWords.length === 0 || categoryWords.some((c) => p.category === c || p.category?.startsWith(c));
 return textMatch && categoryMatch;
 });
 }

 // Price range filter
 if (filters.selectedPrices.length > 0) {
 result = result.filter((p) =>
 filters.selectedPrices.some((range) => matchesPriceRange(p.price, range))
 );
 }

 // Category filter
 if (filters.selectedCategories.length > 0) {
 result = result.filter((p) =>
 filters.selectedCategories.includes(p.category)
 );
 }

 // Store filter
 if (filters.selectedStores.length > 0) {
 result = result.filter((p) =>
 filters.selectedStores.includes(p.storeSlug)
 );
 }

 // Brand filter
 if (filters.selectedBrands.length > 0) {
 result = result.filter(
 (p) => p.brand && filters.selectedBrands.includes(p.brand)
 );
 }

 // Size filter — a ranged size ("US 2-4") matches a filter for ANY size it
 // covers, so a piece that fits a 2 or a 4 shows up under both.
 if (filters.selectedSizes.length > 0) {
 result = result.filter((p) => {
 if (!p.size) return false;
 const keys = expandSizeKeys(p.size);
 return keys.some((k) => filters.selectedSizes.includes(k));
 });
 }

 // Type filter (accessories)
 if (filters.selectedTypes.length > 0) {
 result = result.filter(
 (p) => p.accessoryType && filters.selectedTypes.includes(p.accessoryType)
 );
 }

 // Color filter
 if (filters.selectedColors.length > 0) {
 result = result.filter((p) => {
 const color = colorOf(p);
 return color && filters.selectedColors.includes(color);
 });
 }

 // Sort
 result = sortProducts(result, filters.sort);

 return result;
 }, [products, filters]);

 const surface = from ? `${pathname}:${from}` : pathname;

 useEffect(() => {
 trackViewItemList(
 filteredProducts.map((product) => ({
 itemId: product.id,
 itemName: product.title,
 price: product.price,
 category: product.categoryLabel,
 storeName: product.store,
 storeSlug: product.storeSlug,
 size: product.size ?? undefined,
 })),
 {
 listId: surface,
 listName: surface,
 surface,
 }
 );
 }, [filteredProducts, surface]);

 useEffect(() => {
 if (!hasTrackedFilterChange.current) {
 hasTrackedFilterChange.current = true;
 return;
 }

 trackFilterChange({
 surface,
 resultCount: filteredProducts.length,
 search: filters.search,
 selectedPrices: filters.selectedPrices,
 sort: filters.sort,
 selectedStores: filters.selectedStores,
 selectedCategories: filters.selectedCategories,
 selectedBrands: filters.selectedBrands,
 selectedSizes: filters.selectedSizes,
 selectedTypes: filters.selectedTypes,
 selectedColors: filters.selectedColors,
 });
 }, [filteredProducts.length, filters, surface]);

 // Get stores that have products, preserving the chronological order from the stores prop
 const availableStores = useMemo(() => {
 const slugsWithProducts = new Set(products.map((p) => p.storeSlug));
 const filtered = stores.filter((s) => slugsWithProducts.has(s.slug));
 // Fall back to deriving from products if stores prop doesn't cover all slugs
 if (filtered.length === 0) {
 const storeMap = new Map<string, { slug: string; name: string }>();
 products.forEach((p) => {
 if (!storeMap.has(p.storeSlug)) {
 storeMap.set(p.storeSlug, { slug: p.storeSlug, name: p.store });
 }
 });
 return Array.from(storeMap.values());
 }
 return filtered;
 }, [products, stores]);

 // Get unique categories from products for the filter
 const availableCategories = useMemo(() => {
 const catMap = new Map<string, { slug: string; label: string }>();
 products.forEach((p) => {
 if (!catMap.has(p.category)) {
 catMap.set(p.category, { slug: p.category, label: p.categoryLabel });
 }
 });
 return Array.from(catMap.values());
 }, [products]);

 // Get unique brands from products for the filter
 const availableBrands = useMemo(() => {
 const bMap = new Map<string, { slug: string; label: string }>();
 products.forEach((p) => {
 if (p.brand && p.brandLabel && !bMap.has(p.brand)) {
 bMap.set(p.brand, { slug: p.brand, label: p.brandLabel });
 }
 });
 return Array.from(bMap.values());
 }, [products]);

 // Get unique sizes for the filter. Show EVERY real size present — vintage pieces
 // are usually one-of-a-kind, so a "3+ products" threshold would hide most sizes
 // (a single size-4 or US-6 item would never be filterable). Junk values (years,
 // measurements) are excluded by a plausibility check instead of a count gate.
 const availableSizes = useMemo(() => {
 const LETTER_SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL", "XXXL", "One Size"]);
 const isValid = (s: string) =>
 LETTER_SIZES.has(s) || (/^\d{1,2}(\.\d)?$/.test(s) && parseFloat(s) <= 60);
 const seen = new Set<string>();
 products.forEach((p) => {
 if (p.size) {
 // Expand ranges so a "US 2-4" piece offers BOTH 2 and 4 as filter options.
 for (const k of expandSizeKeys(p.size)) if (k) seen.add(k);
 }
 });
 return sortSizes(Array.from(seen).filter(isValid));
 }, [products]);

 // Get unique accessory types from products for the filter
 const availableTypes = useMemo(() => {
 const seen = new Set<string>();
 products.forEach((p) => {
 if (p.accessoryType) seen.add(p.accessoryType);
 });
 return Array.from(seen).sort();
 }, [products]);

 // Unique colours across products — from the image colour (preferred) or title.
 const availableColors = useMemo(() => {
 const seen = new Set<string>();
 products.forEach((p) => {
 const color = colorOf(p);
 if (color) seen.add(color);
 });
 return Array.from(seen).sort();
 }, [products]);

 // Track products whose images all failed to load — remove them from the grid
 const [deadImageIds, setDeadImageIds] = useState<Set<string>>(new Set());
 const handleImageFail = useCallback((id: string) => {
 setDeadImageIds((prev) => new Set([...prev, id]));
 }, []);

 // Fetch favorite counts — only for the current page, after idle
 const [favCounts, setFavCounts] = useState<Record<number, number>>({});

 useEffect(() => {
 const visibleProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
 const dbIds = visibleProducts
 .map((p) => {
 if (p.dbId) return p.dbId;
 const match = p.id.match(/-(\d+)$/);
 return match ? parseInt(match[1], 10) : null;
 })
 .filter((id): id is number => id != null);

 if (dbIds.length === 0) return;

 const run = () => {
 fetch(`/api/favorites/counts?ids=${dbIds.join(",")}`)
 .then((res) => res.json())
 .then((data) => { if (data.counts) setFavCounts((prev) => ({ ...prev, ...data.counts })); })
 .catch(() => {});
 };

 if (typeof requestIdleCallback !== "undefined") {
 const id = requestIdleCallback(run, { timeout: 2000 });
 return () => cancelIdleCallback(id);
 } else {
 const id = setTimeout(run, 500);
 return () => clearTimeout(id);
 }
 }, [filteredProducts, currentPage]);

 return (
 <div>
 <ProductFilter
 stores={availableStores.length > 0 ? availableStores : stores}
 categories={
 availableCategories.length > 0 ? availableCategories : categories
 }
 brands={availableBrands}
 sizes={availableSizes}
 types={availableTypes}
 colors={availableColors}
 showCategoryFilter={showCategoryFilter}
 showBrandFilter={showBrandFilter}
 showSizeFilter={showSizeFilter}
 showTypeFilter={showTypeFilter}
 showColorFilter={availableColors.length > 0}
 onFilterChange={handleFilterChange}
 initialFilters={filters}
 productCount={filteredProducts.length}
 />

 {filteredProducts.length === 0 ? (
 <div className="text-center py-16">
 <p className="text-[#5D0F17]/70 mb-4">{emptyMessage}</p>
 {filters.search ||
 filters.selectedPrices.length > 0 ||
 filters.selectedStores.length > 0 ||
 filters.selectedCategories.length > 0 ||
 filters.selectedBrands.length > 0 ||
 filters.selectedSizes.length > 0 ||
 filters.selectedTypes.length > 0 ||
 filters.selectedColors.length > 0 ? (
 <button
 onClick={() =>
 handleFilterChange({
 search: "",
 selectedPrices: [],
 selectedStores: [],
 selectedCategories: [],
 selectedBrands: [],
 selectedSizes: [],
 selectedTypes: [],
 selectedColors: [],
 sort: filters.sort,
 })
 }
 className="text-sm uppercase tracking-wide underline hover:no-underline"
 >
 Clear filters
 </button>
 ) : null}
 </div>
 ) : (() => {
 const allFiltered = filteredProducts.filter((p) => p.image && !deadImageIds.has(p.id));
 const totalPages = Math.ceil(allFiltered.length / PAGE_SIZE);
 const pageProducts = allFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

 const goToPage = (page: number) => {
 setCurrentPage(page);
 window.scrollTo({ top: 0, behavior: "smooth" });
 };


 return (
 <>
 <div className="w-screen relative left-1/2 -translate-x-1/2">
 <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
 {pageProducts.map((product, i) => (
 <div
 key={product.id}
 className="group"
 style={{ contentVisibility: i >= 12 ? "auto" : undefined, containIntrinsicSize: i >= 12 ? "0 420px" : undefined }}
 >
 <ProductCard
 id={product.id}
 dbId={product.dbId}
 name={product.title}
 price={formatPrice(product.price, product.currency)}
 compareAtPrice={product.compareAtPrice ? formatPrice(product.compareAtPrice, product.currency) : undefined}
 category={product.categoryLabel}
 storeName={product.store}
 storeSlug={product.storeSlug}
 externalUrl={product.externalUrl}
 image={product.image}
 images={product.images}
 size={product.size}
 isEditorsPick={product.isEditorsPick}
 soldOut={product.soldOut}
 from={from}
 onImageFail={() => handleImageFail(product.id)}
 priority={i < 4}
 favoriteCount={
 favCounts[
 product.dbId ??
 (() => {
 const m = product.id.match(/-(\d+)$/);
 return m ? parseInt(m[1], 10) : 0;
 })()
 ]
 }
 />
 </div>
 ))}
 </div>
 </div>

 {totalPages > 1 && (
 <div className="flex items-center justify-center gap-2 mt-10">
 <button
 onClick={() => goToPage(currentPage - 1)}
 disabled={currentPage === 1}
 className="px-4 py-2.5 border border-[#5D0F17]/20 text-[#5D0F17] text-xs uppercase tracking-[0.12em] hover:border-[#5D0F17] transition disabled:opacity-30 disabled:cursor-not-allowed"
 >
 ←
 </button>

 {Array.from({ length: totalPages }, (_, i) => i + 1)
 .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
 .reduce<(number | "…")[]>((acc, p, idx, arr) => {
 if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
 acc.push(p);
 return acc;
 }, [])
 .map((item, idx) =>
 item === "…" ? (
 <span key={`ellipsis-${idx}`} className="px-1 text-[#5D0F17]/30 text-xs">…</span>
 ) : (
 <button
 key={item}
 onClick={() => goToPage(item as number)}
 className={`w-9 h-9 text-xs border transition ${
 currentPage === item
 ? "bg-[#5D0F17] text-[#FFFDF8] border-[#5D0F17]"
 : "border-[#5D0F17]/20 text-[#5D0F17] hover:border-[#5D0F17]"
 }`}
 >
 {item}
 </button>
 )
 )}

 <button
 onClick={() => goToPage(currentPage + 1)}
 disabled={currentPage === totalPages}
 className="px-4 py-2.5 border border-[#5D0F17]/20 text-[#5D0F17] text-xs uppercase tracking-[0.12em] hover:border-[#5D0F17] transition disabled:opacity-30 disabled:cursor-not-allowed"
 >
 →
 </button>
 </div>
 )}
 </>
 );
 })()}
 </div>
 );
}
