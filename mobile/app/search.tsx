import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { useFavorites } from "../lib/useFavorites";
import { useSaveSearch } from "../lib/useSaveSearch";
import { EMPTY_FILTERS, activeCount, toQuery, toSavedFilters, type Filters } from "../lib/filters";
import ProductGrid from "../components/ProductGrid";
import ListToolbar from "../components/ListToolbar";
import FilterSheet from "../components/FilterSheet";
import type { Product } from "../lib/types";
import { colors, eyebrow, spacing } from "../lib/theme";

// Search. Its own screen rather than a box on Shop, because the header's magnifying glass is
// reachable from every tab and has to land somewhere that is ready to be typed into.
//
// Submitted rather than as-you-type: the endpoint runs a LIKE across several fields, and firing it
// on every keystroke would queue a request per letter to answer a query nobody finished.

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  // Browse links here with a designer preselected — the API has a `designers` filter, which is not
  // the same as a category, and routing a brand through `categories` matches on title keywords and
  // returns the wrong things.
  const params = useLocalSearchParams<{ designer?: string }>();
  const designer = typeof params.designer === "string" ? params.designer : null;
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const { isFavorited, toggleFavorite } = useFavorites();
  const { saved, onSave } = useSaveSearch();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(false);

  const q = useQuery({
    queryKey: ["search", query, designer, filters],
    queryFn: () => {
      const extra = designer ? `&designers=${encodeURIComponent(designer)}` : "";
      // A designer link needs no typed term; the filter alone is the query.
      const path = query ? `/api/public/search?q=${encodeURIComponent(query)}` : "/api/public/feed?limit=60";
      return apiGet<{ products: Product[] }>(`${path}&${toQuery(filters)}${extra}`);
    },
    enabled: query.length > 0 || Boolean(designer),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Feather name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => setQuery(input.trim())}
            returnKeyType="search"
            autoFocus={!designer}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Search Chanel, sandals, vintage tees..."
            placeholderTextColor={colors.textDim}
            style={{ flex: 1, fontSize: 16, color: colors.text }}
          />
          {input ? (
            <Pressable onPress={() => { setInput(""); setQuery(""); }} hitSlop={8}>
              <Feather name="x" size={17} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}>
          <Text style={{ fontSize: 16, color: colors.text }}>Cancel</Text>
        </Pressable>
      </View>

      {query || designer ? (
        <ProductGrid
          products={q.data?.products ?? []}
          loading={q.isLoading}
          favorited={isFavorited}
          onToggleFavorite={toggleFavorite}
          header={
            <View>
              {q.data ? (
                <Text style={[eyebrow, { paddingHorizontal: spacing.lg, paddingBottom: spacing.md }]}>
                  {q.data.products.length} {q.data.products.length === 1 ? "result" : "results"} for “{query}”
                </Text>
              ) : null}
              <ListToolbar saved={saved} filterCount={activeCount(filters)} onSave={() => onSave(query, { ...toSavedFilters(filters), query })} onFilter={() => setSheet(true)} />
            </View>
          }
          empty={{ title: `Nothing for “${query}”.`, body: "Try a designer, an era, or a plainer word." }}
        />
      ) : (
        <View style={{ flex: 1, alignItems: "center", paddingTop: spacing.xxl }}>
          <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: "center", paddingHorizontal: spacing.xxl }}>
            Search across every store on VYA — by designer, category, era or just what it looks like.
          </Text>
        </View>
      )}
      <FilterSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={setFilters} />
    </View>
  );
}
