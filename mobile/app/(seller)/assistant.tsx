import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost, apiDelete, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts, radius } from "../../lib/portal-theme";
import { pickImageData } from "../../lib/seller/pick-photos";
import {
  SUGGESTIONS, actionChips, changedTheStore, isYesNoQuestion, toApiMessages,
  type Action, type ChatMessage,
} from "../../lib/seller/assistant";
import { RichText } from "../../components/seller/RichText";

// Ask VYA.
//
// The assistant that runs and rebuilds a seller's store, which until now she could only reach on a
// laptop. It is the same endpoint as the web's Sidekick (/api/store/assistant, already carrying the
// phone's bearer token and already in both proxy allowlists) and the same saved thread, so a
// conversation started at the shop counter is there when she opens her laptop that evening.
//
// A SCREEN, NOT A FLOATING BUBBLE. On the web the Sidekick is a launcher pinned bottom-right over
// whatever page she is on, and its panel knows which page that is. Neither half survives the trip:
// this app's bottom-right corner is the tab bar, and a 400x600 panel is most of a phone anyway. So
// the launcher is the sparkle in Home's header and the drawer's first row, and the page context
// comes from `from`, set by whichever of those opened it.
//
// WHAT IS DELIBERATELY NOT HERE: nothing. Every tool the web assistant can call still runs, storefront
// rebuilds included. She cannot SEE a storefront being rebuilt on a phone, which is an argument for
// telling her where to look, not for refusing the request. VYA's reply carries the URL.

const MAX_IMAGES = 4;

function Bubble({ m, last, busy, onAnswer }: { m: ChatMessage; last: boolean; busy: boolean; onAnswer: (a: string) => void }) {
  const mine = m.role === "user";
  const chips = actionChips(m.actions);
  return (
    <View
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "86%",
        backgroundColor: mine ? colors.accent : colors.bgCard,
        borderRadius: radius,
        borderWidth: mine ? 0 : 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        marginBottom: spacing.sm,
      }}
    >
      {m.images && m.images.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm }}>
          {m.images.map((src, i) => (
            <Image key={i} source={{ uri: src }} style={{ width: 64, height: 64, borderRadius: radius }} />
          ))}
        </View>
      ) : null}

      {mine ? (
        m.content ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.accentText }}>{m.content}</Text> : null
      ) : (
        <RichText text={m.content} />
      )}

      {chips.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
          {chips.map((label, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.bgAlt, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
              <Feather name="check" size={10} color={colors.positive} />
              <Text style={{ fontSize: 11, color: colors.positive, fontWeight: "600" }}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Yes/No only on the LAST reply, and only while nothing is in flight. An older question
          answered out of order attaches "Yes" to whatever VYA asked most recently, not to what
          was tapped, and what VYA asks most recently is usually about changing the live store. */}
      {!mine && last && !busy && isYesNoQuestion(m.content) ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable onPress={() => onAnswer("Yes")} style={{ backgroundColor: colors.accent, borderRadius: radius, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.accentText }}>Yes</Text>
          </Pressable>
          <Pressable onPress={() => onAnswer("No")} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>No</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function AssistantScreen() {
  const { user, storeSlug, loading } = useAuth();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const scroller = useRef<ScrollView>(null);
  // The send path reads and writes the thread outside React's render cycle: a suggestion tapped
  // while the previous reply is still landing would otherwise build its request from stale state
  // and silently drop a turn.
  const msgsRef = useRef<ChatMessage[]>([]);
  const busyRef = useRef(false);

  // The saved thread. A seller does not start again every time she opens the app, and the web
  // Sidekick has restored this since it shipped, so an empty phone screen would read as VYA having
  // forgotten a conversation she can see on her laptop.
  useEffect(() => {
    if (!storeSlug) return;
    let alive = true;
    apiGet<{ messages: ChatMessage[] }>("/api/store/assistant")
      .then((d) => {
        if (!alive || !Array.isArray(d?.messages) || !d.messages.length) return;
        msgsRef.current = d.messages;
        setMsgs(d.messages);
      })
      /* allow-swallow: a thread that won't load is a fresh chat, not an error screen */
      .catch(() => {})
      .finally(() => { if (alive) setRestoring(false); });
    return () => { alive = false; };
  }, [storeSlug]);

  useEffect(() => {
    // requestAnimationFrame: the new bubble has to be laid out before its height counts.
    const id = requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(id);
  }, [msgs, busy]);

  const send = useCallback(async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    // A tapped suggestion or a Yes carries no attachments; they belong to what she typed.
    const images = textArg ? [] : attached;
    if ((!text && images.length === 0) || busyRef.current) return;

    const next: ChatMessage[] = [...msgsRef.current, { role: "user", content: text, ...(images.length ? { images } : {}) }];
    msgsRef.current = next;
    setMsgs(next);
    setInput("");
    setAttached([]);
    busyRef.current = true;
    setBusy(true);

    try {
      const d = await apiPost<{ reply?: string; actions?: Action[] }>("/api/store/assistant", {
        messages: toApiMessages(next),
        ...(from ? { page: from } : {}),
      });
      const after: ChatMessage[] = [...msgsRef.current, { role: "assistant", content: d.reply || "(done)", actions: d.actions }];
      msgsRef.current = after;
      setMsgs(after);
      // VYA changed something the rest of the app is drawing. The web fires an event that open
      // panels listen for; here every cached query is stale, because a storefront rebuild can move
      // listings, pages and settings in one turn and there is no telling which tab she opens next.
      if (changedTheStore(d.actions)) void qc.invalidateQueries();
    } catch (e) {
      // The route's own message is the useful one: a 503 means the assistant isn't configured,
      // which is a different thing from a dropped connection and should not read as one.
      const msg = e instanceof ApiError && e.message && !e.message.startsWith("API ")
        ? e.message
        : "Couldn't reach me just now. Try again.";
      const after: ChatMessage[] = [...msgsRef.current, { role: "assistant", content: msg }];
      msgsRef.current = after;
      setMsgs(after);
    }
    busyRef.current = false;
    setBusy(false);
  }, [input, attached, from, qc]);

  async function newChat() {
    msgsRef.current = [];
    setMsgs([]);
    setInput("");
    setAttached([]);
    /* allow-swallow: the thread is already gone from her screen; a failed clear re-reads next open */
    await apiDelete("/api/store/assistant").catch(() => {});
  }

  async function attach() {
    const picked = await pickImageData(MAX_IMAGES - attached.length);
    if (picked.length) setAttached((a) => [...a, ...picked].slice(0, MAX_IMAGES));
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) return <Redirect href="/auth/login" />;
  if (!storeSlug) return <Redirect href="/(tabs)" />;

  const canSend = !busy && (input.trim().length > 0 || attached.length > 0);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header. Drawn here rather than in SellerScreen because that frame is one long ScrollView,
          and a chat needs a log that scrolls under a composer that does not. */}
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(seller)"))} hitSlop={12}>
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.text }}>VYA</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.positive }} />
            <Text style={{ fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.4, color: colors.textMuted }}>YOUR ASSISTANT</Text>
          </View>
        </View>
        <Pressable onPress={() => void newChat()} accessibilityLabel="New chat" hitSlop={12} disabled={busy}>
          <Feather name="edit" size={19} color={busy ? colors.textDim : colors.text} />
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {msgs.length === 0 && !restoring ? (
          <View>
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textMuted, marginBottom: spacing.lg }}>
              I run your store with you: your listings, your storefront, your questions. I remember
              our conversations. Try one of these.
            </Text>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => void send(s)}
                style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.sm }}
              >
                <Text style={{ fontSize: 14, color: colors.text }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {msgs.map((m, i) => (
          <Bubble key={i} m={m} last={i === msgs.length - 1} busy={busy} onAnswer={(a) => void send(a)} />
        ))}

        {busy ? (
          <View style={{ alignSelf: "flex-start", backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
            <ActivityIndicator size="small" color={colors.textDim} />
          </View>
        ) : null}
      </ScrollView>

      {/* Composer */}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md) }}>
        {attached.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
            {attached.map((src, i) => (
              <View key={i}>
                <Image source={{ uri: src }} style={{ width: 52, height: 52, borderRadius: radius }} />
                <Pressable
                  onPress={() => setAttached((a) => a.filter((_, j) => j !== i))}
                  accessibilityLabel="Remove image"
                  hitSlop={8}
                  style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
                >
                  <Feather name="x" size={11} color={colors.accentText} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
          <Pressable
            onPress={() => void attach()}
            disabled={attached.length >= MAX_IMAGES}
            accessibilityLabel="Attach a photo"
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="image" size={20} color={attached.length >= MAX_IMAGES ? colors.textDim : colors.textMuted} />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask, or tell me to do something…"
            placeholderTextColor={colors.textDim}
            multiline
            style={{
              flex: 1,
              backgroundColor: colors.bgCard,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              fontSize: 15,
              lineHeight: 21,
              color: colors.text,
              maxHeight: 140,
            }}
          />
          <Pressable
            disabled={!canSend}
            onPress={() => void send()}
            accessibilityLabel="Send"
            style={{ width: 40, height: 40, borderRadius: radius, backgroundColor: canSend ? colors.accent : colors.bgAlt, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="arrow-up" size={19} color={canSend ? colors.accentText : colors.textDim} />
          </Pressable>
        </View>
        <Text style={{ fontSize: 11, color: colors.textDim, textAlign: "center", marginTop: spacing.sm }}>
          VYA asks before it changes anything.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
