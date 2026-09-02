import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

// The save control.
//
// Feather has no filled heart — only an outline — so a "saved" state could do nothing but darken,
// which is what it did. Ionicons ships both, and the state now reads at a glance from across the
// grid: outline for unsaved, solid burgundy for saved.

export default function HeartButton({
  favorited, onPress, size = 18, onImage,
}: { favorited?: boolean; onPress: () => void; size?: number; onImage?: boolean }) {
  const glyph = (
    <Ionicons
      name={favorited ? "heart" : "heart-outline"}
      size={size}
      color={colors.accent}
      style={favorited ? undefined : { opacity: 0.6 }}
    />
  );

  if (!onImage) return <Pressable onPress={onPress} hitSlop={12}>{glyph}</Pressable>;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={{
        width: size + 18, height: size + 18, borderRadius: (size + 18) / 2,
        backgroundColor: colors.overlayChip, alignItems: "center", justifyContent: "center",
      }}
    >
      {glyph}
    </Pressable>
  );
}
