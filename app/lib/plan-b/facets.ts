// Shopify's storefront FILTER, SORT and PAGE parameters, applied to live VYA inventory.
//
// A Horizon-generation theme doesn't filter in the browser. Clicking a facet or changing the sort
// re-requests the page — through the Section Rendering API (see section-render.ts) — with Shopify's
// parameters appended, and morphs the returned section in:
//
//   /collections/all?filter.p.vendor=Chanel&filter.v.price.lte=50000&sort_by=price-ascending&page=2
//
// We ignored every one of those, so the theme's filter UI moved, refetched, and got back exactly the
// same unfiltered grid. To a shopper that reads as "the filters are broken", which on a one-of-one
// vintage store is worse than having none: the whole point is finding the single piece in their size.
//
// Applied in memory over the items the route already fetched, deliberately: the collection query is
// small (a vintage store's catalogue is hundreds, not millions), and doing it here keeps every
// filtering rule in one pure, testable place instead of spread across SQL builders.
//
// Everything here is pure and unit tested.

/** The subset of an inventory item these rules read. Keeps this module free of the DB types. */
export type FacetItem = {
 title: string;
 priceCents: number | null;
 brand?: string | null;
 category?: string | null;
 era?: string | null;
 condition?: string | null;
 size?: string | null;
 status?: string;
 createdAt?: Date | string | null;
};

/** Shopify's `sort_by` values. `manual` and `best-selling` keep the seller's own order. */
export type SortKey =
 | "manual" | "best-selling"
 | "title-ascending" | "title-descending"
 | "price-ascending" | "price-descending"
 | "created-ascending" | "created-descending";

const SORTS = new Set<string>([
 "manual", "best-selling", "title-ascending", "title-descending",
 "price-ascending", "price-descending", "created-ascending", "created-descending",
]);

export function parseSort(params: URLSearchParams): SortKey {
 const raw = (params.get("sort_by") || "").trim().toLowerCase();
 return (SORTS.has(raw) ? raw : "manual") as SortKey;
}

/**
 * Shopify writes prices in these parameters as WHOLE CURRENCY UNITS, not cents — `filter.v.price.lte=500`
 * means $500. We store cents. Getting this wrong doesn't error, it just silently filters everything
 * out (every item is "over 500 cents"), which is indistinguishable from an empty collection.
 */
function priceBound(params: URLSearchParams, key: string): number | null {
 const raw = params.get(key);
 if (raw == null || raw.trim() === "") return null;
 const n = Number(raw);
 return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Case- and punctuation-insensitive compare, so "Yves Saint Laurent" matches "yves saint laurent". */
function norm(s: unknown): string {
 return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Every value the theme sent for one filter key.
 *
 * Shopify repeats the parameter for a multi-select — `?filter.p.vendor=Chanel&filter.p.vendor=Dior`
 * means "Chanel OR Dior". Reading only the first value turned every multi-select into a single
 * select, so a shopper ticking a second brand watched results *shrink*.
 */
function values(params: URLSearchParams, key: string): string[] {
 return params.getAll(key).map(norm).filter(Boolean);
}

/** One field of an item, matched against a repeated filter parameter (OR within a key). */
function matchesAny(itemValue: unknown, wanted: string[]): boolean {
 if (!wanted.length) return true;
 const v = norm(itemValue);
 return wanted.some((w) => v === w);
}

export type FacetResult<T> = { items: T[]; total: number };

/**
 * Filter, then sort, then paginate — in that order, because a page number means nothing until the
 * result set it indexes into is final.
 *
 * `total` is the count AFTER filtering and BEFORE paging: it's what pagination needs to know how
 * many pages exist, and returning the post-slice length would cap every collection at one page.
 */
export function applyFacets<T extends FacetItem>(
 all: T[],
 params: URLSearchParams,
 opts: { perPage: number; paginate?: boolean },
): FacetResult<T> {
 const vendors = values(params, "filter.p.vendor");
 const types = values(params, "filter.p.product_type");
 const eras = values(params, "filter.p.m.custom.era");
 const conditions = values(params, "filter.p.m.custom.condition");
 // Size is the filter that matters most on one-of-one vintage, and Shopify exposes it as an OPTION
 // filter rather than a product field.
 const sizes = [...values(params, "filter.v.option.size"), ...values(params, "filter.p.m.custom.size")];
 const gte = priceBound(params, "filter.v.price.gte");
 const lte = priceBound(params, "filter.v.price.lte");
 // `filter.v.availability=1` means "in stock only". A sold one-of-one is gone, not restockable.
 const inStockOnly = params.get("filter.v.availability") === "1";

 let out = all.filter((it) => {
  if (!matchesAny(it.brand, vendors)) return false;
  if (!matchesAny(it.category, types)) return false;
  if (!matchesAny(it.era, eras)) return false;
  if (!matchesAny(it.condition, conditions)) return false;
  if (sizes.length && !matchesAny(it.size, sizes)) return false;
  if (inStockOnly && it.status === "sold") return false;
  // An item with no price can't satisfy a price bound, but must survive when none was asked for.
  if (gte != null && (it.priceCents == null || it.priceCents < gte)) return false;
  if (lte != null && (it.priceCents == null || it.priceCents > lte)) return false;
  return true;
 });

 const sort = parseSort(params);
 if (sort !== "manual" && sort !== "best-selling") {
  // Copy before sorting: `all` is the caller's array and may be reused for another grid on the page.
  out = [...out].sort((a, b) => {
   switch (sort) {
    case "title-ascending": return a.title.localeCompare(b.title);
    case "title-descending": return b.title.localeCompare(a.title);
    // A missing price sorts LAST in both directions rather than counting as zero, which would have
    // floated every unpriced piece to the top of "price: low to high".
    case "price-ascending": return nullsLast(a.priceCents, b.priceCents, (x, y) => x - y);
    case "price-descending": return nullsLast(a.priceCents, b.priceCents, (x, y) => y - x);
    case "created-ascending": return time(a.createdAt) - time(b.createdAt);
    case "created-descending": return time(b.createdAt) - time(a.createdAt);
    default: return 0;
   }
  });
 }

 const total = out.length;
 // The captured-page route paginates from the THEME's own page size (whatever the store itself
 // rendered), which this module can't know. `paginate: false` hands it the whole filtered, sorted
 // set and lets it slice. Paginating here as well silently emptied page 2 of every collection.
 if (opts.paginate === false) return { items: out, total };
 const per = Math.max(1, opts.perPage);
 const page = Math.max(1, Number(params.get("page") || "1") || 1);
 return { items: out.slice((page - 1) * per, page * per), total };
}

function nullsLast(a: number | null, b: number | null, cmp: (x: number, y: number) => number): number {
 if (a == null && b == null) return 0;
 if (a == null) return 1;
 if (b == null) return -1;
 return cmp(a, b);
}

function time(v: Date | string | null | undefined): number {
 if (!v) return 0;
 const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
 return Number.isFinite(t) ? t : 0;
}

/** Did the shopper actually ask for any filtering/sorting/paging? */
export function hasFacetParams(params: URLSearchParams): boolean {
 if (params.has("sort_by") || (Number(params.get("page") || "1") || 1) > 1) return true;
 for (const k of params.keys()) if (k.startsWith("filter.")) return true;
 return false;
}
