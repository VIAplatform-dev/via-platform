import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { loadSizes, saveSizes, SIZE_GROUPS } from "../../lib/sizes";
import { colors, fonts, spacing } from "../../lib/theme";

// My Sizes. Saved as you tap — there is no Save button, because a preference screen that can be
// left in an unsaved state is a preference screen that silently does nothing.

export default function SizesScreen() {
  const [selected, setSelected] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { loadSizes().then((s) => { setSelected(s); setReady(true); }); }, []);

  function toggle(size: string) {
    setSelected((prev) => {
      const next = prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size];
      void saveSizes(next);
      return next;
    });
  }

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>My Sizes</Text>
      <Text style={{ marginTop: spacing.sm, fontSize: 13, lineHeight: 19, color: colors.textMuted }}>
        Your sizes are saved on this device. Sign in to sync across devices (coming soon).
      </Text>

      {SIZE_GROUPS.map((group) => (
        <View key={group.label} style={{ marginTop: spacing.xl }}>
          <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.textDim }}>{group.label}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
            {group.options.map((size) => {
              const on = selected.includes(size);
              return (
                <Pressable
                  key={`${group.label}-${size}`}
                  onPress={() => toggle(size)}
                  style={{
                    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999,
                    borderWidth: 1, borderColor: on ? colors.accent : colors.border,
                    backgroundColor: on ? colors.accent : colors.bgCard,
                  }}
                >
                  <Text style={{ fontSize: 14, color: on ? colors.accentText : colors.text }}>{size}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
