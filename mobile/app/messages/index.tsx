import { FlatList, Pressable, Text, View } from "react-native";
import { Link, Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, fonts, spacing } from "../../lib/theme";

// Your conversations with stores. A thread is opened against a specific piece, which is why the
// item title sits under the store name — "is this still available" is meaningless without it.

type ConversationSummary = {
  id: number;
  storeSlug: string;
  itemTitle: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  status: "open" | "closed";
};

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export default function MessagesScreen() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiGet<{ conversations: ConversationSummary[] }>("/api/mobile/messages"),
    enabled: Boolean(user),
  });

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;

  return (
    <FlatList
      data={q.data?.conversations ?? []}
      keyExtractor={(c) => String(c.id)}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.text }}>No messages yet</Text>
          <Text style={{ marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" }}>
            Ask a store about measurements, condition or shipping from any piece.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={`/messages/${item.id}`} asChild>
          <Pressable style={{ paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 15, color: colors.text }}>{item.storeSlug}</Text>
              <Text style={{ fontSize: 12, color: colors.textDim }}>{timeAgo(item.lastMessageAt)}</Text>
            </View>
            {item.itemTitle ? (
              <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: colors.textDim }}>{item.itemTitle}</Text>
            ) : null}
            {item.lastMessage ? (
              <Text numberOfLines={1} style={{ marginTop: 4, fontSize: 14, color: colors.textMuted }}>{item.lastMessage}</Text>
            ) : null}
          </Pressable>
        </Link>
      )}
    />
  );
}
