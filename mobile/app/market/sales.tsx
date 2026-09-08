import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";

// Sales today — what has gone out the door at this market, and how it was paid.
// GET /api/store/market/sales answers the open session's orders plus a summary; same numbers as
// the band on the market screen, itemised.
//
// VOID: the customer changed their mind while still at the stall. Two taps — Void, then confirm on
// the row itself — and POST .../sales/[id]/void does the rest server-side: cash comes off the tin,
// a card payment is refunded through the same code Orders uses, the piece goes back on the rack.

type Sale = { id: string; itemTitle?: string | null; amountCents: number; tender?: string | null; status: string; createdAt?: string | null; paidAt?: string | null };
type Sales = { session: { id: string; name: string } | null; orders: Sale[]; summary: { count: number; grossCents: number; avgCents: number; refundedCount: number; byTender: Record<string, number> } };

const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

export default function SalesToday() {
  const insets = useSafeAreaInsets();
  const { storeSlug } = useAuth();
  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  const q = useQuery({ queryKey: ["market", "sales"], queryFn: () => apiGet<Sales>("/api/store/market/sales"), enabled: !!storeSlug, refetchInterval: 30_000 });
  const currency = me.data?.currency ?? "USD";
  const s = q.data?.summary;
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const voidSale = useMutation({
    mutationFn: (id: string) => apiPost<{ ok: boolean; alreadyVoided?: boolean }>(`/api/store/market/sales/${id}/void`, {}),
    onSuccess: () => { setConfirming(null); void qc.invalidateQueries({ queryKey: ["market"] }); void qc.invalidateQueries({ queryKey: ["store", "items"] }); },
    onError: (e) => { setConfirming(null); setError(e instanceof ApiError && e.message ? e.message : "Couldn't void that sale."); },
  });
  const whatHappens = (o: Sale) => (o.tender === "cash"
    ? `Cash: ${formatMoney(o.amountCents, currency)} comes off the tin. Piece goes back on the rack.`
    : `Card: ${formatMoney(o.amountCents, currency)} is refunded to their card. Piece goes back on the rack.`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The market screen sets the bar light for its wine band; this screen is cream, so it
          must set it back — the bar is per-screen, and a light bar on cream is invisible. */}
      <StatusBar style="dark" />
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Pressable hitSlop={12} onPress={() => router.back()}><Text style={{ fontSize: 15, color: colors.accent, fontWeight: "600" }}>Back</Text></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: fonts.serif, fontSize: 18, color: colors.text }}>Sales today</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        {q.isPending ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : q.isError ? (
          <Text style={{ fontSize: 14, color: colors.textMuted }}>Couldn&apos;t load today&apos;s sales.</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: spacing.xxl }}>
              <View><Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>{formatMoney(s?.grossCents ?? 0, currency)}</Text><Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>taken</Text></View>
              <View><Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>{s?.count ?? 0}</Text><Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>sold</Text></View>
              <View><Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>{formatMoney(s?.avgCents ?? 0, currency)}</Text><Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>average</Text></View>
            </View>
            {s && Object.keys(s.byTender).length ? (
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.md }}>
                {Object.entries(s.byTender).map(([t, cents]) => `${formatMoney(cents, currency)} ${t}`).join(" · ")}
              </Text>
            ) : null}

            {error ? <Text style={{ fontSize: 13.5, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

            <View style={{ marginTop: spacing.xl }}>
              {(q.data?.orders ?? []).length === 0 ? (
                <Text style={{ fontSize: 14, color: colors.textMuted }}>Nothing sold yet today.</Text>
              ) : (
                q.data!.orders.map((o) => {
                  const done = o.status === "refunded" || o.status === "cancelled";
                  const asking = confirming === o.id;
                  return (
                    <View key={o.id} style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: done ? 0.5 : 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{o.itemTitle || "Piece"}</Text>
                          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                            {[time(o.paidAt ?? o.createdAt), o.tender, o.status === "refunded" ? "Voided · back on the rack" : o.status !== "paid" ? o.status : null].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>{formatMoney(o.amountCents, currency)}</Text>
                        {!done && !asking ? (
                          <Pressable hitSlop={8} onPress={() => { setError(null); setConfirming(o.id); }} disabled={voidSale.isPending}>
                            <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: "600" }}>Void</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {asking ? (
                        <View style={{ marginTop: spacing.sm, backgroundColor: colors.chip, borderRadius: 12, padding: spacing.md }}>
                          <Text style={{ fontSize: 13.5, color: colors.text }}>{whatHappens(o)}</Text>
                          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                            <Pressable onPress={() => voidSale.mutate(o.id)} disabled={voidSale.isPending} style={{ flex: 1, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.md, alignItems: "center", opacity: voidSale.isPending ? 0.6 : 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.accentText }}>{voidSale.isPending ? "Voiding…" : "Void sale"}</Text>
                            </Pressable>
                            <Pressable onPress={() => setConfirming(null)} disabled={voidSale.isPending} style={{ flex: 1, borderRadius: 10, paddingVertical: spacing.md, alignItems: "center" }}>
                              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Keep it</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
