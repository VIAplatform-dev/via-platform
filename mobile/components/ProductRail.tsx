import { ScrollView, useWindowDimensions } from "react-native";
import ProductCard from "./ProductCard";
import type { Product } from "../lib/types";
import { spacing } from "../lib/theme";

// A horizontally-scrolling row of pieces, used for "More from this store" and "You might also like".
//
// Two visible at a time with the next one peeking, so the row obviously scrolls rather than looking
// like a block of four that happens to end. These sections are a sideline to the piece you are
// looking at — giving them a full grid competes with it.

export default function ProductRail({
  products, favorited, onToggleFavorite,
}: {
  products: Product[];
  favorited?: (p: Product) => boolean;
  onToggleFavorite?: (p: Product) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - 12 * 2 - 2) / 2;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 2 }}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} width={cardWidth} favorited={favorited?.(p)} onToggleFavorite={onToggleFavorite} />
      ))}
    </ScrollView>
  );
}
