import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { colors } from "../lib/theme";
import type { Product } from "../lib/types";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 36) / 2; // 12px gutter on each side + 12px center
const IMAGE_HEIGHT = CARD_WIDTH * 1.25;

export function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0] ?? product.image;

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/product/[id]",
          params: { id: `${product.storeSlug}-${product.id}` },
        })
      }
      style={styles.card}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}

      <View style={styles.info}>
        <Text numberOfLines={2} style={styles.title}>
          {product.name}
        </Text>
        <Text style={styles.store}>{product.storeName}</Text>
        <Text style={styles.price}>{product.price}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginBottom: 24,
  },
  image: {
    width: CARD_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: "rgba(216, 202, 189, 0.3)",
  },
  imagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    paddingTop: 8,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 17,
  },
  store: {
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: 2,
  },
  price: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
    marginTop: 2,
  },
});
