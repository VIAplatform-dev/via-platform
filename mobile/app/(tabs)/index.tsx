import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { colors } from "../../lib/theme";
import { ProductCard } from "../../components/ProductCard";
import type { SearchResponse } from "../../lib/types";

export default function HomeScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["home-feed"],
    queryFn: () => apiGet<SearchResponse>("/api/search?q="),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn&apos;t load products. Pull down to retry.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data.products}
      numColumns={2}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <ProductCard product={item} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.heroText}>
            Access the world&apos;s best vintage.
          </Text>
          <Text style={styles.subText}>
            Curated from independent stores around the world.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  list: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 32,
    backgroundColor: colors.bg,
  },
  row: {
    justifyContent: "space-between",
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  heroText: {
    fontFamily: "Georgia",
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
    marginBottom: 8,
  },
  subText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  error: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
