"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Search, ChevronDown, X, SlidersHorizontal } from "lucide-react";

const SIZE_PICKER_GROUPS: { label: string; items: { value: string; display: string }[] }[] = [
  {
    label: "Clothing",
    items: ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "One Size"].map((v) => ({ value: v, display: v })),
  },
  {
    label: "Shoes — US",
    items: ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "12"].map((v) => ({
      value: v,
      display: `US ${v}`,
    })),
  },
  {
    label: "Shoes — EU",
    items: ["EU 35", "EU 36", "EU 37", "EU 38", "EU 39", "EU 40", "EU 41", "EU 42"].map((v) => ({
      value: v,
      display: v,
    })),
  },
];

export type PriceRange = "all" | "under100" | "100to250" | "250to500" | "over500";
export type SortOption = "popular" | "newest" | "price-asc" | "price-desc";

export type FilterState = {
  search: string;
  selectedPrices: PriceRange[];
  selectedStores: string[];
  selectedCategories: string[];
  selectedBrands: string[];
  selectedSizes: string[];
  selectedTypes: string[];
  selectedColors: string[];
  sort: SortOption;
};

type ProductFilterProps = {
  stores: { slug: string; name: string }[];
  categories?: { slug: string; label: string }[];
  brands?: { slug: string; label: string }[];
  sizes?: string[];
  types?: string[];
  colors?: string[];
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: Partial<FilterState>;
  productCount?: number;
  showCategoryFilter?: boolean;
  showBrandFilter?: boolean;
  showSizeFilter?: boolean;
  showTypeFilter?: boolean;
  showColorFilter?: boolean;
};

const priceRangeLabels: Record<PriceRange, string> = {
  all: "All Prices",
  under100: "Under $100",
  "100to250": "$100 - $250",
  "250to500": "$250 - $500",
  over500: "$500+",
};

const sortLabels: Record<SortOption, string> = {
  popular: "Popular",
  newest: "Newest",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
};

export default function ProductFilter({
  stores,
  categories = [],
  brands = [],
  sizes = [],
  types = [],
  colors = [],
  onFilterChange,
  initialFilters,
  productCount,
  showCategoryFilter = false,
  showBrandFilter = false,
  showSizeFilter = false,
  showTypeFilter = false,
  showColorFilter = false,
}: ProductFilterProps) {
  const { data: session } = useSession();

  // Saved sizes — null = not yet loaded
  const [savedSizes, setSavedSizes] = useState<string[] | null>(null);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [pickerSizes, setPickerSizes] = useState<string[]>([]);
  const [savingMySizes, setSavingMySizes] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    search: initialFilters?.search ?? "",
    selectedPrices: initialFilters?.selectedPrices ?? [],
    selectedStores: initialFilters?.selectedStores ?? [],
    selectedCategories: initialFilters?.selectedCategories ?? [],
    selectedBrands: initialFilters?.selectedBrands ?? [],
    selectedSizes: initialFilters?.selectedSizes ?? [],
    selectedTypes: initialFilters?.selectedTypes ?? [],
    selectedColors: initialFilters?.selectedColors ?? [],
    sort: initialFilters?.sort ?? "popular",
  });

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [openMobileSections, setOpenMobileSections] = useState<Set<string>>(new Set());

  const toggleMobileSection = useCallback((section: string) => {
    setOpenMobileSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  // Load saved sizes when user session is available
  useEffect(() => {
    if (!session?.user?.id) { setSavedSizes([]); return; }
    fetch("/api/user/sizes")
      .then((r) => r.ok ? r.json() : { sizes: [] })
      .then((d) => setSavedSizes(d.sizes ?? []))
      .catch(() => setSavedSizes([]));
  }, [session?.user?.id]);

  // "My Sizes" is active when selected sizes exactly match saved sizes
  const mySizesActive =
    savedSizes !== null &&
    savedSizes.length > 0 &&
    filters.selectedSizes.length === savedSizes.length &&
    savedSizes.every((s) => filters.selectedSizes.includes(s));

  const updateFilters = useCallback(
    (update: Partial<FilterState>) => {
      const newFilters = { ...filters, ...update };
      setFilters(newFilters);
      onFilterChange(newFilters);
    },
    [filters, onFilterChange]
  );

  const handleSaveMySizes = useCallback(async () => {
    setSavingMySizes(true);
    try {
      await fetch("/api/user/sizes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes: pickerSizes }),
      });
      setSavedSizes(pickerSizes);
      // Apply them immediately as the active size filter
      updateFilters({ selectedSizes: pickerSizes });
      setShowSizePicker(false);
    } catch {
      // silent fail
    } finally {
      setSavingMySizes(false);
    }
  }, [pickerSizes, updateFilters]);

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

  const toggleBrand = useCallback(
    (brandSlug: string) => {
      const current = filters.selectedBrands;
      const updated = current.includes(brandSlug)
        ? current.filter((b) => b !== brandSlug)
        : [...current, brandSlug];
      updateFilters({ selectedBrands: updated });
    },
    [filters.selectedBrands, updateFilters]
  );

  const toggleSize = useCallback(
    (size: string) => {
      const current = filters.selectedSizes;
      const updated = current.includes(size)
        ? current.filter((s) => s !== size)
        : [...current, size];
      updateFilters({ selectedSizes: updated });
    },
    [filters.selectedSizes, updateFilters]
  );

  const toggleType = useCallback(
    (type: string) => {
      const current = filters.selectedTypes;
      const updated = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      updateFilters({ selectedTypes: updated });
    },
    [filters.selectedTypes, updateFilters]
  );

  const toggleColor = useCallback(
    (color: string) => {
      const current = filters.selectedColors;
      const updated = current.includes(color)
        ? current.filter((c) => c !== color)
        : [...current, color];
      updateFilters({ selectedColors: updated });
    },
    [filters.selectedColors, updateFilters]
  );

  const togglePrice = useCallback(
    (range: PriceRange) => {
      const current = filters.selectedPrices;
      const updated = current.includes(range)
        ? current.filter((r) => r !== range)
        : [...current, range];
      updateFilters({ selectedPrices: updated });
    },
    [filters.selectedPrices, updateFilters]
  );

  const clearFilters = useCallback(() => {
    const cleared: FilterState = {
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
    setFilters(cleared);
    onFilterChange(cleared);
  }, [onFilterChange]);

  const hasActiveFilters =
    filters.search ||
    filters.selectedPrices.length > 0 ||
    filters.selectedStores.length > 0 ||
    filters.selectedCategories.length > 0 ||
    filters.selectedBrands.length > 0 ||
    filters.selectedSizes.length > 0 ||
    filters.selectedTypes.length > 0 ||
    filters.selectedColors.length > 0;

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    filters.selectedPrices.length +
    filters.selectedStores.length +
    filters.selectedCategories.length +
    filters.selectedBrands.length +
    filters.selectedSizes.length +
    filters.selectedTypes.length +
    filters.selectedColors.length;

  // Helper for mobile accordion section header
  function MobileSection({
    id,
    label,
    activeCount,
    children,
  }: {
    id: string;
    label: string;
    activeCount?: number;
    children: React.ReactNode;
  }) {
    const isOpen = openMobileSections.has(id);
    return (
      <div className="border-b border-[#5D0F17]/10 last:border-b-0">
        <button
          onClick={() => toggleMobileSection(id)}
          className="w-full flex items-center justify-between py-3.5"
        >
          <span className="text-xs uppercase tracking-wide text-[#5D0F17]/60 font-medium">
            {label}
            {activeCount ? (
              <span className="ml-2 bg-[#5D0F17] text-[#FFFDF8] text-[10px] px-1.5 py-0.5">
                {activeCount}
              </span>
            ) : null}
          </span>
          <ChevronDown
            size={14}
            className={`text-[#5D0F17]/40 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        {isOpen && <div className="pb-4">{children}</div>}
      </div>
    );
  }

  return (
    <>
    <div className="bg-[#FFFDF8] py-3 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5D0F17]/40" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            placeholder="Search products..."
            className="w-full pl-11 pr-9 py-2.5 rounded-full border border-[#5D0F17]/15 bg-[#5D0F17]/[0.03] text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/40 focus:border-[#5D0F17]/40 focus:bg-[#FFFDF8] focus:outline-none transition"
          />
          {filters.search && (
            <button onClick={() => updateFilters({ search: "" })} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5D0F17]/40 hover:text-[#5D0F17]">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters + Sort row */}
        <div className="flex items-center gap-2 sm:ml-auto">
        {productCount !== undefined && (
          <span className="text-sm text-[#5D0F17]/45 mr-1 whitespace-nowrap tabular-nums">
            {productCount} product{productCount !== 1 ? "s" : ""}
          </span>
        )}
        {/* Filters dropdown */}
        <div className="relative">
          <button
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm transition-all duration-200 ${
              activeFilterCount > 0
                ? "border-[#5D0F17] text-[#5D0F17] font-medium"
                : "border-[#5D0F17]/15 text-[#5D0F17]/70 hover:border-[#5D0F17]/40 hover:text-[#5D0F17]"
            }`}
          >
            <SlidersHorizontal size={14} />
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>

          {mobileFiltersOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMobileFiltersOpen(false)} />
              <div className="absolute top-full left-0 mt-2 z-50 w-72 bg-[#FFFDF8] border border-[#5D0F17]/15 rounded-2xl shadow-lg max-h-[70vh] overflow-y-auto">
                <div className="px-4">
              {/* Price Range */}
              <MobileSection
                id="price"
                label="Price Range"
                activeCount={filters.selectedPrices.length}
              >
                <div className="grid grid-cols-2 gap-2">
                  {(["under100", "100to250", "250to500", "over500"] as PriceRange[]).map((range) => (
                    <button
                      key={range}
                      onClick={() => togglePrice(range)}
                      className={`px-3 py-2 text-sm border transition ${
                        filters.selectedPrices.includes(range)
                          ? "border-[#5D0F17] bg-[#5D0F17] text-[#FFFDF8]"
                          : "border-[#5D0F17]/20 bg-[#FFFDF8] hover:border-[#5D0F17]"
                      }`}
                    >
                      {priceRangeLabels[range]}
                    </button>
                  ))}
                </div>
              </MobileSection>

              {/* Categories */}
              {showCategoryFilter && categories.length > 0 && (
                <MobileSection
                  id="categories"
                  label="Category"
                  activeCount={filters.selectedCategories.length}
                >
                  <div className="space-y-2">
                    {categories.map((cat) => (
                      <label key={cat.slug} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.selectedCategories.includes(cat.slug)}
                          onChange={() => toggleCategory(cat.slug)}
                          className="w-4 h-4 border-[#5D0F17]/20 focus:ring-[#5D0F17] accent-[#5D0F17]"
                        />
                        <span className="text-sm">{cat.label}</span>
                      </label>
                    ))}
                  </div>
                </MobileSection>
              )}

              {/* Colors */}
              {showColorFilter && colors.length > 0 && (
                <MobileSection
                  id="colors"
                  label="Color"
                  activeCount={filters.selectedColors.length}
                >
                  <div className="grid grid-cols-2 gap-2">
                    {colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => toggleColor(color)}
                        className={`px-3 py-2 text-sm border transition text-left ${
                          filters.selectedColors.includes(color)
                            ? "border-[#5D0F17] bg-[#5D0F17] text-[#FFFDF8]"
                            : "border-[#5D0F17]/20 bg-[#FFFDF8] hover:border-[#5D0F17]"
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </MobileSection>
              )}

              {/* Brands */}
              {showBrandFilter && brands.length > 0 && (
                <MobileSection
                  id="brands"
                  label="Brand"
                  activeCount={filters.selectedBrands.length}
                >
                  <div className="space-y-2">
                    {brands.map((brand) => (
                      <label key={brand.slug} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.selectedBrands.includes(brand.slug)}
                          onChange={() => toggleBrand(brand.slug)}
                          className="w-4 h-4 border-[#5D0F17]/20 focus:ring-[#5D0F17] accent-[#5D0F17]"
                        />
                        <span className="text-sm">{brand.label}</span>
                      </label>
                    ))}
                  </div>
                </MobileSection>
              )}

              {/* Sizes */}
              {showSizeFilter && sizes.length > 0 && (
                <MobileSection
                  id="sizes"
                  label="Size"
                  activeCount={filters.selectedSizes.length}
                >
                  {/* My Sizes row */}
                  {session?.user && savedSizes !== null && (
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#5D0F17]/10">
                      {savedSizes.length === 0 ? (
                        <button
                          onClick={() => { setPickerSizes([]); setShowSizePicker(true); }}
                          className="text-sm text-[#5D0F17]/50 hover:text-[#5D0F17] transition"
                        >
                          Save your sizes →
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => updateFilters({ selectedSizes: mySizesActive ? [] : savedSizes })}
                            className={`flex items-center gap-2 text-sm transition font-medium ${mySizesActive ? "text-[#5D0F17]" : "text-[#5D0F17]/50"}`}
                          >
                            {mySizesActive
                              ? <span className="w-4 h-4 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-[10px]">✓</span>
                              : <span className="w-4 h-4 border border-[#5D0F17]/20 inline-block" />
                            }
                            My Sizes
                          </button>
                          <button
                            onClick={() => { setPickerSizes([...savedSizes]); setShowSizePicker(true); }}
                            className="text-xs uppercase tracking-wide text-[#5D0F17]/40 hover:text-[#5D0F17] transition"
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    {sizes.map((size) => (
                      <label key={size} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.selectedSizes.includes(size)}
                          onChange={() => toggleSize(size)}
                          className="w-4 h-4 border-[#5D0F17]/20 focus:ring-[#5D0F17] accent-[#5D0F17]"
                        />
                        <span className="text-sm">{size}</span>
                      </label>
                    ))}
                  </div>
                </MobileSection>
              )}

              {/* Types */}
              {showTypeFilter && types.length > 0 && (
                <MobileSection
                  id="types"
                  label="Type"
                  activeCount={filters.selectedTypes.length}
                >
                  <div className="space-y-2">
                    {types.map((type) => (
                      <label key={type} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.selectedTypes.includes(type)}
                          onChange={() => toggleType(type)}
                          className="w-4 h-4 border-[#5D0F17]/20 focus:ring-[#5D0F17] accent-[#5D0F17]"
                        />
                        <span className="text-sm">{type}</span>
                      </label>
                    ))}
                  </div>
                </MobileSection>
              )}

              {/* Stores */}
              {stores.length > 1 && (
                <MobileSection
                  id="stores"
                  label="Store"
                  activeCount={filters.selectedStores.length}
                >
                  <div className="space-y-2">
                    {stores.map((store) => (
                      <label key={store.slug} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.selectedStores.includes(store.slug)}
                          onChange={() => toggleStore(store.slug)}
                          className="w-4 h-4 border-[#5D0F17]/20 focus:ring-[#5D0F17] accent-[#5D0F17]"
                        />
                        <span className="text-sm">{store.name}</span>
                      </label>
                    ))}
                  </div>
                </MobileSection>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-4 py-4 border-t border-[#5D0F17]/10">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex-1 py-2.5 text-sm border border-[#5D0F17]/20 hover:border-[#5D0F17] transition"
                >
                  Clear All
                </button>
              )}
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="flex-1 py-2.5 text-sm bg-[#5D0F17] text-[#FFFDF8]"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </>
      )}
        </div>

        {/* Sort By */}
        <div className="relative">
          <button
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#5D0F17]/15 text-sm text-[#5D0F17]/70 hover:border-[#5D0F17]/40 hover:text-[#5D0F17] transition"
          >
            <span className="text-[#5D0F17]/50">Sort</span>
            <span className="text-[#5D0F17] font-medium">{sortLabels[filters.sort]}</span>
            <ChevronDown size={13} className={`ml-0.5 transition-transform duration-200 ${sortDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {sortDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSortDropdownOpen(false)} />
              <div className="absolute top-full right-0 mt-2 z-50 bg-[#FFFDF8] border border-[#5D0F17]/15 rounded-2xl shadow-lg overflow-hidden min-w-[170px]">
                {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => { updateFilters({ sort: option }); setSortDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#D8CABD]/20 transition flex items-center justify-between ${
                      filters.sort === option ? "font-medium" : ""
                    }`}
                  >
                    {sortLabels[option]}
                    {filters.sort === option && <span className="text-[#5D0F17] text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        </div>{/* end flex row */}
      </div>{/* end inline-flex col */}
    </div>


    {/* ── Pick Your Sizes Modal ─────────────────────────────────── */}
    {showSizePicker && (
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
        <div className="fixed inset-0 bg-black/40" onClick={() => setShowSizePicker(false)} />
        <div className="relative bg-[#FFFDF8] w-full sm:max-w-lg sm:mx-4 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-5 border-b border-[#5D0F17]/10">
            <div>
              <h2 className="text-lg font-serif text-[#5D0F17]">
                {savedSizes?.length === 0 ? "Pick Your Sizes" : "My Sizes"}
              </h2>
              <p className="text-xs text-[#5D0F17]/50 mt-0.5">
                Select all sizes you typically wear — clothing and shoes
              </p>
            </div>
            <button onClick={() => setShowSizePicker(false)} className="text-[#5D0F17]/40 hover:text-[#5D0F17] p-1 mt-0.5">
              <X size={20} />
            </button>
          </div>

          {/* Size groups */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
            {SIZE_PICKER_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs uppercase tracking-[0.12em] text-[#5D0F17]/40 mb-3">{group.label}</p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map(({ value, display }) => {
                    const selected = pickerSizes.includes(value);
                    return (
                      <button
                        key={value}
                        onClick={() =>
                          setPickerSizes((prev) =>
                            prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
                          )
                        }
                        className={`px-3 py-2 text-sm border transition-all ${
                          selected
                            ? "border-[#5D0F17] bg-[#5D0F17] text-[#FFFDF8]"
                            : "border-[#5D0F17]/20 text-[#5D0F17] hover:border-[#5D0F17]"
                        }`}
                      >
                        {display}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-[#5D0F17]/10">
            <button
              onClick={() => setShowSizePicker(false)}
              className="flex-1 py-3 text-sm border border-[#5D0F17]/20 hover:border-[#5D0F17] transition text-[#5D0F17]"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveMySizes}
              disabled={savingMySizes}
              className="flex-1 py-3 text-sm bg-[#5D0F17] text-[#FFFDF8] disabled:opacity-50 transition"
            >
              {savingMySizes ? "Saving…" : pickerSizes.length > 0 ? `Save (${pickerSizes.length})` : "Save"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
