import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFavorites } from "../../lib/useFavorites";
import { useFollows } from "../../lib/follows";
import { useSaveSearch } from "../../lib/useSaveSearch";
import { EMPTY_FILTERS, activeCount, toQuery, toSavedFilters, type Filters } from "../../lib/filters";
import FloatingNav from "../../components/FloatingNav";
import ListToolbar from "../../components/ListToolbar";
import FilterSheet from "../../components/FilterSheet";
import ProductGrid from "../../components/ProductGrid";
import type { Product } from "../../lib/types";
import { colors, eyebrow, fonts, spacing } from "../../lib/theme";

// A store's own page. Stores are the unit VYA is built on — people follow a shop, not a brand — so
// Follow sits directly under the name, above even the description.

type StoreResponse = {
  store: { slug: string; name: string; location: string | null; image: string | null; description: string | null };
  products: Product[];
};

export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isFavorited, toggleFavorite } = useFavorites();
  const { isFollowing, toggleFollow } = useFollows();
  const { saved, onSave } = useSaveSearch();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(false);

  const q = useQuery({
    queryKey: ["store", slug, filters],
    queryFn: () => apiGet<StoreResponse>(`/api/public/store/${slug}?${toQuery(filters)}`),
    enabled: Boolean(slug),
  });

  const s = q.data?.store;
  const following = s ? isFollowing(s.slug) : false;

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
          s ? (
            <View>
              {/* Clears the floating pills. No banner image: most stores have none, and an empty
                  card at the top of the page reads as a failed load. */}
              <View style={{ height: insets.top + 64 }} />
              <View style={{ paddingHorizontal: spacing.lg }}>
                <Text style={{ fontFamily: fonts.serif, fontSize: 34, color: colors.text }}>{s.name}</Text>
                {s.location ? <Text style={[eyebrow, { marginTop: 4 }]}>{s.location}</Text> : null}

                {user ? (
                  <Pressable
                    onPress={() => s && toggleFollow(s.slug)}
                    style={{
                      marginTop: spacing.lg, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.sm,
                      borderWidth: 1, borderColor: colors.accent, borderRadius: 999,
                      paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
                      backgroundColor: following ? colors.accent : "transparent",
                    }}
                  >
                    <Feather name={following ? "check" : "plus"} size={17} color={following ? colors.accentText : colors.text} />
                    <Text style={{ fontSize: 15, letterSpacing: 1.6, textTransform: "uppercase", color: following ? colors.accentText : colors.text }}>
                      {following ? "Following" : "Follow"}
                    </Text>
                  </Pressable>
                ) : null}

                {s.description ? (
                  <Text style={{ marginTop: spacing.lg, fontSize: 16, lineHeight: 24, color: colors.text }}>{s.description}</Text>
                ) : null}

                <View style={{ marginTop: spacing.xxl }}>
                  <Text style={eyebrow}>All</Text>
                  <Text style={{ marginTop: 2, fontFamily: fonts.serif, fontSize: 30, color: colors.text }}>Products</Text>
                </View>
              </View>
              <View style={{ marginTop: spacing.lg }}>
                <ListToolbar saved={saved} filterCount={activeCount(filters)} onSave={() => onSave(s!.name, toSavedFilters(filters, { stores: [String(slug)] }))} onFilter={() => setSheet(true)} />
              </View>
            </View>
          ) : null
        }
        empty={{ title: "Nothing listed right now.", body: "This store's pieces will appear here." }}
      />
      <FloatingNav title={s?.name} />
      <FilterSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={setFilters} hideStores />
    </View>
  );
}
