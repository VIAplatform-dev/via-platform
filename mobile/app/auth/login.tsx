import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { colors, fonts, spacing } from "../../lib/theme";

// Sign in. Email link first, Google second — recovered from the shipped build, including its
// fallback line when Google fails: "Couldn't sign in with Google. Try again or use email."
//
// The email path deliberately does NOT wait for the person to come back. Requesting the link ends
// the interaction here; tapping the link opens auth/callback, which finishes the sign-in. Anything
// else means holding a spinner on screen while someone leaves for their mail app.

export default function LoginScreen() {
  const { requestMagicLink, user, devMode } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dev API signs a token immediately instead of mailing; if that happened we're already in.
  if (user) {
    router.replace("/(tabs)");
    return null;
  }

  async function send() {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestMagicLink(trimmed);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t send the link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>Check your email</Text>
        <Text style={{ marginTop: spacing.md, fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
          We sent a link to {email.trim()}. Tap the link from this device to sign in.
        </Text>
        <Pressable onPress={() => { setSent(false); setError(null); }} style={{ marginTop: spacing.xl }}>
          <Text style={{ fontSize: 15, color: colors.text, textDecorationLine: "underline" }}>Back to Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: "center" }}>
      <Text style={{ fontFamily: fonts.serif, fontSize: 32, color: colors.text }}>VYA</Text>
      <Text style={{ marginTop: spacing.sm, fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
        The curated vintage marketplace.
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@email.com"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        onSubmitEditing={send}
        style={{
          marginTop: spacing.xxl, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
          paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: 16, color: colors.text,
          backgroundColor: colors.bgCard,
        }}
      />

      {error ? <Text style={{ marginTop: spacing.sm, fontSize: 13, color: "#B3261E" }}>{error}</Text> : null}

      <Pressable
        onPress={send}
        disabled={busy}
        style={{
          marginTop: spacing.lg, backgroundColor: colors.accent, borderRadius: 10,
          paddingVertical: spacing.lg, alignItems: "center", opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? <ActivityIndicator color={colors.accentText} /> : <Text style={{ color: colors.accentText, fontSize: 16 }}>Email me a link</Text>}
      </Pressable>

      <Text style={{ marginTop: spacing.xl, fontSize: 12, lineHeight: 18, color: colors.textDim, textAlign: "center" }}>
        {devMode
          ? "Development build — signing in automatically. If you're seeing this, check EXPO_PUBLIC_DEV_ADMIN_PASSWORD in mobile/.env.local."
          : "Signing in gives you the full catalogue, your obsessions and your orders."}
      </Text>
    </View>
  );
}
