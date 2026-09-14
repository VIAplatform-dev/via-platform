import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { rememberIntent } from "../../lib/signin-intent";
import { colors, fonts, spacing } from "../../lib/theme";

// Signing in to a shop, on its own screen.
//
// It was the same email box as the shopper sign-in with a different label on the button, and that
// was wrong in two ways. A store owner pressed "Sign in as a store", typed her address, and if that
// address had no shop she was dropped into the shopper marketplace with nothing said — which is
// indistinguishable from the app being broken. And a link that reads like its own door should open
// its own door.
//
// So: its own screen, its own words, and a remembered intent so the callback can tell her when an
// address has no shop rather than quietly making her a shopper. See lib/signin-intent.ts.
//
// STILL ONE MAGIC LINK underneath. There is no separate store credential to hold; the emailed link
// resolves whose address it is and the callback routes on that. This is a door, not a second lock.
//
// CREATING a shop is deliberately not here. That is a laptop job — a wizard, a catalogue import,
// photographs — and pretending a phone can start it is what used to send people to a browser.

export default function StoreSignIn() {
 const { requestMagicLink } = useAuth();
 const [email, setEmail] = useState("");
 const [busy, setBusy] = useState(false);
 const [sent, setSent] = useState(false);
 const [error, setError] = useState<string | null>(null);

 async function send() {
  const trimmed = email.trim();
  if (!trimmed.includes("@")) {
   setError("Enter the email address your shop is registered to.");
   return;
  }
  setBusy(true);
  setError(null);
  try {
   // Remembered BEFORE the request: the link comes back minutes later, in another app, and by then
   // nothing on screen knows which door she came through.
   await rememberIntent("store");
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
     We sent a link to {email.trim()}. Open it on this phone and it takes you straight to your shop.
    </Text>
    <Pressable onPress={() => { setSent(false); setError(null); }} style={{ marginTop: spacing.xl }}>
     <Text style={{ fontSize: 15, color: colors.text, textDecorationLine: "underline" }}>Use a different address</Text>
    </Pressable>
   </View>
  );
 }

 return (
  <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
   <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl + spacing.md }}>
    <Text style={{ fontFamily: fonts.serif, fontSize: 30, color: colors.text }}>Sign in to your shop</Text>
    <Text style={{ marginTop: spacing.sm, fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
     The address your shop is registered to. We’ll email you a link — no password.
    </Text>

    <TextInput
     value={email}
     onChangeText={(v) => { setEmail(v); if (error) setError(null); }}
     placeholder="you@yourshop.com"
     placeholderTextColor={colors.textDim}
     autoCapitalize="none"
     autoCorrect={false}
     keyboardType="email-address"
     textContentType="emailAddress"
     returnKeyType="go"
     onSubmitEditing={() => void send()}
     style={{
      marginTop: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: 999,
      paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, fontSize: 16, color: colors.text,
      backgroundColor: colors.bgCard,
     }}
    />

    {error ? <Text style={{ marginTop: spacing.md, fontSize: 14, color: "#b3261e" }}>{error}</Text> : null}

    <Pressable
     onPress={() => void send()}
     disabled={busy}
     style={{
      marginTop: spacing.sm + 2, backgroundColor: colors.accent, borderRadius: 999,
      paddingVertical: spacing.lg, alignItems: "center", opacity: busy ? 0.6 : 1,
     }}
    >
     {busy ? <ActivityIndicator color={colors.accentText} />
      : <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "500" }}>Email me a link</Text>}
    </Pressable>

    {/* Setting a shop up is a laptop job, and saying so here stops the "how do I start one" tap
        that used to open a browser. */}
    <Text style={{ marginTop: spacing.lg, fontSize: 13, lineHeight: 19, color: colors.textDim, textAlign: "center" }}>
     Don’t have a shop yet? Setting one up is done on a computer — go to getvya.ai on a laptop.
    </Text>

    <Pressable onPress={() => router.back()} style={{ marginTop: spacing.lg, alignItems: "center" }}>
     <Text style={{ color: colors.textMuted, fontSize: 13, textDecorationLine: "underline" }}>I’m shopping, not selling</Text>
    </Pressable>
   </View>
  </KeyboardAvoidingView>
 );
}
