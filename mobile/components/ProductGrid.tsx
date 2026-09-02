import { ActivityIndicator, FlatList, RefreshControl, Text, useWindowDimensions, View } from "react-native";
import ProductCard from "./ProductCard";
import type { Product } from "../lib/types";
import { colors, fonts, spacing } from "../lib/theme";

// The two-column grid. Edge-to-edge with a hairline gutter, so the photographs carry the page —
// the shipped app runs the images nearly full-bleed and lets the cream ground show only between
// them, which is why the outer padding here is small and the cards have no rounding or shadow.

const GUTTER = 2;
const EDGE = 12;

export default function ProductGrid({
  products, loading, refreshing, onRefresh, onEndReached, footer, header, empty,
  favorited, onToggleFavorite,
}: {
  products: Product[];
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  footer?: React.ReactElement | null;
  header?: React.ReactElement | null;
  empty?: { title: string; body?: string };
  favorited?: (p: Product) => boolean;
  onToggleFavorite?: (p: Product) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - EDGE * 2 - GUTTER) / 2;

  if (loading && !products.length) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <FlatList
      data={products}
      keyExtractor={(p) => String(p.id)}
      numColumns={2}
      renderItem={({ item }) => (
        <ProductCard
          product={item}
          width={cardWidth}
          favorited={favorited?.(item)}
          onToggleFavorite={onToggleFavorite}
        />
      )}
      columnWrapperStyle={{ gap: GUTTER, paddingHorizontal: EDGE }}
      contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xxl, flexGrow: 1 }}
      style={{ backgroundColor: colors.bg }}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.text} /> : undefined}
      ListEmptyComponent={
        empty ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.text, textAlign: "center" }}>{empty.title}</Text>
            {empty.body ? (
              <Text style={{ marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" }}>{empty.body}</Text>
            ) : null}
          </View>
        ) : null
      }
    />
  );
}
