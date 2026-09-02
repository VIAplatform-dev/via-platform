import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, spacing } from "../lib/theme";

// The Save / Filter row that sits above a listing.
//
// SAVE IS NOT A BOOKMARK — it saves the SEARCH. On a marketplace where every piece is one-of-one,
// "shoes, size 38, under $300" is a standing request: nothing matching it may exist today and three
// things may exist next week. That is why it writes to /api/mobile/saved-searches and turns up in
// Obsessions › Searches with a count of what has landed since.

export default function ListToolbar({
  onSave, onFilter, saved, filterCount,
}: { onSave?: () => void; onFilter?: () => void; saved?: boolean; filterCount?: number }) {
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        {onSave ? (
          <Pressable
            onPress={onSave}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
          >
            <Feather name={saved ? "check" : "bookmark"} size={17} color={colors.text} />
            <Text style={{ fontSize: 16, color: colors.text }}>{saved ? "Saved" : "Save"}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onFilter}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
        >
          <Feather name="sliders" size={17} color={colors.text} />
          <Text style={{ fontSize: 16, color: colors.text }}>
            Filter{filterCount ? ` · ${filterCount}` : ""}
          </Text>
        </Pressable>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border }} />
    </View>
  );
}
