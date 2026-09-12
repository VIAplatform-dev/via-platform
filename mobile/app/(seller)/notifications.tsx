import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen, Empty } from "../../components/seller/Screen";
import { Loading } from "../../components/seller/Form";
import { needsYouRows, type AttentionRow } from "../../lib/seller/attention";

// What is actually outstanding — not what she'd like to be told about.
//
// This screen used to be the PREFERENCES: a list of push and email switches. That is a settings
// page wearing a bell, and a seller who taps a bell expecting "what needs me" and gets a column of
// toggles has been answered a question she did not ask. The switches moved to
// notification-settings.tsx, reached from Settings → Notifications, which is where she went looking
// for them anyway.
//
// The feed is /api/store/attention — the same rows Home draws under "Needs you", except Home hides
// the two it already shows in more detail (holds by name, the payouts line) and this does not. Here
// the whole list is the point.

export default function NotificationsScreen() {
  const { storeSlug } = useAuth();
  const q = useQuery({
    queryKey: ["store", "attention"],
    queryFn: () => apiGet<{ rows: AttentionRow[] }>("/api/store/attention"),
    enabled: !!storeSlug,
  });

  // Nothing is hidden here, unlike Home — this IS the list.
  const rows = needsYouRows(q.data?.rows ?? [], { holdsShown: false, payoutsShown: false });
  const urgent = rows.filter((r) => r.urgent);
  const rest = rows.filter((r) => !r.urgent);

  const open = (r: (typeof rows)[number]) => {
    if (r.route) router.push({ pathname: r.route.pathname as never, params: r.route.params });
  };

  return (
    <SellerScreen
      title="Notifications"
      back
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      {q.isError ? (
        <Empty>Couldn&apos;t load what needs you.</Empty>
      ) : q.isPending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nothing needs you right now.</Empty>
      ) : (
        <>
          {[
            { label: "NEEDS YOU", items: urgent },
            { label: "WHEN YOU HAVE A MOMENT", items: rest },
          ].map((group) =>
            group.items.length ? (
              <View key={group.label} style={{ marginTop: spacing.lg }}>
                <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginBottom: spacing.xs }}>
                  {group.label}
                </Text>
                {group.items.map((r) => (
                  <Pressable
                    key={r.key}
                    onPress={() => open(r)}
                    style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    <Feather name={r.icon as never} size={18} color={r.urgent ? colors.accent : colors.textMuted} />
                    <Text style={{ flex: 1, fontSize: 15, color: colors.text }} numberOfLines={2}>{r.title}</Text>
                    {r.route ? <Feather name="chevron-right" size={18} color={colors.textDim} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null,
          )}
        </>
      )}

      <Pressable onPress={() => router.push("/(seller)/notification-settings")} hitSlop={8} style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Choose what you&apos;re told about</Text>
      </Pressable>
    </SellerScreen>
  );
}
