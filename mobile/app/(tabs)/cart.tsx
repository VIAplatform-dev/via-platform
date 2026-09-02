import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { Link } from "expo-router";
import { useCart } from "../../lib/cart";
import { API_BASE_URL } from "../../lib/api";
import AppHeader from "../../components/AppHeader";
import { formatPrice, priceToNumber } from "../../lib/types";
import { imageUrl } from "../../lib/imageUrl";
import { colors, eyebrow, fonts, spacing } from "../../lib/theme";

// Your Bag.
//
// VYA never takes the money — every piece belongs to a store that is its own merchant with its own
// checkout. So a bag spanning three stores is three payments, and the screen has to be honest about
// that BEFORE anyone starts: each store gets its own subtotal and its own Checkout button, and the
// total across all of them is stated at the bottom so nobody is surprised by the sum.

export default function CartScreen() {
  const { byStore, lines, count, remove, clearStore } = useCart();

  const storeTotal = (ls: { price: string }[]) => ls.reduce((s, l) => s + priceToNumber(l.price), 0);
  const grandTotal = storeTotal(lines);

  async function checkout(storeSlug: string, storeName: string) {
    try {
      await WebBrowser.openBrowserAsync(`${API_BASE_URL}/store/${storeSlug}/cart`, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      Alert.alert("Couldn’t open checkout", `Try visiting ${storeName} from the store page.`);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Cart" />

      {!count ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>Your bag is empty</Text>
          <Text style={{ marginTop: spacing.sm, fontSize: 15, lineHeight: 21, color: colors.textMuted, textAlign: "center" }}>
            Tap the bag icon on any product to save it for checkout.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 34, color: colors.text }}>Your Bag</Text>
          <Text style={[eyebrow, { marginTop: 4 }]}>
            {count} {count === 1 ? "item" : "items"} · {byStore.length} {byStore.length === 1 ? "store" : "stores"}
          </Text>

          {byStore.map((group) => (
            <View key={group.storeSlug} style={{ marginTop: spacing.xl }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Link href={`/store/${group.storeSlug}`} asChild>
                  <Pressable><Text style={eyebrow}>{group.storeName}</Text></Pressable>
                </Link>
                <Pressable onPress={() => clearStore(group.storeSlug)} hitSlop={8}>
                  <Text style={{ fontSize: 13, color: colors.textDim }}>Clear</Text>
                </Pressable>
              </View>

              {group.lines.map((line) => (
                <View key={line.productId} style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
                  <Link href={`/product/${line.productId}`} asChild>
                    <Pressable>
                      <View style={{ width: 84, height: 100, backgroundColor: colors.bgCard, overflow: "hidden" }}>
                        {line.image ? <Image source={{ uri: imageUrl(line.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
                      </View>
                    </Pressable>
                  </Link>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: "600", lineHeight: 21, color: colors.text }}>{line.name}</Text>
                    {line.size ? <Text style={{ marginTop: 3, fontSize: 14, color: colors.textMuted }}>Size: {line.size}</Text> : null}
                    <Text style={{ marginTop: 3, fontSize: 16, color: colors.text }}>{line.price}</Text>
                  </View>
                  <Pressable onPress={() => remove(line.productId)} hitSlop={10} style={{ paddingTop: 2 }}>
                    <Feather name="x" size={21} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}

              <View style={{ height: 1, backgroundColor: colors.border, marginTop: spacing.lg }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg }}>
                <Text style={eyebrow}>Subtotal</Text>
                <Text style={{ fontSize: 20, color: colors.text }}>{formatPrice(storeTotal(group.lines))}</Text>
              </View>

              <Pressable
                onPress={() => checkout(group.storeSlug, group.storeName)}
                style={{ marginTop: spacing.lg, backgroundColor: colors.accent, paddingVertical: spacing.lg, alignItems: "center" }}
              >
                <Text style={{ color: colors.accentText, fontSize: 15, letterSpacing: 1.8, textTransform: "uppercase" }}>
                  Checkout · {group.storeName}
                </Text>
              </Pressable>
              <Text style={{ marginTop: spacing.md, fontSize: 14, color: colors.textMuted, textAlign: "center" }}>
                You’ll complete payment securely on {group.storeName}.
              </Text>
            </View>
          ))}

          {/* Stated even for a single store, because the number people check before leaving the app
              is the one they are about to spend in total. */}
          <View style={{ height: 1, backgroundColor: colors.accent, marginTop: spacing.xxl }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg }}>
            <Text style={[eyebrow, { color: colors.text }]}>Total across all stores</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 27, color: colors.text }}>{formatPrice(grandTotal)}</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
