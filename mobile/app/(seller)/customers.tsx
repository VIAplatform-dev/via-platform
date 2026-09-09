import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { SellerScreen, Empty } from "../../components/seller/Screen";

// Customers, sorted by what they have spent — not alphabetically. The one line that matters is at
// the bottom: how much of her business is repeat.

type Customer = { email: string; name: string | null; location: string | null; orders: number; spentCents: number };

export default function CustomersScreen() {
  const { storeSlug } = useAuth();
  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  const q = useQuery({
    queryKey: ["store", "customers"],
    queryFn: () => apiGet<{ customers: Customer[]; buyers: number }>("/api/store/customers"),
    enabled: !!storeSlug,
  });

  const currency = me.data?.currency ?? "USD";
  const buyers = (q.data?.customers ?? []).filter((c) => c.orders > 0);
  const ranked = [...buyers].sort((a, b) => b.spentCents - a.spentCents);
  const repeat = buyers.filter((c) => c.orders > 1).length;
  const repeatPct = buyers.length ? Math.round((repeat / buyers.length) * 100) : 0;

  return (
    <SellerScreen title="Customers" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your customers.</Empty>
      ) : ranked.length === 0 && !q.isPending ? (
        <Empty>No customers yet.</Empty>
      ) : (
        <>
          {ranked.slice(0, 50).map((c) => (
            <View key={c.email} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.chip }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{c.name ?? c.email}</Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                  {c.orders} {c.orders === 1 ? "order" : "orders"}{c.location ? ` · ${c.location}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>{formatMoney(c.spentCents, currency)}</Text>
                <Text style={{ fontSize: 11, color: colors.textDim }}>lifetime</Text>
              </View>
            </View>
          ))}
          {buyers.length ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.lg }}>
              <Text style={{ color: colors.positive, fontWeight: "700" }}>{repeatPct}%</Text> of your buyers have ordered more than once.
            </Text>
          ) : null}
        </>
      )}
    </SellerScreen>
  );
}
