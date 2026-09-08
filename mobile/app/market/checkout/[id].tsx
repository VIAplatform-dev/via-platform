import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "../../../lib/api";
import { colors, spacing, fonts } from "../../../lib/theme";
import { formatMoney } from "../../../lib/seller/home";

// Cash checkout — the money changes hands, then the piece is marked sold.
//
// GET /api/store/market/checkout/[id] for the total; POST .../cash with what was tendered to
// finish. finalizeMarketSale runs on the server (money first, then markSold) — the phone never
// touches inventory directly. Cards are the desktop's for now: the QR/keyed flows need Stripe's
// browser pieces this screen does not carry.

type Checkout = {
  id: string; amountCents: number; currency: string; status: string; tender: string;
  items: { itemId: string; title?: string | null; saleCents?: number | null }[];
  tenderedCents: number | null; changeCents: number | null;
};
// The route answers { checkout, item, items } — the titles live on `items`, not on the lines.
type CheckoutResponse = { checkout: Checkout; items?: { id: string; title: string }[] };

export default function CashCheckout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [tendered, setTendered] = useState("");
  const [receiptEmail, setReceiptEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["market", "checkout", id],
    queryFn: () => apiGet<CheckoutResponse>(`/api/store/market/checkout/${id}`),
    enabled: !!id,
  });
  const c = q.data?.checkout;
  const titleOf = (itemId: string) => q.data?.items?.find((i) => i.id === itemId)?.title ?? null;
  const currency = c?.currency ?? "USD";

  const pay = useMutation({
    mutationFn: () => {
      const n = tendered.trim() ? Math.round(Number(tendered.replace(/[^0-9.]/g, "")) * 100) : null;
      return apiPost<{ ok: boolean; changeCents: number | null; receipt?: { emailed: boolean } | null }>(`/api/store/market/checkout/${id}/cash`, { tenderedCents: n, receiptEmail: receiptEmail.trim() || null });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["market"] });
      void qc.invalidateQueries({ queryKey: ["store", "items"] });
    },
    onError: (e) => setError(e instanceof ApiError && e.message ? e.message : "Couldn't take the cash. Try again."),
  });
  const cancel = useMutation({
    mutationFn: () => apiPost(`/api/store/market/checkout/${id}/cancel`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["market"] }); router.back(); },
    onError: (e) => setError(e instanceof ApiError && e.message ? e.message : "Couldn't cancel that."),
  });

  const paid = pay.isSuccess || c?.status === "paid";
  const change = pay.data?.changeCents ?? c?.changeCents ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The market screen sets the bar light for its wine band; this screen is cream, so it
          must set it back — the bar is per-screen, and a light bar on cream is invisible. */}
      <StatusBar style="dark" />
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Pressable hitSlop={12} onPress={() => router.back()}><Text style={{ fontSize: 15, color: colors.accent, fontWeight: "600" }}>{paid ? "Done" : "Back"}</Text></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: fonts.serif, fontSize: 18, color: colors.text }}>Cash</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        {q.isPending ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : q.isError || !c ? (
          <Text style={{ fontSize: 14, color: colors.textMuted }}>This checkout isn&apos;t here any more — start again from the market.</Text>
        ) : (
          <>
            <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textDim, fontWeight: "700" }}>TOTAL</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 44, color: colors.text, marginTop: spacing.xs }}>{formatMoney(c.amountCents, currency)}</Text>
            {c.items.map((l) => (
              <Text key={l.itemId} style={{ fontSize: 14, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{l.title || titleOf(l.itemId) || "Piece"}</Text>
            ))}

            {paid ? (
              <View style={{ marginTop: spacing.xl, backgroundColor: "rgba(31,122,92,0.12)", borderRadius: 16, padding: spacing.lg }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: colors.positive }}>Paid — marked sold</Text>
                {change != null && change > 0 ? (
                  <Text style={{ fontSize: 15, color: colors.text, marginTop: spacing.xs }}>Change due: {formatMoney(change, currency)}</Text>
                ) : null}
                {pay.data?.receipt?.emailed ? (
                  <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.xs }}>Receipt sent to {receiptEmail.trim().toLowerCase()}</Text>
                ) : null}
                <Pressable onPress={() => router.replace("/market")} style={{ marginTop: spacing.lg, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: spacing.lg, alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accentText }}>Next buyer</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md, marginTop: spacing.xl }}>
                  <Text style={{ width: 110, fontSize: 14, color: colors.textMuted }}>Cash given</Text>
                  <TextInput
                    value={tendered}
                    onChangeText={setTendered}
                    keyboardType="decimal-pad"
                    placeholder={String(c.amountCents / 100)}
                    placeholderTextColor={colors.textDim}
                    style={{ flex: 1, fontSize: 20, color: colors.text, fontWeight: "600" }}
                  />
                </View>
                <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: spacing.sm }}>Leave it blank for exact change.</Text>

                {/* A receipt, if they want one — they join Customers tagged with this market. */}
                <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md, marginTop: spacing.md }}>
                  <Text style={{ width: 110, fontSize: 14, color: colors.textMuted }}>Receipt to</Text>
                  <TextInput
                    value={receiptEmail}
                    onChangeText={setReceiptEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="email (optional)"
                    placeholderTextColor={colors.textDim}
                    style={{ flex: 1, fontSize: 16, color: colors.text }}
                  />
                </View>

                {error ? <Text style={{ fontSize: 13.5, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

                <Pressable
                  onPress={() => { setError(null); pay.mutate(); }}
                  disabled={pay.isPending || cancel.isPending}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.accent, borderRadius: 16, paddingVertical: spacing.xl, marginTop: spacing.xl, opacity: pay.isPending ? 0.6 : 1 }}
                >
                  {pay.isPending ? <ActivityIndicator color={colors.accentText} /> : null}
                  <Text style={{ fontSize: 17, fontWeight: "600", color: colors.accentText }}>Cash received</Text>
                </Pressable>
                <Pressable onPress={() => cancel.mutate()} disabled={pay.isPending || cancel.isPending} style={{ alignItems: "center", paddingVertical: spacing.lg, marginTop: spacing.sm }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.textMuted }}>{cancel.isPending ? "Cancelling…" : "Cancel — put it back"}</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
