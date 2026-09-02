import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Link, Redirect } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import AppHeader from "../../components/AppHeader";
import SubTabs from "../../components/SubTabs";
import { imageUrl } from "../../lib/imageUrl";
import { colors, fonts, spacing } from "../../lib/theme";

// Community and Messages share a tab: both are "people talking", one in public and one to a store.
// Keeping them together is what lets the bar hold five icons instead of six.

const TABS = ["Community", "Messages"] as const;
type Tab = (typeof TABS)[number];

type Post = { id: number; display_name: string; content: string; image_url: string | null; created_at: string; like_count: number; liked_by_me: boolean };
type ConversationSummary = { id: number; storeSlug: string; itemTitle: string | null; lastMessage: string | null; lastMessageAt: string };

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

function Avatar({ name }: { name: string }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.accentText }}>{(name || "?").charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function CommunityScreen() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("Community");
  const [draft, setDraft] = useState("");
  const qc = useQueryClient();

  const posts = useQuery({
    queryKey: ["community"],
    queryFn: () => apiGet<{ posts: Post[] }>("/api/public/community/feed?limit=50"),
    enabled: Boolean(user) && tab === "Community",
  });
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiGet<{ conversations: ConversationSummary[] }>("/api/mobile/messages"),
    enabled: Boolean(user) && tab === "Messages",
  });

  const post = useMutation({
    mutationFn: (content: string) => apiPost("/api/public/community/posts", { content }),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["community"] }); },
  });

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={88}>
      <AppHeader title="Community" />
      <SubTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "Community" ? (
        <>
          <FlatList
            data={posts.data?.posts ?? []}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={{ paddingTop: spacing.lg, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={posts.isRefetching} onRefresh={() => posts.refetch()} tintColor={colors.text} />}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
                <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.text }}>Nothing posted yet.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.lg }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <Avatar name={item.display_name} />
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{item.display_name}</Text>
                    <Text style={{ fontSize: 13, color: colors.textMuted }}>{timeAgo(item.created_at)}</Text>
                  </View>
                </View>
                {item.content ? (
                  <Text style={{ marginTop: spacing.md, fontSize: 16, lineHeight: 22, color: colors.text }}>{item.content}</Text>
                ) : null}
                {item.image_url ? (
                  <Image source={{ uri: imageUrl(item.image_url) }} style={{ marginTop: spacing.md, width: "100%", aspectRatio: 1, backgroundColor: colors.bgCard }} contentFit="cover" transition={180} />
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md }}>
                  <Ionicons name={item.liked_by_me ? "heart" : "heart-outline"} size={20} color={item.liked_by_me ? colors.accent : colors.textMuted} />
                  {item.like_count > 0 ? <Text style={{ fontSize: 13, color: colors.textMuted }}>{item.like_count}</Text> : null}
                </View>
              </View>
            )}
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Share a find, styling tip, or question..."
              placeholderTextColor={colors.textDim}
              multiline
              style={{ flex: 1, maxHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 15, color: colors.text }}
            />
            <Pressable
              onPress={() => { const t = draft.trim(); if (t) post.mutate(t); }}
              disabled={!draft.trim() || post.isPending}
              style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: draft.trim() ? colors.accent : colors.textDim, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="arrow-up" size={21} color={colors.accentText} />
            </Pressable>
          </View>
        </>
      ) : (
        <FlatList
          data={conversations.data?.conversations ?? []}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={conversations.isRefetching} onRefresh={() => conversations.refetch()} tintColor={colors.text} />}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl }}>
              <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.text }}>No messages yet</Text>
              <Text style={{ marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" }}>
                Ask a store about measurements, condition or shipping from any piece.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Link href={`/messages/${item.id}`} asChild>
              <Pressable style={{ paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>{item.storeSlug}</Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>{timeAgo(item.lastMessageAt)}</Text>
                </View>
                {item.itemTitle ? <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, color: colors.textMuted }}>{item.itemTitle}</Text> : null}
                {item.lastMessage ? <Text numberOfLines={1} style={{ marginTop: 4, fontSize: 15, color: colors.textMuted }}>{item.lastMessage}</Text> : null}
              </Pressable>
            </Link>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}
