import { ScrollView, Text, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Link, Redirect } from "expo-router";
import { useAuth } from "../../lib/auth";
import AppHeader from "../../components/AppHeader";
import { colors, eyebrow, fonts, spacing } from "../../lib/theme";

// Account is a short list of destinations, not a settings screen — everything adjustable lives one
// level down under Settings, which is why that row sits apart from the other three.

function Row({
  href, icon, label, hint,
}: { href: string; icon: React.ComponentProps<typeof Feather>["name"]; label: string; hint: string }) {
  return (
    <Link href={href} asChild>
      <Pressable
        style={{
          flexDirection: "row", alignItems: "center", gap: spacing.lg,
          paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
          borderBottomWidth: 1, borderBottomColor: colors.border,
        }}
      >
        <Feather name={icon} size={23} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 19, color: colors.text }}>{label}</Text>
          <Text style={{ marginTop: 2, fontSize: 14, color: colors.textMuted }}>{hint}</Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.textDim} />
      </Pressable>
    </Link>
  );
}

export default function AccountScreen() {
  const { user, storeSlug, loading } = useAuth();

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bgAlt }} />;
  if (!user) return <Redirect href="/auth/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <AppHeader title="Account" />
      <ScrollView>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg, padding: spacing.lg, paddingVertical: spacing.xl }}>
          <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 28, color: colors.accentText }}>
              {(user.name || user.email || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontSize: 17, color: colors.textMuted }}>{user.email}</Text>
        </View>

        <Text style={[eyebrow, { paddingHorizontal: spacing.lg, paddingBottom: spacing.md }]}>My Profile</Text>
        <Row href="/purchases" icon="shopping-bag" label="Purchases" hint="Pieces you've bought" />
        <Row href="/(tabs)/obsessions" icon="heart" label="Saved items" hint="Your obsessions & sold-out finds" />
        <Row href="/(tabs)/community" icon="message-circle" label="Messages" hint="Your conversations with stores" />

        <View style={{ height: spacing.xl }} />
        <Row href="/settings" icon="settings" label="Settings" hint="Sizes, notifications, policies & more" />
        {storeSlug ? <Row href="/store-inbox" icon="inbox" label="Store Inbox" hint={`Customer messages for ${storeSlug}`} /> : null}
      </ScrollView>
    </View>
  );
}
