import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../lib/api";
import { imageUrl } from "../../lib/imageUrl";
import { colors, eyebrow, fonts, spacing } from "../../lib/theme";

// Asking a store about one specific piece.
//
// The API creates the conversation and posts the first message in ONE call, keyed on productId —
// there is no "start a conversation" endpoint to call first. So this screen collects the message,
// sends it, and replaces itself with the thread that came back. Replaces rather than pushes: going
// "back" from the thread should return to the product, not to an empty compose box.

export default function NewMessageScreen() {
  const { productId, storeName, title, image } = useLocalSearchParams<{
    productId?: string; storeName?: string; title?: string; image?: string;
  }>();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: (text: string) =>
      apiPost<{ conversation: { id: number } }>("/api/mobile/messages", { productId: Number(productId), body: text }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      router.replace(`/messages/${r.conversation.id}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn’t send that. Try again."),
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: storeName ? `Message ${storeName}` : "Message" }} />

      {title ? (
        <View style={{ flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ width: 60, height: 74, backgroundColor: colors.bgCard, overflow: "hidden" }}>
            {image ? <Image source={{ uri: imageUrl(String(image)) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={eyebrow}>About</Text>
            <Text numberOfLines={3} style={{ marginTop: 2, fontSize: 15, lineHeight: 20, color: colors.text }}>{title}</Text>
          </View>
        </View>
      ) : null}

      <View style={{ flex: 1, padding: spacing.lg }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.text }}>
          Ask {storeName || "the store"} anything
        </Text>
        <Text style={{ marginTop: spacing.sm, fontSize: 15, lineHeight: 21, color: colors.textMuted }}>
          Measurements, condition, shipping — stores usually reply the same day.
        </Text>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Hi! Is this still available?"
          placeholderTextColor={colors.textDim}
          multiline
          autoFocus
          style={{
            marginTop: spacing.lg, minHeight: 130, borderWidth: 1, borderColor: colors.border,
            padding: spacing.lg, fontSize: 16, lineHeight: 22, color: colors.text, textAlignVertical: "top",
          }}
        />

        {error ? <Text style={{ marginTop: spacing.sm, fontSize: 13, color: "#B3261E" }}>{error}</Text> : null}

        <Pressable
          onPress={() => { const t = draft.trim(); if (t) { setError(null); send.mutate(t); } }}
          disabled={!draft.trim() || send.isPending}
          style={{ marginTop: spacing.lg, backgroundColor: colors.accent, paddingVertical: spacing.lg, alignItems: "center", opacity: draft.trim() && !send.isPending ? 1 : 0.5 }}
        >
          {send.isPending ? <ActivityIndicator color={colors.accentText} /> : (
            <Text style={{ color: colors.accentText, fontSize: 15, letterSpacing: 1.8, textTransform: "uppercase" }}>Send</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
