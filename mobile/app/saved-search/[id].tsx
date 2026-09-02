import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import ProductGrid from "../../components/ProductGrid";
import type { Product } from "../../lib/types";

// The results of one saved search.
//
// There is no "get one saved search" endpoint — /api/mobile/saved-searches/[id] only accepts DELETE
// — so the list is fetched and the one we want picked out of it. That is also why the filters are
// replayed against the feed here rather than the server returning matches directly.

type SavedSearch = {
  id: number;
  name: string;
  filters: { sizes?: string[]; categories?: string[]; stores?: string[]; priceMin?: number | null; priceMax?: number | null; query?: string };
};

function toQuery(f: SavedSearch["filters"]): string {
  const p = new URLSearchParams();
  if (f.query) p.set("q", f.query);
  if (f.sizes?.length) p.set("sizes", f.sizes.join(","));
  if (f.categories?.length) p.set("categories", f.categories.join(","));
  if (f.stores?.length) p.set("stores", f.stores.join(","));
  if (f.priceMin != null) p.set("priceMin", String(f.priceMin));
  if (f.priceMax != null) p.set("priceMax", String(f.priceMax));
  return p.toString();
}

export default function SavedSearchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const list = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => apiGet<{ searches: SavedSearch[] }>("/api/mobile/saved-searches"),
  });
  const search = list.data?.searches.find((s) => String(s.id) === String(id));

  const results = useQuery({
    queryKey: ["saved-search-results", id, search?.filters],
    queryFn: () => {
      const qs = toQuery(search!.filters);
      // A saved search with a text term is a search; one that is only filters is a filtered feed.
      const path = search!.filters.query ? `/api/public/search?${qs}` : `/api/public/feed?${qs}`;
      return apiGet<{ products: Product[] }>(path);
    },
    enabled: Boolean(search),
  });

  return (
    <>
      <Stack.Screen options={{ title: search?.name ?? "Saved Search" }} />
      <ProductGrid
        products={results.data?.products ?? []}
        loading={list.isLoading || results.isLoading}
        refreshing={results.isRefetching}
        onRefresh={() => results.refetch()}
        empty={{ title: "Nothing matches right now.", body: "We'll keep watching — new pieces land daily." }}
      />
    </>
  );
}
