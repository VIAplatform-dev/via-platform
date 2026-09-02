import { useState } from "react";
import { View, TextInput, FlatList, StyleSheet, ActivityIndicator, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { colors } from "../../lib/theme";
import { ProductCard } from "../../components/ProductCard";
import type { SearchResponse } from "../../lib/types";

export default function BrowseScreen() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  // Simple debounce — wait 300ms after typing stops
  function onChangeText(text: string) {
    setQuery(text);
    const t = setTimeout(() => setDebounced(text), 300);
    return () => clearTimeout(t);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["browse", debounced],
    queryFn: () => apiGet<SearchResponse>(`/api/search?q=${encodeURIComponent(debounced)}`),
  });

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.input}
          placeholder="Search Chanel, sandals, vintage tees..."
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={onChangeText}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : !data || data.products.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No matches yet. Try a different search.</Text>
        </View>
      ) : (
        <FlatList
          data={data.products}
          numColumns={2}
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.row}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <ProductCard product={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.bg,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bgCard,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  empty: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 32,
  },
  row: {
    justifyContent: "space-between",
  },
});
