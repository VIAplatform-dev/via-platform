import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import CardGallery from "./CardGallery";
import HeartButton from "./HeartButton";
import type { Product } from "../lib/types";
import { colors, spacing } from "../lib/theme";

// One piece in the grid. Swipe the photograph, tap it to open, tap the heart to save — three
// different gestures on the same card, which is why none of them may wrap the others.

export default function ProductCard({
  product, width, favorited, onToggleFavorite,
}: {
  product: Product;
  width: number;
  favorited?: boolean;
  onToggleFavorite?: (p: Product) => void;
}) {
  const images = product.images?.length ? product.images : product.image ? [product.image] : [];
  const height = width / 0.82;
  const open = () => router.push(`/product/${product.id}`);

  return (
    <View style={{ width, marginBottom: spacing.xl }}>
      <View style={{ width, height }}>
        <CardGallery images={images} width={width} height={height} onPress={open} />
        {onToggleFavorite ? (
          <View style={{ position: "absolute", top: 10, right: 10 }}>
            <HeartButton favorited={favorited} onPress={() => onToggleFavorite(product)} onImage />
          </View>
        ) : null}
      </View>

      <Pressable onPress={open}>
        <Text numberOfLines={2} style={{ marginTop: spacing.md, fontSize: 15, lineHeight: 20, fontWeight: "600", color: colors.text }}>
          {product.name}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 5, fontSize: 12, letterSpacing: 1.1, textTransform: "uppercase", color: colors.textMuted }}>
          {product.storeName}
        </Text>
        <Text style={{ marginTop: 5, fontSize: 15, color: colors.text }}>{product.price}</Text>
        {product.size ? (
          <Text style={{ marginTop: 3, fontSize: 14, color: colors.textMuted }}>Size {product.size}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}
