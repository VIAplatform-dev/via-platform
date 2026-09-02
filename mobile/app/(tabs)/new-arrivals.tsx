import { useCallback } from "react";
import { View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useFavorites } from "../../lib/useFavorites";
import AppHeader from "../../components/AppHeader";
import ProductGrid from "../../components/ProductGrid";
import type { PagedProducts } from "../../lib/types";
import { colors } from "../../lib/theme";

// New Arrivals — the only genuinely paged screen. The API advances `nextOffset` by the RAW rows it
// consumed rather than the filtered count, so paging stays consistent when its category filters
// drop items; that is why the cursor comes from the response and is never computed here.

const LIMIT = 20;

export default function NewArrivalsScreen() {
  const { isFavorited, toggleFavorite } = useFavorites();
  const q = useInfiniteQuery({
    queryKey: ["new-arrivals"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => apiGet<PagedProducts>(`/api/public/new-arrivals?limit=${LIMIT}&offset=${pageParam}`),
    getNextPageParam: (last) => (last.hasMore ? last.nextOffset : undefined),
  });

  const products = q.data?.pages.flatMap((p) => p.products) ?? [];
  const more = useCallback(() => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }, [q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="New Arrivals" />
      <ProductGrid
        products={products}
        loading={q.isLoading}
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
        onEndReached={more}
        favorited={isFavorited}
        onToggleFavorite={toggleFavorite}
        empty={{ title: "Nothing new today.", body: "Stores add pieces most mornings." }}
      />
    </View>
  );
}
