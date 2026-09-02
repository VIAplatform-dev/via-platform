import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../lib/cart";
import { colors, fonts, spacing } from "../lib/theme";

// Back / search / bag on white pucks, floating over whatever is behind them.
//
// Used on product, store, collection and category — screens that open big photography. A stack
// header would crop that, and worse, expo-router labels its back button with the route it came
// from, which is how "(tabs)" ended up on screen.

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      {children}
    </View>
  );
}

export default function FloatingNav({ title, showShare, onShare }: { title?: string; showShare?: boolean; onShare?: () => void }) {
  const insets = useSafeAreaInsets();
  const { count } = useCart();

  return (
    <View style={{ position: "absolute", top: insets.top + spacing.sm, left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between", zIndex: 10 }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}>
        <Pill><Feather name="chevron-left" size={24} color={colors.text} /></Pill>
      </Pressable>

      {/* Centred absolutely so it stays optically centred whatever the pills either side weigh. */}
      {title ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>{title}</Text>
        </View>
      ) : null}
      <Pill>
        <Link href="/search" asChild><Pressable hitSlop={6}><Feather name="search" size={21} color={colors.text} /></Pressable></Link>
        <Link href="/cart" asChild>
          <Pressable hitSlop={6}>
            <Feather name="shopping-bag" size={21} color={colors.text} />
            {count > 0 ? (
              <View style={{ position: "absolute", top: -5, right: -6, width: 15, height: 15, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.accentText, fontSize: 9, fontWeight: "600" }}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        </Link>
        {showShare ? (
          <Pressable hitSlop={6} onPress={onShare}><Feather name="share" size={21} color={colors.text} /></Pressable>
        ) : null}
      </Pill>
    </View>
  );
}
