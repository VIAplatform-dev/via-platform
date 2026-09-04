import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";

// Orders — the most time-critical thing a seller does, often standing in a post office queue.
//
// VYA has already bought the label, so her job is print, post, confirm. Two buttons per order:
// mark it posted, or open the label. A collection order says so instead, because there is no label
// to look for — the API tells us via deliveryMethod.

type Order = {
  id: string;
  orderNo: number;
  itemTitle: string | null;
  amountCents: number;
  currency: string;
  buyerEmail: string | null;
  status: string;
  deliveryMethod?: "pickup" | "ship";
};

type Tab = "post" | "transit" | "done";

const CHIPS: { key: Tab; label: string }[] = [
  { key: "post", label: "To post" },
  { key: "transit", label: "In transit" },
  { key: "done", label: "Done" },
];

const BUCKET: Record<Tab, string[]> = {
  post: ["paid"],
  transit: ["shipped"],
  done: ["delivered", "fulfilled"],
};

export default function OrdersScreen() {
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("post");

  const q = useQuery({
    queryKey: ["store", "orders"],
    queryFn: () => apiGet<{ orders: Order[] }>("/api/store/orders"),
    enabled: !!storeSlug,
  });

  const markPosted = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/store/orders/${id}`, { status: "shipped" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["store", "orders"] }); },
  });

  const all = q.data?.orders ?? [];
  const shown = all.filter((o) => BUCKET[tab].includes(o.status));
  const toPost = all.filter((o) => BUCKET.post.includes(o.status)).length;
  const inTransit = all.filter((o) => BUCKET.transit.includes(o.status)).length;

  return (
    <SellerScreen
      title="Orders"
      subtitle={q.isError ? "Couldn't load your orders" : q.isPending ? " " : `${toPost} to post · ${inTransit} in transit`}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <Chips options={CHIPS} value={tab} onChange={setTab} />

      {q.isError ? (
        <Empty>Couldn&apos;t load your orders. Pull to try again.</Empty>
      ) : shown.length === 0 && !q.isPending ? (
        <Empty>{tab === "post" ? "Nothing to post." : tab === "transit" ? "Nothing in transit." : "Nothing completed yet."}</Empty>
      ) : (
        shown.map((o) => {
          const pickup = o.deliveryMethod === "pickup";
          return (
            <View key={o.id} style={{ backgroundColor: colors.chip, borderRadius: 12, padding: spacing.lg, marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.bgAlt }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={2}>
                    {o.itemTitle ?? `Order #${o.orderNo}`}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                    {formatMoney(o.amountCents, o.currency)}
                    {o.buyerEmail ? ` · ${o.buyerEmail}` : ""}
                  </Text>
                  <Text style={{ fontSize: 13, color: pickup ? colors.textMuted : colors.positive, marginTop: 3 }}>
                    {pickup ? "Collection — no label needed" : "Label sent to you"}
                  </Text>
                </View>
              </View>

              {tab === "post" ? (
                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                  <Pressable
                    disabled={markPosted.isPending}
                    onPress={() => markPosted.mutate(o.id)}
                    style={{ flex: 1, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.md, alignItems: "center" }}
                  >
                    <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>
                      {pickup ? "Mark collected" : "Mark as posted"}
                    </Text>
                  </Pressable>
                  {!pickup ? (
                    <Pressable style={{ paddingHorizontal: spacing.xl, justifyContent: "center", borderRadius: 10, backgroundColor: colors.bgAlt }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Label</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </SellerScreen>
  );
}
