import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { colors, fonts, spacing } from "../../lib/theme";

// One conversation with a store.
//
// Inverted list: newest at the bottom, which is where a chat's attention lives. `inverted` renders
// from the bottom up, so the data is reversed rather than the list being scrolled after every send.

type Message = { id: number; conversationId: number; sender: string; body: string; createdAt: string };
type Conversation = { id: number; storeSlug: string; itemTitle: string | null; status: "open" | "closed" };

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const q = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => apiGet<{ conversation: Conversation; messages: Message[] }>(`/api/mobile/messages/${id}`),
    enabled: Boolean(id),
    // A conversation is the one screen where staleness is actually felt.
    refetchInterval: 20_000,
  });

  const send = useMutation({
    mutationFn: (text: string) => apiPost("/api/mobile/messages", { conversationId: Number(id), body: text }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const messages = [...(q.data?.messages ?? [])].reverse();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: q.data?.conversation?.storeSlug ?? "Message" }} />

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
            Say hello — stores usually reply the same day.
          </Text>
        }
        renderItem={({ item }) => {
          const mine = item.sender === "buyer";
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
          placeholder="Message"
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
