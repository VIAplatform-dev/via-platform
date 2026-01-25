"use client";

import { useState, useMemo, useCallback } from "react";
import ProductFilter, {
  FilterState,
  PriceRange,
  SortOption,
} from "./ProductFilter";
import ProductCard from "./ProductCard";
import type { CategoryLabel } from "@/app/lib/categoryMap";

export type FilterableProduct = {
  id: string;
  title: string;
  price: number;
  category: string;
  categoryLabel: CategoryLabel;
  store: string;
  storeSlug: string;
  externalUrl?: string;
  image: string;
  createdAt?: number; // timestamp for sorting by newest
};

type FilteredProductGridProps = {
  products: FilterableProduct[];
  stores: { slug: string; name: string }[];
  categories?: { slug: string; label: string }[];
  showCategoryFilter?: boolean;
  emptyMessage?: string;
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
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "newest":
    default:
      // Sort by createdAt if available, otherwise by id (which often contains index)
      return sorted.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return b.createdAt - a.createdAt;
        }
        // Fallback: reverse order to show newest first
        return b.id.localeCompare(a.id);
      });
  }
}

export default function FilteredProductGrid({
  products,
  stores,
  categories = [],
  showCategoryFilter = false,
  emptyMessage = "No products found.",
}: FilteredProductGridProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    priceRange: "all",
    selectedStores: [],
    selectedCategories: [],
    sort: "newest",
  });

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  const filteredProducts = useMemo(() => {
    let result = products;

    // Search filter (title and store name)
    if (filters.search.trim()) {
      const query = filters.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.store.toLowerCase().includes(query)
      );
    }

    // Price range filter
    if (filters.priceRange !== "all") {
      result = result.filter((p) =>
        matchesPriceRange(p.price, filters.priceRange)
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

    // Sort
    result = sortProducts(result, filters.sort);

    return result;
  }, [products, filters]);

  // Get unique stores from products for the filter
  const availableStores = useMemo(() => {
    const storeMap = new Map<string, { slug: string; name: string }>();
    products.forEach((p) => {
      if (!storeMap.has(p.storeSlug)) {
        storeMap.set(p.storeSlug, { slug: p.storeSlug, name: p.store });
      }
    });
    return Array.from(storeMap.values());
  }, [products]);

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

  return (
    <div>
      <ProductFilter
        stores={availableStores.length > 0 ? availableStores : stores}
        categories={
          availableCategories.length > 0 ? availableCategories : categories
        }
        showCategoryFilter={showCategoryFilter}
        onFilterChange={handleFilterChange}
        productCount={filteredProducts.length}
      />

      {filteredProducts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-black/70 mb-4">{emptyMessage}</p>
          {filters.search ||
          filters.priceRange !== "all" ||
          filters.selectedStores.length > 0 ||
          filters.selectedCategories.length > 0 ? (
            <button
              onClick={() =>
                handleFilterChange({
                  search: "",
                  priceRange: "all",
                  selectedStores: [],
                  selectedCategories: [],
                  sort: filters.sort,
                })
              }
              className="text-sm uppercase tracking-wide underline hover:no-underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6">
          {filteredProducts.map((product) => (
            <div key={product.id} className="group">
              <ProductCard
                id={product.id}
                name={product.title}
                price={`$${product.price}`}
                category={product.categoryLabel}
                storeName={product.store}
                storeSlug={product.storeSlug}
                externalUrl={product.externalUrl}
                image={product.image}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
