import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";

// "When do I get paid" — answered in the first line.
//
// The mockups show a next-payout AMOUNT and the bank account it lands in. /api/store/payments
// returns neither: it reports Stripe Connect status and the payout SCHEDULE. Rather than invent a
// number, this screen answers the same question with what is actually known — when payouts run and
// whether her account can receive them. The amount belongs here the day the API returns it.

type Payments = {
  configured: boolean;
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  payoutDelayDays: number;
  returnWindowDays: number;
  payoutNotice: string | null;
};

export default function PayoutsScreen() {
  const { storeSlug } = useAuth();
  const q = useQuery({
    queryKey: ["store", "payments"],
    queryFn: () => apiGet<Payments>("/api/store/payments"),
    enabled: !!storeSlug,
  });
  const p = q.data;

  return (
    <SellerScreen title="Payouts" back onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isError ? (
        <Empty>Couldn&apos;t load your payout settings.</Empty>
      ) : !p ? null : (
        <>
          <View style={{ backgroundColor: colors.chip, borderRadius: 14, padding: spacing.xl }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.4, color: colors.textMuted }}>PAYOUTS</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 28, color: colors.text, marginTop: spacing.sm }}>
              {p.payoutsEnabled ? "Active" : p.connected ? "Finishing setup" : "Not connected"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.sm }}>
              {p.payoutsEnabled
                ? `Paid out ${p.payoutDelayDays} days after an order settles.`
                : p.connected
                  ? "Stripe still needs a few details before it can pay you."
                  : "Connect Stripe on the desktop to start taking payments."}
            </Text>
          </View>

          {p.payoutNotice ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.lg, lineHeight: 19 }}>{p.payoutNotice}</Text>
          ) : null}

          <View style={{ marginTop: spacing.xl }}>
            <Row label="Taking payments" value={p.chargesEnabled ? "Yes" : "No"} />
            <Row label="Payout delay" value={`${p.payoutDelayDays} days`} />
            <Row label="Return window" value={`${p.returnWindowDays} days`} />
          </View>

          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
            Bank details and the payout schedule are changed on the desktop.
          </Text>
        </>
      )}
    </SellerScreen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{label}</Text>
      <Text style={{ fontSize: 15, color: colors.textMuted }}>{value}</Text>
    </View>
  );
}
