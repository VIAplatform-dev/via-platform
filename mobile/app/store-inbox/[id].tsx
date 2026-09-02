import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { colors, fonts, spacing } from "../../lib/theme";

// Replying to a customer, as the store. Same thread as the buyer's screen, opposite side — which is
// why "mine" flips to the store sender here.

type Message = { id: number; sender: string; body: string; createdAt: string };
type Conversation = { id: number; buyerName: string | null; itemTitle: string | null };

export default function StoreThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const q = useQuery({
    queryKey: ["store-thread", id],
    queryFn: () => apiGet<{ conversation: Conversation; messages: Message[] }>(`/api/store/messages/${id}`),
    enabled: Boolean(id),
    refetchInterval: 20_000,
  });

  const send = useMutation({
    mutationFn: (text: string) => apiPost("/api/store/messages", { conversationId: Number(id), body: text }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["store-thread", id] });
      qc.invalidateQueries({ queryKey: ["store-inbox"] });
    },
  });

  const messages = [...(q.data?.messages ?? [])].reverse();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: q.data?.conversation?.buyerName || "Customer" }} />

      {q.data?.conversation?.itemTitle ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textDim }}>About: {q.data.conversation.itemTitle}</Text>
        </View>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(m) => String(m.id)}
        inverted
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: spacing.xxl, fontFamily: fonts.serif, fontSize: 16, color: colors.textMuted }}>
            No messages in this thread yet.
          </Text>
        }
        renderItem={({ item }) => {
          const mine = item.sender === "store";
          return (
            <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", marginBottom: spacing.md }}>
              <View style={{ backgroundColor: mine ? colors.accent : colors.bgCard, borderWidth: mine ? 0 : 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
                <Text style={{ fontSize: 15, lineHeight: 21, color: mine ? colors.accentText : colors.text }}>{item.body}</Text>
              </View>
            </View>
          );
        }}
      />

      <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Reply"
          placeholderTextColor={colors.textDim}
          multiline
          style={{ flex: 1, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 15, color: colors.text, backgroundColor: colors.bgCard }}
        />
        <Pressable
          onPress={() => { const t = draft.trim(); if (t) send.mutate(t); }}
          disabled={!draft.trim() || send.isPending}
          style={{ paddingHorizontal: spacing.lg, justifyContent: "center", opacity: draft.trim() && !send.isPending ? 1 : 0.4 }}
        >
          <Text style={{ fontSize: 15, color: colors.text }}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
