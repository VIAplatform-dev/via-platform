import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../lib/auth";
import { colors, fonts, spacing } from "../../lib/theme";

// Where the emailed link lands. The deep link carries the one-time token as `?token=`; exchanging it
// for a session JWT is the whole job of this screen.
//
// It is a screen rather than a silent handler because the exchange can fail — an expired link, a
// link opened on a different device — and that has to be sayable. A silent failure would drop
// someone back on the sign-in form with no idea why.

export default function AuthCallback() {
  const { verifyMagicLink } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof params.token === "string" ? params.token : null;
    if (!token) {
      setError("That link is missing its sign-in code.");
      return;
    }
    verifyMagicLink(token)
      .then(() => router.replace("/(tabs)"))
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
