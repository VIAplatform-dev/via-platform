import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { colors, spacing } from "../../lib/theme";
import { SellerScreen } from "../../components/seller/Screen";

// Sales and messages default ON; everything else opts in.
//
// A phone that buzzes for nothing gets silenced, and then the two that matter — a piece sold, a
// buyer replied — are lost with it.
//
// NOT YET WIRED: these are local-only until push registration exists. There is no notification
// preferences endpoint under /api/store/*, so persisting them would mean inventing one. They are
// here because the drawer promises the screen; the toggles hold for the session and the wiring
// lands with Expo push.

type Pref = { key: string; label: string; group: "PUSH" | "EMAIL"; on: boolean };

const DEFAULTS: Pref[] = [
  { key: "sold", label: "A piece sells", group: "PUSH", on: true },
  { key: "message", label: "A buyer messages", group: "PUSH", on: true },
  { key: "offer", label: "An offer comes in", group: "PUSH", on: true },
  { key: "payout", label: "A payout lands", group: "PUSH", on: false },
  { key: "daily", label: "Daily summary", group: "EMAIL", on: false },
  { key: "weekly", label: "Weekly numbers", group: "EMAIL", on: true },
  { key: "needs", label: "Something needs you", group: "EMAIL", on: true },
];

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const toggle = (key: string) => setPrefs((p) => p.map((x) => (x.key === key ? { ...x, on: !x.on } : x)));

  return (
    <SellerScreen title="Notifications" back>
      {(["PUSH", "EMAIL"] as const).map((group) => (
        <View key={group} style={{ marginTop: spacing.xl }}>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginBottom: spacing.sm }}>{group}</Text>
          {prefs.filter((p) => p.group === group).map((p) => (
            <View key={p.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{p.label}</Text>
              <Switch value={p.on} onValueChange={() => toggle(p.key)} trackColor={{ true: colors.positive, false: colors.chip }} />
            </View>
          ))}
        </View>
      ))}
      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xl, lineHeight: 18 }}>
        Sales and messages are on by default. Everything else you opt into — a phone that buzzes for
        nothing gets silenced.
      </Text>
    </SellerScreen>
  );
}
