import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";

// Codes in mono so they are readable at a glance, usage counts, and live/ended as a chip.

type Discount = { id: number; code: string; label: string | null; kind: string; value: number | null; active: boolean; used?: number };

export default function DiscountsScreen() {
  const { storeSlug } = useAuth();
  const q = useQuery({
    queryKey: ["store", "discounts"],
    queryFn: () => apiGet<{ discounts: Discount[] }>("/api/store/discounts"),
    enabled: !!storeSlug,
  });

  const list = q.data?.discounts ?? [];

  return (
    <SellerScreen title="Discounts" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your discounts.</Empty>
      ) : list.length === 0 && !q.isPending ? (
        <Empty>No discount codes yet.</Empty>
      ) : (
        list.map((d) => (
          <View key={d.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Menlo", fontSize: 14, color: colors.text, letterSpacing: 0.5 }}>{d.code}</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 3 }}>
                {d.label ?? (d.kind === "percent" ? `${d.value}% off` : d.value ? `${d.value} off` : "Discount")}
                {typeof d.used === "number" ? ` · ${d.used} used` : ""}
              </Text>
            </View>
            <View style={{ paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.chip }}>
              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: "700", color: d.active ? colors.positive : colors.textMuted }}>
                {d.active ? "LIVE" : "ENDED"}
              </Text>
            </View>
          </View>
        ))
      )}
      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
        Creating and editing codes is on the desktop.
      </Text>
    </SellerScreen>
  );
}
