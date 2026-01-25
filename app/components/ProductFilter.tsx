"use client";

import { useState, useCallback } from "react";
import { Search, ChevronDown, X } from "lucide-react";

export type PriceRange = "all" | "under100" | "100to250" | "250to500" | "over500";
export type SortOption = "newest" | "price-asc" | "price-desc";

export type FilterState = {
  search: string;
  priceRange: PriceRange;
  selectedStores: string[];
  selectedCategories: string[];
  sort: SortOption;
};

type ProductFilterProps = {
  stores: { slug: string; name: string }[];
  categories?: { slug: string; label: string }[];
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: Partial<FilterState>;
  productCount?: number;
  showCategoryFilter?: boolean;
};

const priceRangeLabels: Record<PriceRange, string> = {
  all: "All Prices",
  under100: "Under $100",
  "100to250": "$100 - $250",
  "250to500": "$250 - $500",
  over500: "$500+",
};

const sortLabels: Record<SortOption, string> = {
  newest: "Newest",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
};

export default function ProductFilter({
  stores,
  categories = [],
  onFilterChange,
  initialFilters,
  productCount,
  showCategoryFilter = false,
}: ProductFilterProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: initialFilters?.search ?? "",
    priceRange: initialFilters?.priceRange ?? "all",
    selectedStores: initialFilters?.selectedStores ?? [],
    selectedCategories: initialFilters?.selectedCategories ?? [],
    sort: initialFilters?.sort ?? "newest",
  });

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [priceDropdownOpen, setPriceDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  const updateFilters = useCallback(
    (update: Partial<FilterState>) => {
      const newFilters = { ...filters, ...update };
      setFilters(newFilters);
      onFilterChange(newFilters);
    },
    [filters, onFilterChange]
  );

  const toggleStore = useCallback(
    (storeSlug: string) => {
      const current = filters.selectedStores;
      const updated = current.includes(storeSlug)
        ? current.filter((s) => s !== storeSlug)
        : [...current, storeSlug];
      updateFilters({ selectedStores: updated });
    },
    [filters.selectedStores, updateFilters]
  );

  const toggleCategory = useCallback(
    (categorySlug: string) => {
      const current = filters.selectedCategories;
      const updated = current.includes(categorySlug)
        ? current.filter((c) => c !== categorySlug)
        : [...current, categorySlug];
      updateFilters({ selectedCategories: updated });
    },
    [filters.selectedCategories, updateFilters]
  );

  const clearFilters = useCallback(() => {
    const cleared: FilterState = {
      search: "",
      priceRange: "all",
      selectedStores: [],
      selectedCategories: [],
      sort: "newest",
    };
    setFilters(cleared);
    onFilterChange(cleared);
  }, [onFilterChange]);

  const hasActiveFilters =
    filters.search ||
    filters.priceRange !== "all" ||
    filters.selectedStores.length > 0 ||
    filters.selectedCategories.length > 0;

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    (filters.priceRange !== "all" ? 1 : 0) +
    filters.selectedStores.length +
    filters.selectedCategories.length;

  return (
    <div className="mb-8">
      {/* Desktop Filters */}
      <div className="hidden md:block">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
              placeholder="Search products or stores..."
              className="w-full pl-10 pr-4 py-2.5 border border-neutral-200 text-sm focus:border-black focus:outline-none transition"
            />
            {filters.search && (
              <button
                onClick={() => updateFilters({ search: "" })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Price Range Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setPriceDropdownOpen(!priceDropdownOpen);
                setSortDropdownOpen(false);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 border text-sm transition ${
                filters.priceRange !== "all"
                  ? "border-black bg-black text-white"
                  : "border-neutral-200 hover:border-black"
              }`}
            >
              {priceRangeLabels[filters.priceRange]}
              <ChevronDown size={16} />
            </button>
            {priceDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setPriceDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 shadow-lg z-20 min-w-[160px]">
                  {(Object.keys(priceRangeLabels) as PriceRange[]).map(
                    (range) => (
                      <button
                        key={range}
                        onClick={() => {
                          updateFilters({ priceRange: range });
                          setPriceDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-50 transition ${
                          filters.priceRange === range
                            ? "bg-neutral-100 font-medium"
                            : ""
                        }`}
                      >
                        {priceRangeLabels[range]}
                      </button>
                    )
                  )}
                </div>
              </>
            )}
          </div>

          {/* Category Filters */}
          {showCategoryFilter && categories.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Category:
              </span>
              {categories.map((cat) => (
                <button
                  key={cat.slug}
                  onClick={() => toggleCategory(cat.slug)}
                  className={`px-3 py-1.5 text-sm border transition ${
                    filters.selectedCategories.includes(cat.slug)
                      ? "border-black bg-black text-white"
                      : "border-neutral-200 hover:border-black"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          {/* Store Filters */}
          {stores.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Store:
              </span>
              {stores.map((store) => (
                <button
                  key={store.slug}
                  onClick={() => toggleStore(store.slug)}
                  className={`px-3 py-1.5 text-sm border transition ${
                    filters.selectedStores.includes(store.slug)
                      ? "border-black bg-black text-white"
                      : "border-neutral-200 hover:border-black"
                  }`}
                >
                  {store.name}
                </button>
              ))}
            </div>
          )}

          {/* Sort Dropdown */}
          <div className="relative ml-auto">
            <button
              onClick={() => {
                setSortDropdownOpen(!sortDropdownOpen);
                setPriceDropdownOpen(false);
              }}
              className="flex items-center gap-2 px-4 py-2.5 border border-neutral-200 text-sm hover:border-black transition"
            >
              Sort: {sortLabels[filters.sort]}
              <ChevronDown size={16} />
            </button>
            {sortDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setSortDropdownOpen(false)}
                />
                <div className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 shadow-lg z-20 min-w-[180px]">
                  {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        updateFilters({ sort: option });
                        setSortDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-50 transition ${
                        filters.sort === option
                          ? "bg-neutral-100 font-medium"
                          : ""
                      }`}
                    >
                      {sortLabels[option]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Active Filters & Clear */}
        {hasActiveFilters && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-neutral-100">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}{" "}
              active
            </span>
            <button
              onClick={clearFilters}
              className="text-xs uppercase tracking-wide underline hover:no-underline"
            >
              Clear all
            </button>
            {productCount !== undefined && (
              <span className="ml-auto text-sm text-neutral-600">
                {productCount} product{productCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mobile Filters */}
      <div className="md:hidden">
        {/* Mobile Search */}
        <div className="relative mb-3">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-3 border border-neutral-200 text-sm focus:border-black focus:outline-none transition"
          />
        </div>

        {/* Mobile Filter Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 border text-sm transition ${
              hasActiveFilters
                ? "border-black bg-black text-white"
                : "border-neutral-200"
            }`}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-white text-black px-1.5 py-0.5 text-xs rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Mobile Sort */}
          <select
            value={filters.sort}
            onChange={(e) =>
              updateFilters({ sort: e.target.value as SortOption })
            }
            className="flex-1 py-3 px-4 border border-neutral-200 text-sm focus:border-black focus:outline-none bg-white"
          >
            {(Object.keys(sortLabels) as SortOption[]).map((option) => (
              <option key={option} value={option}>
                {sortLabels[option]}
              </option>
            ))}
          </select>
        </div>

        {/* Mobile Filter Panel */}
        {mobileFiltersOpen && (
          <div className="mt-4 p-4 border border-neutral-200 bg-neutral-50">
            {/* Price Range */}
            <div className="mb-6">
              <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                Price Range
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(priceRangeLabels) as PriceRange[]).map(
                  (range) => (
                    <button
                      key={range}
                      onClick={() => updateFilters({ priceRange: range })}
                      className={`px-3 py-2 text-sm border transition ${
                        filters.priceRange === range
                          ? "border-black bg-black text-white"
                          : "border-neutral-200 bg-white hover:border-black"
                      }`}
                    >
                      {priceRangeLabels[range]}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Categories */}
            {showCategoryFilter && categories.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                  Categories
                </h4>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <label
                      key={cat.slug}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters.selectedCategories.includes(cat.slug)}
                        onChange={() => toggleCategory(cat.slug)}
                        className="w-4 h-4 border-neutral-300 rounded focus:ring-black accent-black"
                      />
                      <span className="text-sm">{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Stores */}
            {stores.length > 1 && (
              <div className="mb-6">
                <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                  Stores
                </h4>
                <div className="space-y-2">
                  {stores.map((store) => (
                    <label
                      key={store.slug}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters.selectedStores.includes(store.slug)}
                        onChange={() => toggleStore(store.slug)}
                        className="w-4 h-4 border-neutral-300 rounded focus:ring-black accent-black"
                      />
                      <span className="text-sm">{store.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-neutral-200">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex-1 py-2.5 text-sm border border-neutral-200 hover:border-black transition"
                >
                  Clear All
                </button>
              )}
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="flex-1 py-2.5 text-sm bg-black text-white"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}

        {/* Results Count (Mobile) */}
        {productCount !== undefined && (
          <p className="mt-3 text-sm text-neutral-600">
            {productCount} product{productCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
