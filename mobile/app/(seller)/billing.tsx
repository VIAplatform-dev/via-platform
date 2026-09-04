import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";

// The plan card in burgundy so it reads as a statement rather than a row.

type Billing = {
  configured: boolean;
  trialDays: number;
  current: { tier: string; interval: string; status: string; plan: string | null; currentPeriodEnd: string | null };
};

export default function BillingScreen() {
  const { storeSlug } = useAuth();
  const q = useQuery({
    queryKey: ["store", "billing"],
    queryFn: () => apiGet<Billing>("/api/store/billing"),
    enabled: !!storeSlug,
  });
  const c = q.data?.current;

  return (
    <SellerScreen title="Plan & billing" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your plan.</Empty>
      ) : !c ? null : (
        <>
          <View style={{ borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, padding: spacing.xl }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.accent }}>YOUR PLAN</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.accent, marginTop: spacing.sm, textTransform: "capitalize" }}>
              {c.tier}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.sm }}>
              Billed {c.interval}
              {c.currentPeriodEnd ? ` · renews ${new Date(c.currentPeriodEnd).toLocaleDateString()}` : ""}
            </Text>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <View style={{ flexDirection: "row", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>Status</Text>
              <Text style={{ fontSize: 15, color: colors.textMuted, textTransform: "capitalize" }}>{c.status}</Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
            Changing plan, invoices and the card on file are on the desktop.
          </Text>
        </>
      )}
    </SellerScreen>
  );
}
