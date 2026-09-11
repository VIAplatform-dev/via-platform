import { useEffect, useState } from "react";
import { Linking, Pressable, Switch, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPut } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen } from "../../components/seller/Screen";
import { PREF_ROWS, DEFAULT_PREFS, normalizePrefs, toggled, applyPatch, type Prefs } from "../../lib/seller/notifications";
import { registerForPush, lastPushStatus, type PushStatus } from "../../lib/push";

// Sales and messages default ON; everything else opts in.
//
// A phone that buzzes for nothing gets silenced, and then the two that matter — a piece sold, a
// buyer replied — are lost with it.
//
// Preferences live on the server (/api/store/notification-prefs), one row per store, so every
// device and the web agree. A toggle flips at once and sends a patch naming only that key; if the
// save fails it flips back and says so. Whether THIS phone can receive a push at all is a separate
// question (lib/push.ts), answered at the top of the push group.

export default function NotificationsScreen() {
  const { storeSlug } = useAuth();
  const q = useQuery({
    queryKey: ["store", "notification-prefs"],
    queryFn: () => apiGet<{ prefs: unknown }>("/api/store/notification-prefs"),
    enabled: !!storeSlug,
  });
  // Local wins once she has touched something; until then the server's answer, and before that
  // the defaults — which are also what the server would say for a store with no row.
  const [local, setLocal] = useState<Prefs | null>(null);
  const prefs = local ?? (q.data ? normalizePrefs(q.data.prefs) : DEFAULT_PREFS);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [push, setPush] = useState<PushStatus | null>(lastPushStatus());
  useEffect(() => {
    let live = true;
    registerForPush().then((s) => { if (live) setPush(s); });
    return () => { live = false; };
  }, []);

  async function flip(group: "push" | "email", key: string) {
    const before = prefs;
    const patch = toggled(before, group, key);
    setLocal(applyPatch(before, patch));
    setSaveErr(null);
    try {
      const r = await apiPut<{ prefs: unknown }>("/api/store/notification-prefs", patch);
      setLocal(normalizePrefs(r.prefs));
    } catch {
      setLocal(before);
      setSaveErr("Couldn't save — try again");
    }
  }

  const pushUnavailable = push === "unavailable";

  return (
    <SellerScreen title="Notifications" back>
      {saveErr ? (
        <View style={{ backgroundColor: colors.chip, borderRadius: 12, padding: spacing.md, marginTop: spacing.lg }}>
          <Text style={{ fontSize: 13, color: colors.text }}>{saveErr}</Text>
        </View>
      ) : null}

      {(["push", "email"] as const).map((group) => (
        <View key={group} style={{ marginTop: spacing.xl }}>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginBottom: spacing.sm }}>{group.toUpperCase()}</Text>

          {group === "push" && push === "denied" ? (
            <Pressable
              onPress={() => void Linking.openSettings()}
              style={{ backgroundColor: colors.chip, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm }}
            >
              <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>Push is off for this phone</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                Notifications are blocked in your phone&apos;s settings. Tap to open them.
              </Text>
            </Pressable>
          ) : null}

          {group === "push" && pushUnavailable ? (
            // No dead toggles: a switch that can never buzz this phone is a promise the app can't keep.
            <View style={{ backgroundColor: colors.chip, borderRadius: 12, padding: spacing.md }}>
              <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>Push isn&apos;t available in this build</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                Your choices are saved for the store; they take effect on a phone running the App Store build.
              </Text>
            </View>
          ) : (
            PREF_ROWS.filter((p) => p.group === group).map((p) => (
              <View key={p.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{p.label}</Text>
                <Switch
                  value={p.group === "push" ? prefs.push[p.key] : prefs.email[p.key]}
                  onValueChange={() => void flip(p.group, p.key)}
                  disabled={q.isPending && !!storeSlug}
                  trackColor={{ true: colors.positive, false: colors.chip }}
                />
              </View>
            ))
          )}
        </View>
      ))}

      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
        Sales and messages are on by default. Everything else you opt into — a phone that buzzes for
        nothing gets silenced.
      </Text>
    </SellerScreen>
  );
}
