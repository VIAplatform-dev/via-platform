import { useState } from "react";
import { Linking, Pressable, Share, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, radius, pill } from "../../lib/portal-theme";
import { formatMoney } from "../../lib/seller/home";
import { groupIntoParcels, parcelsToCollect, type Parcel } from "../../lib/seller/parcels";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";
import { labelQuoteLine, type LabelQuote } from "../../lib/seller/labels";

// Orders: the most time-critical thing a seller does, often standing in a post office queue.
//
// BUYING THE LABEL HAPPENS HERE NOW. It used to say "Label not bought yet. Do it on the desktop",
// which is the worst place in the app to be sent away from: she is holding the parcel. It is two
// taps rather than one on purpose, a quote, then the purchase, because the quote is where she
// finds out what it costs and, more to the point, WHETHER SHE IS PAYING. On a free-shipping order
// the label comes off her card, and a one-tap button would spend her money before she saw a number.
//
// Once bought, her job is print, post, confirm. Orders are per piece, but
// she posts PARCELS: three things bought together are one row here, one label, one "Mark as
// posted" that flips every piece on the server (lib/seller/parcels.ts). A collection order says so
// instead, because there is no label to look for. The API tells us via deliveryMethod.

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

// Collections are paid orders the buyer picks up at the counter, no label, nothing to post.
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
  // Home's "2 collections waiting" row arrives as ?filter=pickup. The URL is the tab, because this
  // screen is a TAB that stays mounted once visited: a useState initialiser runs once, on the
  // session's first visit, so every later arrival from Home was silently ignored. Switching tabs by
  // hand writes back, so arriving here twice on the same filter works the second time too.
  const params = useLocalSearchParams<{ filter?: string }>();
  const tab: Tab = (["post", "pickup", "transit", "done"] as const).includes(params.filter as Tab) ? (params.filter as Tab) : "post";
  const setTab = (next: Tab) => router.setParams({ filter: next });

  const q = useQuery({
    queryKey: ["store", "orders"],
    queryFn: () => apiGet<{ orders: Order[] }>("/api/store/orders"),
    enabled: !!storeSlug,
  });

  // The quote for whichever parcel she is looking at, keyed by parcel so two rows can't cross.
  const [quote, setQuote] = useState<{ key: string; quote: LabelQuote } | null>(null);
  const [labelBusy, setLabelBusy] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);

  // A parcel is several orders but ONE label, bought against the first. The same order the
  // server files the label on, which is why parcels.ts reads labelUrl off the first that has one.
  async function getQuote(p: Parcel<Order>) {
    setLabelError(null);
    setLabelBusy(p.key);
    try {
      const r = await apiPost<LabelQuote>(`/api/store/orders/${p.orders[0].id}`, { action: "label_quote" });
      setQuote({ key: p.key, quote: r });
    } catch (e) {
      setLabelError(e instanceof Error ? e.message : "Couldn't get a shipping price.");
    } finally {
      setLabelBusy(null);
    }
  }

  async function buyLabel(p: Parcel<Order>, rateId: string) {
    setLabelError(null);
    setLabelBusy(p.key);
    try {
      await apiPost(`/api/store/orders/${p.orders[0].id}`, { action: "buy_label", rateId });
      setQuote(null);
      await qc.invalidateQueries({ queryKey: ["store", "orders"] });
      await q.refetch();
    } catch (e) {
      setLabelError(e instanceof Error ? e.message : "The label didn't go through. Nothing was charged.");
    } finally {
      setLabelBusy(null);
    }
  }

  // One call for the whole bag. Every piece flips together, and the buyer gets one email.
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
            <View key={p.key} style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, padding: spacing.lg, marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.bgAlt }} />
                <View style={{ flex: 1 }}>
                  {p.pieces > 1 ? (
                    <>
                      <Text style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: "600" }}>{p.pieces} pieces · one parcel</Text>
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
                  <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                    {formatMoney(p.amountCents, p.currency ?? first.currency)}
                    {p.buyerEmail ? ` · ${p.buyerEmail}` : ""}
                  </Text>
                  <Text style={{ fontSize: 13, color: pickup ? colors.textMuted : colors.positive, marginTop: 3 }}>
                    {pickup ? "Collection, no label needed" : p.labelUrl ? "Label bought: emailed to you" : "No label yet"}
                  </Text>
                </View>
              </View>

              {tab === "post" || tab === "pickup" ? (
                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                  <Pressable
                    disabled={busy}
                    onPress={() => act.mutate({ parcel: p, action: pickup ? "collected" : "posted" })}
                    style={{ flex: 1, backgroundColor: colors.accent, borderRadius: pill, paddingVertical: spacing.md, alignItems: "center" }}
                  >
                    <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>
                      {busy ? "…" : pickup ? "Mark collected" : "Mark as posted"}
                    </Text>
                  </Pressable>
                  {!pickup && p.labelUrl ? (
                    // THE SHARE SHEET, NOT A BROWSER. openURL drops a PDF into Safari, where the
                    // only way to a printer is a two-tap detour most people never find. The share
                    // sheet puts AirPrint, Files and Mail on the first screen, which is the whole
                    // difference between "the label is on my phone" and "the label is on the box".
                    // Long-press still opens it, for anyone who wants to look at it first.
                    <Pressable
                      onPress={() => void Share.share({ url: p.labelUrl!, message: `Shipping label: ${first.itemTitle ?? "order"}` })}
                      onLongPress={() => void Linking.openURL(p.labelUrl!)}
                      style={{ paddingHorizontal: spacing.xl, justifyContent: "center", borderRadius: radius, backgroundColor: colors.bgAlt }}
                    >
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Print label</Text>
                    </Pressable>
                  ) : !pickup && quote?.key !== p.key ? (
                    <Pressable
                      disabled={labelBusy !== null}
                      onPress={() => void getQuote(p)}
                      style={{ paddingHorizontal: spacing.xl, justifyContent: "center", borderRadius: radius, backgroundColor: colors.bgAlt, opacity: labelBusy ? 0.6 : 1 }}
                    >
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                        {labelBusy === p.key ? "…" : "Buy label"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : tab === "transit" ? (
                <Pressable
                  disabled={busy}
                  onPress={() => act.mutate({ parcel: p, action: "delivered" })}
                  style={{ marginTop: spacing.md, backgroundColor: colors.bgAlt, borderRadius: pill, paddingVertical: spacing.md, alignItems: "center" }}
                >
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{busy ? "…" : "Mark delivered"}</Text>
                </Pressable>
              ) : null}

              {/* The quote. Shown only for the parcel she asked about, and it says who pays before
                  it offers to spend anything. */}
              {quote?.key === p.key ? (
                <View style={{ marginTop: spacing.md, backgroundColor: colors.bgAlt, borderRadius: radius, padding: spacing.md }}>
                  <Text style={{ fontSize: 15, color: colors.text, lineHeight: 18 }}>
                    {labelQuoteLine(quote.quote, p.currency ?? first.currency)}
                  </Text>
                  <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                    <Pressable
                      disabled={labelBusy !== null}
                      onPress={() => void buyLabel(p, quote.quote.rate.rateId)}
                      style={{ flex: 1, backgroundColor: colors.accent, borderRadius: pill, paddingVertical: spacing.md, alignItems: "center", opacity: labelBusy ? 0.6 : 1 }}
                    >
                      <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>
                        {labelBusy === p.key ? "Buying…" : "Buy this label"}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => setQuote(null)} style={{ paddingHorizontal: spacing.xl, justifyContent: "center" }}>
                      <Text style={{ color: colors.textMuted, fontSize: 14 }}>Not now</Text>
                    </Pressable>
                  </View>
                  {(quote.quote.customsWarnings ?? []).map((w: { note: string }, i: number) => (
                    <Text key={i} style={{ fontSize: 12, color: colors.text, marginTop: spacing.sm, lineHeight: 17 }}>{w.note}</Text>
                  ))}
                </View>
              ) : null}

              {labelError && (quote?.key === p.key || labelBusy === p.key) ? (
                <Text style={{ fontSize: 12, color: colors.text, marginTop: spacing.sm }}>{labelError}</Text>
              ) : null}

              {act.isError && act.variables?.parcel.key === p.key ? (
                <Text style={{ fontSize: 15, color: colors.text, marginTop: spacing.sm }}>Couldn&apos;t update that parcel. Try again.</Text>
              ) : null}
            </View>
          );
        })
      )}
    </SellerScreen>
  );
}
