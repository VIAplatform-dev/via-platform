import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";

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

export default function InboxScreen() {
  const { storeSlug } = useAuth();
  const q = useQuery({
    queryKey: ["store", "inbox"],
    queryFn: () => apiGet<{ conversations: Conversation[] }>("/api/store/inbox"),
    enabled: !!storeSlug,
  });

  const threads = q.data?.conversations ?? [];
  const unanswered = threads.filter((c) => c.storeUnread > 0).length;

  return (
    <SellerScreen
      title="Inbox"
      subtitle={q.isError ? "Couldn't load your messages" : q.isPending ? " " : unanswered ? `${unanswered} unanswered` : "All answered"}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      {q.isError ? (
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
