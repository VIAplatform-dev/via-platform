import { FlatList, Pressable, Text, View } from "react-native";
import { Link, Redirect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { timeAgo } from "../(tabs)/community";
import { colors, fonts, spacing } from "../../lib/theme";

// The other side of the messages screen: customer enquiries for a store the signed-in person runs.
//
// It works from the app because resolveStoreSlugAny accepts the mobile JWT as well as the web
// cookie — one login covers both roles, and store owners don't need a second account.

type StoreConversation = {
  id: number;
  buyerName: string | null;
  itemTitle: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  storeUnread: number;
};

export default function StoreInboxScreen() {
  const { user, storeSlug, loading } = useAuth();

  const q = useQuery({
    queryKey: ["store-inbox"],
    queryFn: () => apiGet<{ conversations: StoreConversation[]; unread: number }>("/api/store/messages"),
    enabled: Boolean(user && storeSlug),
  });

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;
  if (!storeSlug) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.text, textAlign: "center" }}>This account doesn’t run a store.</Text>
        <Text style={{ marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" }}>
          Sign in with the email your store is registered under to see its inbox.
        </Text>
      </View>
    );
  }

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
          <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.text }}>No customer messages yet</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Link href={`/store-inbox/${item.id}`} asChild>
          <Pressable style={{ paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={{ fontSize: 15, color: colors.text }}>{item.buyerName || "Customer"}</Text>
                {item.storeUnread > 0 ? (
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} />
                ) : null}
              </View>
              <Text style={{ fontSize: 12, color: colors.textDim }}>{timeAgo(item.lastMessageAt)}</Text>
            </View>
            {item.itemTitle ? <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: colors.textDim }}>{item.itemTitle}</Text> : null}
            {item.lastMessage ? <Text numberOfLines={1} style={{ marginTop: 4, fontSize: 14, color: colors.textMuted }}>{item.lastMessage}</Text> : null}
          </Pressable>
        </Link>
      )}
    />
  );
}
