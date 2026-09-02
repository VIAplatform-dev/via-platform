import { Alert, Linking, Pressable, ScrollView, Share, Text, View } from "react-native";
import Constants from "expo-constants";
import { Link } from "expo-router";
import { useAuth } from "../lib/auth";
import { colors, fonts, spacing } from "../lib/theme";

// Settings. Deliberately short: the things a person might actually want to change or read, and the
// version, which is the first thing worth knowing when someone reports a bug.

function Row({ label, onPress, href, hint }: { label: string; onPress?: () => void; href?: string; hint?: string }) {
  const inner = (
    <View style={{ paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
      {hint ? <Text style={{ marginTop: 2, fontSize: 12, color: colors.textDim }}>{hint}</Text> : null}
    </View>
  );
  if (href) return <Link href={href} asChild><Pressable>{inner}</Pressable></Link>;
  return <Pressable onPress={onPress}>{inner}</Pressable>;
}

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {user ? (
        <View style={{ paddingBottom: spacing.lg }}>
          <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.textDim }}>Signed in as</Text>
          <Text style={{ marginTop: 2, fontSize: 15, color: colors.text }}>{user.email}</Text>
        </View>
      ) : null}

      <Row label="Sizes" href="/account/sizes" hint="What we filter your feed by" />
      <Row label="Saved Searches" href="/account/saved-searches" />
      <Row
        label="Tell a friend"
        onPress={() => { void Share.share({ message: "I'm on VYA — the curated vintage marketplace. Join me: https://vyaplatform.com" }); }}
      />
      <Row label="Terms of Service" href="/policy/terms" />
      <Row label="Privacy" href="/policy/privacy" />
      <Row label="Returns" href="/policy/returns" />
      <Row label="Contact us" onPress={() => { void Linking.openURL("mailto:hello@vyaplatform.com"); }} />

      {user ? (
        <Pressable
          onPress={() =>
            Alert.alert("Sign out?", "You'll need to sign in again to see your obsessions and orders.", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => { void signOut(); } },
            ])
          }
          style={{ marginTop: spacing.xl }}
        >
          <Text style={{ fontSize: 15, color: colors.text, textDecorationLine: "underline" }}>Sign out</Text>
        </Pressable>
      ) : null}

      <Text style={{ marginTop: spacing.xxl, fontSize: 12, color: colors.textDim }}>VYA {version}</Text>
    </ScrollView>
  );
}
