import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { colors, spacing } from "../../../lib/theme";
import { SellerScreen } from "../../../components/seller/Screen";

// One thread.
//
// The piece being asked about is PINNED at the top. Without it she is answering "is it still
// available?" with no idea which "it" — the single most common message a vintage seller gets.

type Conversation = { id: number; buyerName: string | null; buyerEmail: string | null; itemTitle: string | null };
type Message = { id: number; sender: "buyer" | "store"; body: string; createdAt: string };

export default function MessageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const q = useQuery({
    queryKey: ["store", "thread", id],
    queryFn: () => apiGet<{ conversation: Conversation; messages: Message[] }>(`/api/store/inbox/${id}`),
    enabled: !!storeSlug && !!id,
  });

  const send = useMutation({
    mutationFn: (body: string) => apiPost(`/api/store/inbox/${id}`, { body }),
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: ["store", "thread", id] });
      void qc.invalidateQueries({ queryKey: ["store", "inbox"] });
    },
  });

  const conv = q.data?.conversation;
  const messages = q.data?.messages ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SellerScreen title={conv?.buyerName ?? conv?.buyerEmail ?? "Message"} back>
        {conv?.itemTitle ? (
          <View style={{ backgroundColor: colors.chip, borderRadius: 10, padding: spacing.md, marginBottom: spacing.lg, flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
            <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: colors.bgAlt }} />
            <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600", flex: 1 }} numberOfLines={2}>
              {conv.itemTitle}
            </Text>
          </View>
        ) : null}

        {q.isError ? (
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.xl }}>
            Couldn&apos;t load this conversation.
          </Text>
        ) : (
          messages.map((m) => {
            const mine = m.sender === "store";
            return (
              <View
                key={m.id}
                style={{
                  alignSelf: mine ? "flex-end" : "flex-start",
                  maxWidth: "82%",
                  backgroundColor: mine ? colors.accent : colors.chip,
                  borderRadius: 14,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  marginBottom: spacing.sm,
                }}
              >
                <Text style={{ fontSize: 15, color: mine ? colors.accentText : colors.text }}>{m.body}</Text>
              </View>
            );
          })
        )}

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={colors.textDim}
            multiline
            style={{
              flex: 1,
              backgroundColor: colors.chip,
              borderRadius: 999,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              fontSize: 15,
              color: colors.text,
              maxHeight: 120,
            }}
          />
          <Pressable
            disabled={!draft.trim() || send.isPending}
            onPress={() => send.mutate(draft.trim())}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: draft.trim() ? colors.accent : colors.chip,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Feather name="chevron-right" size={20} color={draft.trim() ? colors.accentText : colors.textDim} />
          </Pressable>
        </View>
        {send.isError ? (
          <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.sm }}>Didn&apos;t send. Try again.</Text>
        ) : null}
      </SellerScreen>
    </KeyboardAvoidingView>
  );
}
