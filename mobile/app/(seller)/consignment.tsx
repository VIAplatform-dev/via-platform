import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";

// What is OWED first, because that is the question. Then who. Consignors and history behind chips.

type Tab = "owed" | "paid";
type Summary = {
  availableCents: number;
  owedCents: number;
  onHoldCents: number;
  activity: { payee: string; item: string; netCents: number; status: "payable" | "hold" }[];
};

const CHIPS: { key: Tab; label: string }[] = [
  { key: "owed", label: "Owed" },
  { key: "paid", label: "On hold" },
];

export default function ConsignmentScreen() {
  const { storeSlug } = useAuth();
  const [tab, setTab] = useState<Tab>("owed");

  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  const q = useQuery({
    queryKey: ["store", "consignment"],
    queryFn: () => apiGet<Summary>("/api/store/consignment/summary"),
    enabled: !!storeSlug,
  });

  const currency = me.data?.currency ?? "USD";
  const want = tab === "owed" ? "payable" : "hold";
  const rows = (q.data?.activity ?? []).filter((a) => a.status === want);

  return (
    <SellerScreen title="Consignment" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Chips options={CHIPS} value={tab} onChange={setTab} />

      {q.isError ? (
        <Empty>Couldn&apos;t load consignment.</Empty>
      ) : (
        <>
          <View style={{ backgroundColor: colors.chip, borderRadius: 14, padding: spacing.xl, marginTop: spacing.sm }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.textMuted }}>
              {tab === "owed" ? "DUE NOW" : "STILL ON HOLD"}
            </Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.text, marginTop: spacing.sm }}>
              {q.data ? formatMoney(tab === "owed" ? q.data.availableCents : q.data.onHoldCents, currency) : "—"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
              {rows.length} {rows.length === 1 ? "consignor" : "consignors"}
            </Text>
          </View>

          {rows.length === 0 && !q.isPending ? (
            <Empty>{tab === "owed" ? "Nothing due right now." : "Nothing on hold."}</Empty>
          ) : (
            rows.map((a, i) => (
              <View key={`${a.payee}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.chip }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{a.payee}</Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{a.item}</Text>
                </View>
                <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>{formatMoney(a.netCents, currency)}</Text>
              </View>
            ))
          )}

          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
            Paying consignors out is on the desktop.
          </Text>
        </>
      )}
    </SellerScreen>
  );
}
