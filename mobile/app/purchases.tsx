import { FlatList, Text, View } from "react-native";
import { Image } from "expo-image";
import { Link, Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../lib/api";
import { useAuth } from "../lib/auth";
import { imageUrl } from "../lib/imageUrl";
import { colors, fonts, spacing } from "../lib/theme";

// Everything bought on VYA.
//
// ⚠️ /api/mobile/purchases DOES NOT EXIST in the web repo. The shipped app called it — the path is in
// the recovered bundle — but the route is not in the codebase, so it was either lost with the app's
// source or never built and the screen always showed its empty state.
//
// This screen therefore treats a 404 as "nothing to show" rather than an error: it degrades to the
// same empty state instead of putting a red failure in front of someone who has simply not bought
// anything. Once the route exists this starts working with no change here.

type Purchase = {
  id: number | string;
  title: string;
  priceFormatted?: string;
  price?: string;
  image: string | null;
  storeName?: string;
  storeSlug?: string;
  productId?: number;
  purchasedAt?: string;
};

export default function PurchasesScreen() {
  const { user, loading } = useAuth();

  const q = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      try {
        return await apiGet<{ purchases: Purchase[] }>("/api/mobile/purchases");
      } catch (e) {
        // The route is missing server-side; an empty list is the honest render, not a crash.
        if (e instanceof ApiError && e.status === 404) return { purchases: [] };
        throw e;
      }
    },
    enabled: Boolean(user),
  });

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;

  return (
    <FlatList
      data={q.data?.purchases ?? []}
      keyExtractor={(p) => String(p.id)}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.text }}>Nothing here yet</Text>
          <Text style={{ marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" }}>
            Pieces you buy will show up here with the store you bought them from.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const row = (
          <View style={{ flexDirection: "row", gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ width: 64, height: 80, borderRadius: 6, overflow: "hidden", backgroundColor: colors.bgCard }}>
              {item.image ? <Image source={{ uri: imageUrl(item.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
            </View>
            <View style={{ flex: 1 }}>
              {item.storeName ? (
                <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.textDim }}>{item.storeName}</Text>
              ) : null}
              <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: fonts.serif, fontSize: 14, lineHeight: 19, color: colors.text }}>{item.title}</Text>
              <Text style={{ marginTop: 2, fontSize: 13, color: colors.textMuted }}>{item.priceFormatted ?? item.price ?? ""}</Text>
            </View>
          </View>
        );
        return item.productId ? <Link href={`/product/${item.productId}`}>{row}</Link> : row;
      }}
    />
  );
}
