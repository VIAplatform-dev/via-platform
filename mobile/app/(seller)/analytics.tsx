import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { formatMoney, percentDelta } from "../../lib/seller/home";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";

// An overview, not a report.
//
// One number she came for, three counts, and what sold. No axes, no date pickers, no drill-down —
// that is the desk's job. The mockups draw a sparkline; it is omitted rather than faked, because a
// chart with no scale is decoration and this screen is meant to be read in two seconds.

type Range = "7" | "30" | "365";
type Overview = {
  revenueCents: number;
  orders: number;
  aovCents: number;
  prior: { revenueCents: number };
  inventory: { active: number; sold: number };
  recentSales: { title: string; amountCents: number; at: string | null }[];
};

const RANGES: { key: Range; label: string }[] = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "365", label: "Year" },
];

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.chip, borderRadius: 12, padding: spacing.lg }}>
      <Text style={{ fontSize: 10, letterSpacing: 1.3, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 20, color: colors.text, fontWeight: "700", marginTop: spacing.sm }}>{value}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const { storeSlug } = useAuth();
  const [range, setRange] = useState<Range>("7");

  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  const q = useQuery({
    queryKey: ["store", "overview", range],
    queryFn: () => apiGet<Overview>(`/api/store/analytics/overview?days=${range}`),
    enabled: !!storeSlug,
  });

  const currency = me.data?.currency ?? "USD";
  const d = q.data;
  const delta = d ? percentDelta(d.revenueCents, d.prior.revenueCents) : null;

  return (
    <SellerScreen title="Analytics" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Chips options={RANGES} value={range} onChange={setRange} />

      {q.isError ? (
        <Empty>Couldn&apos;t load your numbers. Pull to try again.</Empty>
      ) : (
        <>
          <Text style={{ fontFamily: fonts.serif, fontSize: 34, color: colors.text, marginTop: spacing.md }}>
            {d ? formatMoney(d.revenueCents, currency) : "—"}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
            Taken this period
            {delta !== null ? ` · ${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta)}% on last` : ""}
          </Text>

          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
            <Cell label="ORDERS" value={d ? String(d.orders) : "—"} />
            <Cell label="AVERAGE" value={d ? formatMoney(d.aovCents, currency) : "—"} />
            <Cell label="LIVE" value={d ? String(d.inventory.active) : "—"} />
          </View>

          <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm }}>
            Best this period
          </Text>
          {(d?.recentSales ?? []).length === 0 ? (
            <Empty>Nothing sold in this period.</Empty>
          ) : (
            (d?.recentSales ?? []).slice(0, 5).map((s, i) => (
              <View key={`${s.title}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 13, color: colors.textDim, width: 16 }}>{i + 1}</Text>
                <Text style={{ flex: 1, fontSize: 14, color: colors.text }} numberOfLines={1}>{s.title}</Text>
                <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>{formatMoney(s.amountCents, currency)}</Text>
              </View>
            ))
          )}
        </>
      )}
    </SellerScreen>
  );
}
