// What a listing can be narrowed by.
//
// These names are not free choices — they are the query params `parseFilters` reads in the web repo
// (app/lib/publicFilters.ts), and every listing endpoint (feed, search, new-arrivals, store) runs
// through it. A key that doesn't match is silently ignored, so the screen would filter nothing and
// look broken rather than error.

export type Sort = "newest" | "priceAsc" | "priceDesc" | "popular";

// Popularity is the default, as on the website: on a marketplace of one-of-one pieces, "newest"
// buries the good things under whatever was listed this morning.
export const DEFAULT_SORT: Sort = "popular";

export type Filters = {
  sizes: string[];
  categories: string[];
  stores: string[];
  priceMin: number | null;
  priceMax: number | null;
  sort: Sort;
};

export const EMPTY_FILTERS: Filters = {
  sizes: [], categories: [], stores: [], priceMin: null, priceMax: null, sort: DEFAULT_SORT,
};

export const SORTS: { value: Sort; label: string }[] = [
  { value: "popular", label: "Most loved" },
  { value: "newest", label: "Newest" },
  { value: "priceAsc", label: "Price: low to high" },
  { value: "priceDesc", label: "Price: high to low" },
];

export const CATEGORY_OPTIONS = ["Clothing", "Shoes", "Bags", "Accessories", "Home"];

/** How many narrowings are active — the number shown on the Filter pill. */
export function activeCount(f: Filters): number {
  return f.sizes.length + f.categories.length + f.stores.length +
    (f.priceMin != null ? 1 : 0) + (f.priceMax != null ? 1 : 0) +
    (f.sort !== DEFAULT_SORT ? 1 : 0);
}

/**
 * Filters → query string.
 *
 * `locked` are the ones the screen itself imposes — a category page is already a category filter —
 * so they are merged in rather than offered for editing. Sort is omitted when it is the default,
 * to keep URLs (and so query cache keys) stable.
 */
export function toQuery(f: Filters, locked: Partial<Record<"categories" | "stores", string[]>> = {}): string {
  const p = new URLSearchParams();
  const csv = (k: string, v: string[]) => { if (v.length) p.set(k, v.join(",")); };

  csv("sizes", f.sizes);
  csv("categories", [...new Set([...(locked.categories ?? []), ...f.categories])]);
  csv("stores", [...new Set([...(locked.stores ?? []), ...f.stores])]);
  if (f.priceMin != null) p.set("priceMin", String(f.priceMin));
  if (f.priceMax != null) p.set("priceMax", String(f.priceMax));
  // Always explicit: the API's own default is "newest", so omitting it would quietly undo this.
  p.set("sort", f.sort);
  return p.toString();
}

/** The shape /api/mobile/saved-searches stores, so a saved view can be replayed later. */
export function toSavedFilters(f: Filters, locked: Partial<Record<"categories" | "stores", string[]>> = {}) {
  return {
    sizes: f.sizes,
    categories: [...new Set([...(locked.categories ?? []), ...f.categories])],
    stores: [...new Set([...(locked.stores ?? []), ...f.stores])],
    priceMin: f.priceMin,
    priceMax: f.priceMax,
  };
}
