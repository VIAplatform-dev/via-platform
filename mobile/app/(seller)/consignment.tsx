import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";
import { Button, Notice } from "../../components/seller/Form";
import { PAYOUT_METHOD_LABELS } from "../../lib/seller/consignors";
import { payoutActionFor } from "../../lib/seller/payouts";

// What is OWED first, because that is the question. Then who — and now, paying them.
//
// "Paying consignors out is on the desktop" was the last line on this screen, under a list of people
// and the exact amounts they were owed. Everything needed to act was on screen except the ability to.
//
// PAYABLE IS NOT THE SAME AS OWED and the difference is the whole design. A sale inside the return
// hold is owed but not yet payable; a sale on eBay is owed, and payable, but only by hand — the
// marketplace paid the store directly, so VYA has nothing to send. Each row says which of those it
// is rather than offering a Pay button that would fail (see lib/seller/payouts.ts).

type Tab = "owed" | "paid" | "pay";
type Summary = {
  availableCents: number;
  owedCents: number;
  onHoldCents: number;
  activity: { payee: string; item: string; netCents: number; status: "payable" | "hold" }[];
};
type PayRow = {
  id: number;
  name: string;
  method: string;
  balanceCents: number;
  payableCents: number;
  offPlatform?: { totalCents: number };
  inFlightCents?: number;
};
type Payouts = { holdDays: number; defaultMethod: string; consignors: PayRow[] };

const CHIPS: { key: Tab; label: string }[] = [
  { key: "owed", label: "Owed" },
  { key: "paid", label: "On hold" },
  { key: "pay", label: "Pay out" },
];

export default function ConsignmentScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("owed");

  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  const q = useQuery({
    queryKey: ["store", "consignment"],
    queryFn: () => apiGet<Summary>("/api/store/consignment/summary"),
    enabled: !!storeSlug,
  });
  const pay = useQuery({
    queryKey: ["store", "consignment", "payouts"],
    queryFn: () => apiGet<Payouts>("/api/store/consignment/payouts"),
    enabled: !!storeSlug && tab === "pay",
  });

  const currency = me.data?.currency ?? "USD";
  const want = tab === "owed" ? "payable" : "hold";
  const rows = (q.data?.activity ?? []).filter((a) => a.status === want);

  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function payOut(c: PayRow) {
    setError(null);
    setNote(null);
    setBusy(c.id);
    try {
      const r = await apiPost<{ message?: string; amountCents?: number }>("/api/store/consignment/payouts", {
        consignorId: c.id,
        method: c.method,
      });
      setNote(r?.message ?? `Recorded ${formatMoney(r?.amountCents ?? 0, currency)} paid to ${c.name}.`);
      await pay.refetch();
      await q.refetch();
      await qc.invalidateQueries({ queryKey: ["store", "overview", 1] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SellerScreen
      title="Consignment"
      back
      onRefresh={() => { void q.refetch(); void pay.refetch(); }}
      refreshing={q.isRefetching || pay.isRefetching}
    >
      <Chips options={CHIPS} value={tab} onChange={setTab} />

      {tab === "pay" ? (
        <>
          {pay.isError ? (
            <Empty>Couldn&apos;t load who&apos;s due.</Empty>
          ) : (pay.data?.consignors ?? []).length === 0 && !pay.isPending ? (
            <Empty>Nobody to pay right now.</Empty>
          ) : (
            (pay.data?.consignors ?? []).map((c) => {
              const action = payoutActionFor(c, pay.data?.defaultMethod);
              return (
                <View key={c.id} style={{ paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{c.name}</Text>
                      <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                        {PAYOUT_METHOD_LABELS[c.method] ?? c.method.replace(/_/g, " ")} · {formatMoney(c.balanceCents, currency)} owed
                      </Text>
                    </View>
                    {action.canPay ? (
                      <Pressable
                        disabled={busy !== null}
                        onPress={() => void payOut(c)}
                        style={{ backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, opacity: busy ? 0.6 : 1 }}
                      >
                        <Text style={{ color: colors.accentText, fontSize: 13, fontWeight: "600" }}>
                          {busy === c.id ? "…" : `${action.verb} ${formatMoney(action.amountCents, currency)}`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {action.note ? (
                    <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xs, lineHeight: 17 }}>{action.note}</Text>
                  ) : null}
                </View>
              );
            })
          )}

          {note ? <Notice tone="good">{note}</Notice> : null}
          {error ? <Notice>{error}</Notice> : null}

          {pay.data?.holdDays ? (
            <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
              A sale becomes payable {pay.data.holdDays} days after it settles, so a refund never comes
              out of money you&apos;ve already handed over.
            </Text>
          ) : null}
        </>
      ) : q.isError ? (
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

          <Button label="Consignors" kind="secondary" onPress={() => router.push("/(seller)/consignors")} />
        </>
      )}
    </SellerScreen>
  );
}
