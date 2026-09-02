import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../lib/cart";
import { colors, fonts, spacing } from "../lib/theme";

// The bar every tab wears: a centred serif title, with search and the bag pinned right.
//
// The bag lives HERE rather than in the tab bar, which is what frees the bar to hold five icons
// instead of seven. Its badge is the only number in the app's chrome, so it is the one thing in the
// header that is allowed to be filled rather than outlined.

export default function AppHeader({ title, wordmark }: { title?: string; wordmark?: boolean }) {
  const { count } = useCart();
  // The tab screens draw their own header, so nothing above them reserves the status bar. Without
  // this the wordmark sits underneath the clock and the notch — which is exactly what it did.
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
        paddingTop: insets.top + spacing.sm,
        backgroundColor: colors.bg,
      }}
    >
      {wordmark ? (
        // The real logotype — Georgia was a stand-in and never matched the mark.
        <Image
          source={require("../assets/wordmark.png")}
          style={{ width: 92, height: 30 }}
          contentFit="contain"
          transition={0}
        />
      ) : (
        <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>{title}</Text>
      )}

      <View style={{ position: "absolute", right: spacing.lg, bottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        <Link href="/search" asChild>
          <Pressable hitSlop={10}>
            <Feather name="search" size={23} color={colors.text} />
          </Pressable>
        </Link>
        <Link href="/cart" asChild>
          <Pressable hitSlop={10}>
            <Feather name="shopping-bag" size={23} color={colors.text} />
            {count > 0 ? (
              <View
                style={{
                  position: "absolute", top: -7, right: -8, minWidth: 18, height: 18, borderRadius: 9,
                  backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
                }}
              >
                <Text style={{ color: colors.accentText, fontSize: 11, fontWeight: "600" }}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        </Link>
      </View>
    </View>
  );
}
