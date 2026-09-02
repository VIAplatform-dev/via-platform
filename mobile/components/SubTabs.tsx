import { Pressable, Text, View } from "react-native";
import { colors, fonts, spacing } from "../lib/theme";

// The underlined row that splits a tab in two or three — Obsessions / Sold Out / Searches, and
// Community / Messages. Serif, like the title above it; the active one is full-strength with a rule
// under it, the rest are muted with no rule.

export default function SubTabs<T extends string>({
  tabs, value, onChange,
}: { tabs: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.bg }}>
      {tabs.map((t) => {
        const on = t === value;
        return (
          <Pressable key={t} onPress={() => onChange(t)} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 19, color: on ? colors.text : colors.textDim, paddingBottom: spacing.sm }}>
              {t}
            </Text>
            <View style={{ height: 2, alignSelf: "stretch", marginHorizontal: spacing.xl, backgroundColor: on ? colors.text : "transparent" }} />
          </Pressable>
        );
      })}
    </View>
  );
}
