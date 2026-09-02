import { ScrollView, Text } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { colors, fonts, spacing } from "../../lib/theme";

// Terms, privacy and the returns policy — reachable from Settings and from the sign-in screen.
// Held as text in the app rather than a WebView so it stays readable offline and matches the app's
// typography instead of dropping someone into a web page mid-flow.

const POLICIES: Record<string, { title: string; body: string }> = {
  terms: {
    title: "Terms of Service",
    body:
      "VYA is a marketplace. Each store on VYA is an independent seller and is responsible for the pieces it lists, " +
      "the accuracy of its descriptions, and fulfilling its own orders.\n\n" +
      "When you buy, you are buying from that store. Payment is taken by the store through its own checkout, and the " +
      "store's terms apply to that sale alongside these.\n\n" +
      "For the current, complete terms, see vyaplatform.com/terms.",
  },
  privacy: {
    title: "Privacy",
    body:
      "We collect your email address so you can sign in, and we keep a record of what you save and buy so the app can " +
      "show it back to you.\n\n" +
      "We use what you browse to decide what to show you on the home tab. You can sign out at any time, which removes " +
      "your session from this device.\n\n" +
      "For the current, complete policy, see vyaplatform.com/privacy.",
  },
  returns: {
    title: "Returns",
    body:
      "Return policies are set by each store, not by VYA, because each store is the seller. A store's policy is shown " +
      "on every one of its pieces, under Returns.\n\n" +
      "If something arrives not as described, message the store from your Messages tab — that conversation is the " +
      "fastest route to a resolution.",
  },
};

export default function PolicyScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const policy = POLICIES[String(slug ?? "")] ?? {
    title: "Not found",
    body: "That policy doesn’t exist. Try Settings for the current list.",
  };

  return (
    <>
      <Stack.Screen options={{ title: policy.title }} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>{policy.title}</Text>
        <Text style={{ marginTop: spacing.lg, fontSize: 15, lineHeight: 23, color: colors.textMuted }}>{policy.body}</Text>
      </ScrollView>
    </>
  );
}
