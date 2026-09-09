import { Image, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { colors, spacing, fonts } from "../../../lib/theme";
import { formatMoney } from "../../../lib/seller/home";
import { SellerScreen } from "../../../components/seller/Screen";

// One piece, reached by tapping anything in Inventory.
//
// Photos big, price and state together, views and saves as the only analytics that belong here —
// the rest is the Analytics screen's job. Two buttons: edit, or mark it sold.

type Item = {
  id: string;
  title: string;
  priceCents: number;
  currency: string;
  images: string[];
  status: string;
  views?: number;
  favorites?: number;
};

export default function PieceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeSlug } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["store", "items"],
    queryFn: () => apiGet<{ items: Item[] }>("/api/store/items"),
    enabled: !!storeSlug,
  });
  const item = (q.data?.items ?? []).find((i) => i.id === id);

  const markSold = useMutation({
    mutationFn: () => apiPatch(`/api/store/items/${id}`, { status: "sold" }),
    // Refetch rather than patching the cache by hand: the server decides what "sold" implies
    // (a reserved Market Mode hold, a cross-listing pull) and guessing here would drift.
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["store", "items"] }); },
  });

  if (q.isPending) return <SellerScreen title="Piece" back><View /></SellerScreen>;
  if (!item) {
    return (
      <SellerScreen title="Piece" back>
        <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.xl }}>
          This piece isn&apos;t in your inventory any more.
        </Text>
      </SellerScreen>
    );
  }

  const sold = item.status === "sold";

  return (
    <SellerScreen title="Piece" back>
      {item.images?.[0] ? (
        <Image source={{ uri: item.images[0] }} style={{ width: "100%", height: 340, borderRadius: 12, backgroundColor: colors.chip }} />
      ) : (
        <View style={{ width: "100%", height: 340, borderRadius: 12, backgroundColor: colors.chip }} />
      )}

      <Text style={{ fontSize: 17, color: colors.text, fontWeight: "600", marginTop: spacing.lg }}>{item.title}</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>
          {formatMoney(item.priceCents, item.currency)}
        </Text>
        <View style={{ paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.chip }}>
          <Text style={{ fontSize: 11, letterSpacing: 1, color: sold ? colors.textMuted : colors.positive, fontWeight: "700" }}>
            {sold ? "SOLD" : item.status === "draft" ? "DRAFT" : "LIVE"}
          </Text>
        </View>
        <Text style={{ marginLeft: "auto", fontSize: 13, color: colors.textMuted }}>
          {item.views ?? 0} views · {item.favorites ?? 0} saves
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
        <Pressable style={{ flex: 1, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center" }}>
          <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "600" }}>Edit</Text>
        </Pressable>
        <Pressable
          disabled={sold || markSold.isPending}
          onPress={() => markSold.mutate()}
          style={{ flex: 1, backgroundColor: colors.chip, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center", opacity: sold ? 0.5 : 1 }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {markSold.isPending ? "Marking…" : sold ? "Sold" : "Mark sold"}
          </Text>
        </Pressable>
      </View>

      {markSold.isError ? (
        <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.md }}>
          Couldn&apos;t mark it sold. Try again.
        </Text>
      ) : null}
    </SellerScreen>
  );
}
