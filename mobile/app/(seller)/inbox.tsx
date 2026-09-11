import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen, Chips, Empty } from "../../components/seller/Screen";
import { formatMoney } from "../../lib/seller/home";

// Inbox — every buyer thread in one list.
//
// The mockups draw channel chips (VYA · Depop · eBay). They are NOT here, and deliberately:
// `storefront_conversations` has no channel column and nothing ingests messages from Depop or
// eBay — the cross-listing routes push listings out, they don't pull conversations in. Chips that
// filter one real source and two empty ones would be a promise the backend can't keep. When
// message ingestion exists, the chips go here and this comment goes away.

type Conversation = {
  id: number;
  buyerName: string | null;
  buyerEmail: string | null;
  itemTitle: string | null;
  lastMessage: string | null;
  storeUnread: number;
  lastMessageAt: string;
};

function initials(name: string | null, email: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** "2 minutes ago" is what she reads; anything older than a week is a date. */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

type Offer = {
  id: number;
  itemTitle: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  listPriceCents: number;
  amountCents: number;
  status: string;
  lastActor: string;
  expiresAt: string;
};

const TABS: { key: "messages" | "offers"; label: string }[] = [
  { key: "messages", label: "Messages" },
  { key: "offers", label: "Offers" },
];

export default function InboxScreen() {
  const { storeSlug } = useAuth();
  const [tab, setTab] = useState<"messages" | "offers">("messages");
  const q = useQuery({
    queryKey: ["store", "inbox"],
    queryFn: () => apiGet<{ conversations: Conversation[] }>("/api/store/inbox"),
    enabled: !!storeSlug,
  });
  // Offers were only ever on the web. They are the half of the inbox that expires — a message can
  // wait a day, an offer cannot — so they belong beside the messages rather than a screen away.
  const offers = useQuery({
    queryKey: ["store", "offers"],
    queryFn: () => apiGet<{ offers: Offer[]; pending?: number }>("/api/store/offers"),
    enabled: !!storeSlug,
  });
  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  const currency = me.data?.currency ?? "USD";

  const threads = q.data?.conversations ?? [];
  const unanswered = threads.filter((c) => c.storeUnread > 0).length;
  // Waiting on HER — the buyer moved last and it has not expired. That is the number worth a badge.
  const openOffers = (offers.data?.offers ?? []).filter((o) => o.status === "pending" && o.lastActor === "buyer");

  return (
    <SellerScreen
      title="Inbox"
      subtitle={q.isError ? "Couldn't load your messages" : q.isPending ? " " : unanswered ? `${unanswered} unanswered` : "All answered"}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      <Chips
        options={TABS.map((t) => ({
          key: t.key,
          label: t.key === "offers" && openOffers.length ? `${t.label} · ${openOffers.length}` : t.label,
        }))}
        value={tab}
        onChange={setTab}
      />

      {tab === "offers" ? (
        offers.isError ? (
          <Empty>Couldn&apos;t load your offers.</Empty>
        ) : (offers.data?.offers ?? []).length === 0 && !offers.isPending ? (
          <Empty>No offers yet.</Empty>
        ) : (
          (offers.data?.offers ?? []).map((o) => {
            const waiting = o.status === "pending" && o.lastActor === "buyer";
            return (
              <View key={o.id} style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>
                    {o.itemTitle ?? "A piece"}
                  </Text>
                  <Text style={{ fontSize: 15, color: waiting ? colors.accent : colors.text, fontWeight: "700" }}>
                    {formatMoney(o.amountCents, currency)}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                  {o.buyerName || o.buyerEmail || "A buyer"} · asked {formatMoney(o.listPriceCents, currency)} listed
                </Text>
                <Text style={{ fontSize: 12.5, color: waiting ? colors.accent : colors.textDim, marginTop: 2 }}>
                  {waiting ? "Waiting on you" : o.status === "pending" ? "Waiting on them" : o.status}
                </Text>
              </View>
            );
          })
        )
      ) : q.isError ? (
        <Empty>Couldn&apos;t load your inbox. Pull to try again.</Empty>
      ) : threads.length === 0 && !q.isPending ? (
        <Empty>No messages yet.</Empty>
      ) : (
        threads.map((c) => (
          <Link key={c.id} href={{ pathname: "/(seller)/message/[id]", params: { id: String(c.id) } }} asChild>
            <Pressable
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingVertical: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: "600" }}>
                  {initials(c.buyerName, c.buyerEmail)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600", flex: 1 }} numberOfLines={1}>
                    {c.buyerName ?? c.buyerEmail ?? "A buyer"}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textDim }}>{ago(c.lastMessageAt)}</Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                  {c.lastMessage ?? c.itemTitle ?? "—"}
                </Text>
              </View>
              {c.storeUnread > 0 ? (
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent }} />
              ) : null}
            </Pressable>
          </Link>
        ))
      )}
    </SellerScreen>
  );
}
