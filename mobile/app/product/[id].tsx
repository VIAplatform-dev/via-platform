import { useState } from "react";
import { ActivityIndicator, Alert, PixelRatio, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL, apiGet } from "../../lib/api";
import { useCart } from "../../lib/cart";
import { useFavorites } from "../../lib/useFavorites";
import { htmlToText } from "../../lib/html";
import { useTrackedView } from "../../lib/track";
import { imageUrl, widthForLayout } from "../../lib/imageUrl";
import Accordion from "../../components/Accordion";
import ProductRail from "../../components/ProductRail";
import HeartButton from "../../components/HeartButton";
import SectionHeading from "../../components/SectionHeading";
import type { Product } from "../../lib/types";
import { colors, fonts, spacing } from "../../lib/theme";

// One piece.
//
// The photographs run full-bleed to the top of the screen with the controls floating on white pucks
// over them: there is no navigation bar, because a bar would crop the image for the sake of a back
// arrow. Everything below the fold answers the three questions a vintage buyer has: does it fit, is
// it real, and can I send it back.

type ProductDetail = {
  id: number; title: string; description: string | null;
  priceFormatted: string; image: string | null; images: string[]; size: string | null;
  storeSlug: string; storeName: string; category?: string | null;
  storePolicies: { authenticity: string | null; shipping: string | null; returns: string | null };
};


export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  // The photograph fills the width of the phone, so this is the one place that asks for a big
  // image, but still the size it is drawn at, not the multi-megabyte original off the store's CDN.
  const px = widthForLayout(width, PixelRatio.get());
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const { isFavorited, toggleFavorite } = useFavorites();
  const [active, setActive] = useState(0);

  const q = useQuery({
    queryKey: ["product", id],
    queryFn: () => apiGet<ProductDetail>(`/api/public/product/${id}`),
    enabled: Boolean(id),
  });

  // Records the view on open and its dwell time on leave. See lib/track.ts.
  useTrackedView(q.data?.storeSlug, q.data?.id);

  const more = useQuery({
    queryKey: ["store-more", q.data?.storeSlug],
    queryFn: () => apiGet<{ products: Product[] }>(`/api/public/store/${q.data!.storeSlug}`),
    enabled: Boolean(q.data?.storeSlug),
  });

  // Similar = the same broad category, sorted by what people actually respond to. The API infers
  // `category` from the title, so this is the closest thing to "more like this" without an
  // embedding index.
  const alsoLike = useQuery({
    queryKey: ["also-like", q.data?.category],
    queryFn: () => apiGet<{ products: Product[] }>(
      `/api/public/feed?limit=24&sort=popular${q.data?.category ? `&categories=${encodeURIComponent(q.data.category)}` : ""}`,
    ),
    enabled: Boolean(q.data),
  });

  if (q.isLoading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.text} /></View>;
  }
  if (q.isError || !q.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.text }}>This piece is gone.</Text>
        <Text style={{ marginTop: spacing.sm, fontSize: 14, color: colors.textMuted, textAlign: "center" }}>Vintage is one-of-one. It may have sold.</Text>
      </View>
    );
  }

  const p = q.data;
  const gallery = p.images?.length ? p.images : p.image ? [p.image] : [];
  const asProduct: Product = { id: p.id, name: p.title, storeSlug: p.storeSlug, storeName: p.storeName, price: p.priceFormatted, image: p.image, images: p.images, size: p.size };
  const inCart = cart.has(p.id);
  const fav = isFavorited(asProduct);
  // Shopify's editor wraps every line in markup; rendered raw it drowns the description.
  const details = htmlToText(p.description);

  function addToBag() {
    const { added } = cart.add(asProduct);
    if (!added) Alert.alert("Already in cart", "This piece is already in your bag.");
  }

  async function buyNow() {
    cart.add(asProduct);
    await WebBrowser.openBrowserAsync(`${API_BASE_URL}/store/${p.storeSlug}/cart`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    }).catch(() => Alert.alert("Couldn’t open checkout", `Try ${p.storeName} from the store page.`));
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* A REAL BAR, ABOVE THE PHOTOGRAPH.
          These four controls used to float in pills ON the image, starting at the very top of the
          screen. Two things went wrong with that. The photograph ran under the status bar and the
          Dynamic Island, so the top of every piece was obscured by the clock and the battery: a
          shot framed on the garment lost its garment. And a translucent pill over a photograph is
          only legible against the half of photographs that happen to be dark there.
          Cream, above the image, with the status bar reserved. The picture starts where the bar
          ends, so nothing is cropped by hardware. */}
      <View
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.lg,
          backgroundColor: colors.bg,
        }}
      >
        <Pressable hitSlop={10} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}>
          <Feather name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
          <Link href="/(tabs)/shop" asChild>
            <Pressable hitSlop={10} accessibilityLabel="Search"><Feather name="search" size={22} color={colors.text} /></Pressable>
          </Link>
          <Link href="/cart" asChild>
            <Pressable hitSlop={10} accessibilityLabel="Bag">
              <Feather name="shopping-bag" size={22} color={colors.text} />
              {cart.count > 0 ? (
                <View style={{ position: "absolute", top: -6, right: -7, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                  <Text style={{ color: colors.accentText, fontSize: 10, fontWeight: "600" }}>{cart.count}</Text>
                </View>
              ) : null}
            </Pressable>
          </Link>
          <Pressable
            hitSlop={10}
            accessibilityLabel="Share"
            onPress={() => { void Share.share({ message: `${p.title}: ${p.priceFormatted} at ${p.storeName} on VYA\n${API_BASE_URL}/products/${p.id}` }); }}
          >
            <Feather name="share" size={21} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {gallery.map((uri) => (
            <Image key={uri} source={{ uri: imageUrl(uri, px) }} style={{ width, height: width * 1.2, backgroundColor: colors.bgCard }} contentFit="cover" transition={180} />
          ))}
        </ScrollView>

        {gallery.length > 1 ? (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 7, paddingVertical: spacing.md }}>
            {gallery.map((uri, i) => (
              <View key={uri} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === active ? colors.accent : colors.border }} />
            ))}
          </View>
        ) : null}

        <View style={{ paddingHorizontal: spacing.lg }}>
          <Link href={`/store/${p.storeSlug}`} asChild>
            <Pressable>
              <Text style={{ fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase", color: colors.textMuted, textDecorationLine: "underline" }}>
                {p.storeName}
              </Text>
            </Pressable>
          </Link>

          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.lg, marginTop: 4 }}>
            <Text style={{ flex: 1, fontFamily: fonts.serif, fontSize: 26, lineHeight: 32, color: colors.text }}>{p.title}</Text>
            <View style={{ paddingTop: 4 }}>
              <HeartButton favorited={fav} onPress={() => toggleFavorite(asProduct)} size={27} />
            </View>
          </View>

          <Text style={{ marginTop: spacing.sm, fontSize: 21, color: colors.text }}>{p.priceFormatted}</Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
            <Feather name="check" size={14} color={colors.textMuted} />
            <Text style={{ fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase", color: colors.textMuted }}>VYA Verified</Text>
          </View>
          {p.size ? <Text style={{ marginTop: 4, fontSize: 15, color: colors.textMuted }}>Size: {p.size}</Text> : null}

          <Pressable onPress={buyNow} style={{ marginTop: spacing.lg, backgroundColor: colors.accent, paddingVertical: spacing.lg, alignItems: "center" }}>
            <Text style={{ color: colors.accentText, fontSize: 15, letterSpacing: 2, textTransform: "uppercase" }}>Buy now</Text>
          </Pressable>

          <Pressable
            onPress={addToBag}
            style={{ marginTop: spacing.md, borderWidth: 1, borderColor: colors.accent, paddingVertical: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md }}
          >
            <Feather name="shopping-bag" size={17} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 15, letterSpacing: 2, textTransform: "uppercase" }}>{inCart ? "In cart" : "Add to cart"}</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push({ pathname: "/messages/new", params: { productId: String(p.id), storeName: p.storeName, title: p.title, image: p.image ?? "" } })}
            style={{ marginTop: spacing.md, backgroundColor: colors.bgAlt, paddingVertical: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md }}
          >
            <Feather name="message-circle" size={17} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 16 }}>Message {p.storeName}</Text>
          </Pressable>

          <View style={{ marginTop: spacing.xl }}>
            <Accordion label="Product Details" body={details || null} defaultOpen />
            <Accordion label="Authenticity & Curation" body={p.storePolicies?.authenticity ?? null} />
            <Accordion label="Shipping" body={p.storePolicies?.shipping ?? null} />
            <Accordion label="Returns" body={p.storePolicies?.returns ?? null} />
          </View>
        </View>

        {(more.data?.products ?? []).filter((x) => x.id !== p.id).length ? (
          <View style={{ marginTop: spacing.xxl }}>
            <SectionHeading eyebrow="More from this store" title={p.storeName} seeAllHref={`/store/${p.storeSlug}`} />
            <ProductRail
              products={more.data!.products.filter((x) => x.id !== p.id).slice(0, 12)}
              favorited={isFavorited}
              onToggleFavorite={toggleFavorite}
            />
          </View>
        ) : null}

        {(alsoLike.data?.products ?? []).length ? (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, fontFamily: fonts.serif, fontSize: 30, color: colors.text }}>
              You might also like
            </Text>
            <ProductRail
              products={alsoLike.data!.products.filter((x) => x.id !== p.id).slice(0, 12)}
              favorited={isFavorited}
              onToggleFavorite={toggleFavorite}
            />
          </View>
        ) : null}
      </ScrollView>

    </View>
  );
}
