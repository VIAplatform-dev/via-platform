import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useFavorites } from "../../lib/useFavorites";
import { useSaveSearch } from "../../lib/useSaveSearch";
import { EMPTY_FILTERS, activeCount, toQuery, toSavedFilters, type Filters } from "../../lib/filters";
import FloatingNav from "../../components/FloatingNav";
import ListToolbar from "../../components/ListToolbar";
import FilterSheet from "../../components/FilterSheet";
import ProductGrid from "../../components/ProductGrid";
import type { Product } from "../../lib/types";
import { colors } from "../../lib/theme";

// A category slice. There is no category endpoint — the feed takes a `categories` filter, which is
// what the shipped app used. The category is LOCKED into every query here rather than being a chip
// in the sheet: this page is that category, and offering to un-tick it would empty the screen.

function label(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { isFavorited, toggleFavorite } = useFavorites();
  const { saved, onSave } = useSaveSearch();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(false);
  const title = label(String(slug ?? ""));
  const locked = { categories: [String(slug)] };

  const q = useQuery({
    queryKey: ["category", slug, filters],
    queryFn: () => apiGet<{ products: Product[] }>(`/api/public/feed?${toQuery(filters, locked)}`),
    enabled: Boolean(slug),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ProductGrid
        products={q.data?.products ?? []}
        loading={q.isLoading}
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
        favorited={isFavorited}
        onToggleFavorite={toggleFavorite}
        header={
          <View>
            <View style={{ height: insets.top + 64 }} />
            <ListToolbar
              saved={saved}
              filterCount={activeCount(filters)}
              onSave={() => onSave(title, toSavedFilters(filters, locked))}
              onFilter={() => setSheet(true)}
            />
          </View>
        }
        empty={{ title: "Nothing matches.", body: "Try widening the filters." }}
      />
      <FloatingNav title={title} />
      <FilterSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={setFilters} hideCategories />
    </View>
  );
}
