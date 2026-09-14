import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../lib/auth";
import { destinationFor, takeIntent } from "../../lib/signin-intent";
import { colors, fonts, spacing } from "../../lib/theme";

// Where the emailed link lands. The deep link carries the one-time token as `?token=`; exchanging it
// for a session JWT is the whole job of this screen.
//
// It is a screen rather than a silent handler because the exchange can fail — an expired link, a
// link opened on a different device — and that has to be sayable. A silent failure would drop
// someone back on the sign-in form with no idea why.

export default function AuthCallback() {
  const { verifyMagicLink, user } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof params.token === "string" ? params.token : null;
    if (!token) {
      setError("That link is missing its sign-in code.");
      return;
    }
    verifyMagicLink(token)
      .then((slug) => {
        // DISMISS THE SHEET FIRST. The emailed link can open the app while auth/login is
        // presented as a modal, and replacing from inside a modal keeps the presentation — so
        // the whole signed-in app rendered in a card with a grey gutter above it that could be
        // swiped away. Dismiss back to the root, then replace.
        try { router.dismissAll(); } catch { /* nothing presented — a cold open from the link */ }
        // A SELLER LANDS IN HER OWN APP.
        //
        // This replaced to /(tabs) whatever the link was for, so a store owner who signed in ended
        // up in the shopper marketplace with no route to her workspace — the seller half of the app
        // was simply unreachable from a fresh sign-in. The verify call already knows which store the
        // address belongs to; the sign-in screen has always routed on it (app/auth/login.tsx) and
        // this is the same rule for the emailed link.
        // WHICH DOOR SHE CAME THROUGH. A store sign-in that finds no shop must not quietly become
        // a shopper sign-in — she asked for her shop and is owed a sentence. See signin-intent.ts.
        void takeIntent().then((intent) => {
          const to = destinationFor(slug, intent, user?.email ?? null);
          if (to.route === "/auth/no-store") router.replace({ pathname: "/auth/no-store", params: { email: to.email ?? "" } });
          else router.replace(to.route);
        });
      })
      .catch(() => setError("That link has expired or was already used. Request a new one."));
  }, [params.token, verifyMagicLink]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
      {error ? (
        <>
          <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.text, textAlign: "center" }}>Couldn’t sign you in</Text>
          <Text style={{ marginTop: spacing.md, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: "center" }}>{error}</Text>
          <Text onPress={() => router.replace("/auth/login")} style={{ marginTop: spacing.xl, fontSize: 15, color: colors.text, textDecorationLine: "underline" }}>
            Back to Sign In
          </Text>
        </>
      ) : (
        <ActivityIndicator color={colors.text} />
      )}
    </View>
  );
}
