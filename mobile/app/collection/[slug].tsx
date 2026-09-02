import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useFavorites } from "../../lib/useFavorites";
import { useSaveSearch } from "../../lib/useSaveSearch";
import { EMPTY_FILTERS, activeCount, toSavedFilters, type Filters } from "../../lib/filters";
import FloatingNav from "../../components/FloatingNav";
import ListToolbar from "../../components/ListToolbar";
import FilterSheet from "../../components/FilterSheet";
import ProductGrid from "../../components/ProductGrid";
import type { Product } from "../../lib/types";
import { colors, eyebrow, fonts, spacing } from "../../lib/theme";

// An editorially curated set. The curator is named above the title rather than below it — on a
// marketplace of independent shops, WHO chose these is most of why you'd trust the selection.

type CollectionResponse = {
  collection: { slug: string; title?: string; name?: string; description?: string | null; curatedBy?: string | null };
  products: Product[];
};

export default function CollectionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { isFavorited, toggleFavorite } = useFavorites();
  const { saved, onSave } = useSaveSearch();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(false);

  const q = useQuery({
    queryKey: ["collection", slug],
    queryFn: () => apiGet<CollectionResponse>(`/api/public/collection/${slug}`),
    enabled: Boolean(slug),
  });

  const c = q.data?.collection;
  const title = c?.title ?? c?.name ?? "";

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
          c ? (
            <View>
              <View style={{ height: insets.top + 64 }} />
              <View style={{ paddingHorizontal: spacing.lg }}>
                {c.curatedBy ? <Text style={eyebrow}>Curated by {c.curatedBy}</Text> : null}
                {c.description ? (
                  <Text style={{ marginTop: spacing.md, fontSize: 16, lineHeight: 24, color: colors.text }}>{c.description}</Text>
                ) : null}
              </View>
              <View style={{ marginTop: spacing.lg }}>
                <ListToolbar saved={saved} filterCount={activeCount(filters)} onSave={() => onSave(title, toSavedFilters(filters))} onFilter={() => setSheet(true)} />
              </View>
            </View>
          ) : null
        }
        empty={{ title: "This collection is empty." }}
      />
      <FloatingNav title={title} />
      <FilterSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={setFilters} />
    </View>
  );
}
