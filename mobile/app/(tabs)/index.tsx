import { useCallback, useEffect, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { Redirect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFavorites } from "../../lib/useFavorites";
import { loadSizes } from "../../lib/sizes";
import AppHeader from "../../components/AppHeader";
import CategoryStrip from "../../components/CategoryStrip";
import SectionHeading from "../../components/SectionHeading";
import CollectionRail, { type CollectionCard } from "../../components/CollectionRail";
import ProductCard from "../../components/ProductCard";
import type { Product } from "../../lib/types";
import { colors, spacing } from "../../lib/theme";

// Home is a magazine front page, not a feed: several named sections, each a different shape.
// New Arrivals is a two-up row (not a full grid) so Collection and Curated For You are reachable
// without endless scrolling — the sections are the navigation.

export default function HomeScreen() {
  const { user, storeSlug, loading } = useAuth();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const { favorites, isFavorited, toggleFavorite } = useFavorites();
  const [sizes, setSizes] = useState<string[]>([]);
  useEffect(() => { loadSizes().then(setSizes); }, []);
  const cardWidth = (width - 12 * 2 - 2) / 2;

  const arrivals = useQuery({
    queryKey: ["home-arrivals"],
    queryFn: () => apiGet<{ products: Product[] }>("/api/public/new-arrivals?limit=4"),
    enabled: Boolean(user),
  });
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => apiGet<{ collections: CollectionCard[] }>("/api/public/collections"),
    enabled: Boolean(user),
  });
  // The endpoint ranks on clicks, favourites and views server-side, but also takes these as query
  // signals so the feed is personal on the FIRST session — before any view history exists.
  const favIds = favorites.map((f) => f.id).slice(0, 60).join(",");
  const forYou = useQuery({
    queryKey: ["for-you", favIds, sizes.join(",")],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "40" });
      if (favIds) p.set("favs", favIds);
      if (sizes.length) p.set("sizes", sizes.join(","));
      return apiGet<{ products: Product[]; personalized: boolean }>(`/api/public/for-you?${p.toString()}`);
    },
    enabled: Boolean(user),
  });

  const row = useCallback(
    (products: Product[]) => (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, paddingHorizontal: 12 }}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} width={cardWidth} favorited={isFavorited(p)} onToggleFavorite={toggleFavorite} />
        ))}
      </View>
    ),
    [cardWidth, isFavorited, toggleFavorite],
  );

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;
  // A store owner gets the seller app, not the shopper one. Both live in this bundle — sellers are
  // shoppers too, so a second binary would mean a second listing and review cycle — and `storeSlug`
  // (null for shoppers) is the whole switch. Sign-in lands on "/", so guarding here covers it.
  //
  // GUARDED BY isFocused, and this is not optional. This screen stays MOUNTED underneath the
  // seller group once we redirect, so it keeps re-rendering — and a bare <Redirect> fires on every
  // render, navigating again and again. That is a visible loop: the app appears to refresh and
  // swipe forever. Only the focused screen is allowed to redirect.
  if (storeSlug && isFocused) return <Redirect href="/(seller)" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader wordmark />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <CategoryStrip />

        <View style={{ marginTop: spacing.lg }}>
          <SectionHeading eyebrow="Just in" title="New Arrivals" seeAllHref="/(tabs)/new-arrivals" />
          {row(arrivals.data?.products ?? [])}
        </View>

        {(collections.data?.collections ?? []).length ? (
          <View style={{ marginTop: spacing.lg }}>
            <SectionHeading eyebrow="Shop by" title="Collection" />
            <CollectionRail collections={collections.data!.collections} />
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xxl }}>
          <SectionHeading eyebrow="Curated for" title="You" />
          {row(forYou.data?.products ?? [])}
        </View>
      </ScrollView>
    </View>
  );
}
