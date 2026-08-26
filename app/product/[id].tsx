import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Pressable,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { colors } from "../../lib/theme";

const { width } = Dimensions.get("window");

type ProductDetail = {
  id: number;
  compositeId: string;
  title: string;
  description: string | null;
  priceFormatted: string;
  compareAtPrice: number | null;
  images: string[];
  size: string | null;
  brand: string | null;
  storeSlug: string;
  storeName: string;
  externalUrl: string | null;
  collabsLink: string | null;
};

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [imageIndex, setImageIndex] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["product", id],
    queryFn: () => apiGet<ProductDetail>(`/api/products/${id}`),
    enabled: !!id,
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
        <Text style={styles.errorText}>Couldn&apos;t load this product.</Text>
      </View>
    );
  }

  const buyUrl = data.collabsLink ?? data.externalUrl ?? null;

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {data.images.length > 0 && (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              setImageIndex(idx);
            }}
          >
            {data.images.map((img, i) => (
              <Image
                key={i}
                source={{ uri: img }}
                style={styles.heroImage}
                contentFit="cover"
                transition={200}
              />
            ))}
          </ScrollView>
        )}

        {data.images.length > 1 && (
          <View style={styles.dots}>
            {data.images.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === imageIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}

        <View style={styles.body}>
          <Text style={styles.store}>{data.storeName}</Text>
          <Text style={styles.title}>{data.title}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{data.priceFormatted}</Text>
            {data.compareAtPrice != null && (
              <Text style={styles.compareAt}>
                ${Math.round(data.compareAtPrice)}
              </Text>
            )}
          </View>

          {data.size && (
            <Text style={styles.size}>Size: {data.size}</Text>
          )}

          {data.description && (
            <Text style={styles.description}>
              {data.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
            </Text>
          )}
        </View>

        {buyUrl && (
          <View style={styles.buyWrap}>
            <Pressable
              style={styles.buyButton}
              onPress={() => Linking.openURL(buyUrl)}
            >
              <Text style={styles.buyButtonText}>Shop on {data.storeName}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 48 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  errorText: { color: colors.textMuted, fontSize: 14 },
  heroImage: {
    width: width,
    height: width * 1.25,
    backgroundColor: "rgba(216, 202, 189, 0.3)",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    paddingTop: 12,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textDim,
  },
  dotActive: { backgroundColor: colors.text },
  body: { padding: 20, gap: 8 },
  store: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "Georgia",
    fontSize: 22,
    color: colors.text,
    lineHeight: 28,
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 4 },
  price: { fontSize: 18, fontWeight: "500", color: colors.text },
  compareAt: {
    fontSize: 14,
    color: colors.textDim,
    textDecorationLine: "line-through",
  },
  size: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
    marginTop: 16,
  },
  buyWrap: { paddingHorizontal: 20, paddingTop: 16 },
  buyButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
  },
  buyButtonText: {
    color: colors.accentText,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: "500",
  },
});
