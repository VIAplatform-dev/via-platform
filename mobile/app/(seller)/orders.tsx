import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { groupIntoParcels, parcelsToCollect, type Parcel } from "../../lib/seller/parcels";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";

// Orders — the most time-critical thing a seller does, often standing in a post office queue.
//
// VYA has already bought the label, so her job is print, post, confirm. Orders are per piece, but
// she posts PARCELS: three things bought together are one row here, one label, one "Mark as
// posted" that flips every piece on the server (lib/seller/parcels.ts). A collection order says so
// instead, because there is no label to look for — the API tells us via deliveryMethod.

type Order = {
  id: string;
  orderNo: number;
  itemTitle: string | null;
  amountCents: number;
  currency: string;
  buyerEmail: string | null;
  status: string;
  paidAt?: string | null;
  paymentIntent?: string | null;
  deliveryMethod?: "pickup" | "ship";
  labelUrl?: string | null;
  trackingNumber?: string | null;
};

type Tab = "post" | "pickup" | "transit" | "done";

// Collections are paid orders the buyer picks up at the counter — no label, nothing to post.
// Their own tab, so "To post" is only what goes in the bag and Home's "collections waiting" row
// lands on exactly them (?filter=pickup).
const CHIPS: { key: Tab; label: string }[] = [
  { key: "post", label: "To post" },
  { key: "pickup", label: "Collections" },
  { key: "transit", label: "In transit" },
  { key: "done", label: "Done" },
];

const BUCKET: Record<Tab, string[]> = {
  post: ["paid"],
  pickup: ["paid"],
  transit: ["shipped"],
  done: ["delivered", "fulfilled"],
};

export default function OrdersScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [tab, setTab] = useState<Tab>(params.filter === "pickup" ? "pickup" : "post");

  const q = useQuery({
    queryKey: ["store", "orders"],
    queryFn: () => apiGet<{ orders: Order[] }>("/api/store/orders"),
    enabled: !!storeSlug,
  });

  // One call for the whole bag — every piece flips together, and the buyer gets one email.
  const act = useMutation({
    mutationFn: (v: { parcel: Parcel<Order>; action: "posted" | "collected" | "delivered" }) =>
      apiPost("/api/store/orders/parcel", { orderIds: v.parcel.orders.map((o) => o.id), action: v.action }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["store", "orders"] }); },
  });

  const parcels = groupIntoParcels(q.data?.orders ?? []);
  const shown = tab === "pickup"
    ? parcelsToCollect(parcels)
    : parcels.filter((p) => BUCKET[tab].includes(p.status) && (tab !== "post" || p.deliveryMethod === "ship"));
  const toPost = parcels.filter((p) => p.status === "paid" && p.deliveryMethod === "ship").length;
  const inTransit = parcels.filter((p) => p.status === "shipped").length;

  return (
    <SellerScreen
      title="Orders"
      subtitle={q.isError ? "Couldn't load your orders" : q.isPending ? " " : `${toPost} ${toPost === 1 ? "parcel" : "parcels"} to post · ${inTransit} in transit`}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <Chips options={CHIPS} value={tab} onChange={setTab} />

      {q.isError ? (
        <Empty>Couldn&apos;t load your orders. Pull to try again.</Empty>
      ) : shown.length === 0 && !q.isPending ? (
        <Empty>{tab === "post" ? "Nothing to post." : tab === "pickup" ? "Nothing waiting to be collected." : tab === "transit" ? "Nothing in transit." : "Nothing completed yet."}</Empty>
      ) : (
        shown.map((p) => {
          const first = p.orders[0];
          const pickup = p.deliveryMethod === "pickup";
          const busy = act.isPending && act.variables?.parcel.key === p.key;
          return (
            <View key={p.key} style={{ backgroundColor: colors.chip, borderRadius: 12, padding: spacing.lg, marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.bgAlt }} />
                <View style={{ flex: 1 }}>
                  {p.pieces > 1 ? (
                    <>
                      <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: "600" }}>{p.pieces} pieces · one parcel</Text>
                      {p.orders.map((o) => (
                        <Text key={o.id} style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>
                          {o.itemTitle ?? `Order #${o.orderNo}`}
                        </Text>
                      ))}
                    </>
                  ) : (
                    <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={2}>
                      {first.itemTitle ?? `Order #${first.orderNo}`}
                    </Text>
                  )}
                  <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                    {formatMoney(p.amountCents, p.currency ?? first.currency)}
                    {p.buyerEmail ? ` · ${p.buyerEmail}` : ""}
                  </Text>
                  <Text style={{ fontSize: 13, color: pickup ? colors.textMuted : colors.positive, marginTop: 3 }}>
                    {pickup ? "Collection — no label needed" : p.labelUrl ? "Label sent to you" : "Label not bought yet — do it on the desktop"}
                  </Text>
                </View>
              </View>

              {tab === "post" || tab === "pickup" ? (
                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                  <Pressable
                    disabled={busy}
                    onPress={() => act.mutate({ parcel: p, action: pickup ? "collected" : "posted" })}
                    style={{ flex: 1, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.md, alignItems: "center" }}
                  >
                    <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>
                      {busy ? "…" : pickup ? "Mark collected" : "Mark as posted"}
                    </Text>
                  </Pressable>
                  {!pickup && p.labelUrl ? (
                    <Pressable onPress={() => void Linking.openURL(p.labelUrl!)} style={{ paddingHorizontal: spacing.xl, justifyContent: "center", borderRadius: 10, backgroundColor: colors.bgAlt }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Label</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : tab === "transit" ? (
                <Pressable
                  disabled={busy}
                  onPress={() => act.mutate({ parcel: p, action: "delivered" })}
                  style={{ marginTop: spacing.md, backgroundColor: colors.bgAlt, borderRadius: 10, paddingVertical: spacing.md, alignItems: "center" }}
                >
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{busy ? "…" : "Mark delivered"}</Text>
                </Pressable>
              ) : null}
              {act.isError && act.variables?.parcel.key === p.key ? (
                <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.sm }}>Couldn&apos;t update that parcel. Try again.</Text>
              ) : null}
            </View>
          );
        })
      )}
    </SellerScreen>
  );
}
