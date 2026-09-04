import { useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fonts } from "../../../lib/theme";
import { useDraft } from "../../../lib/seller/draft";
import { publishListing } from "../../../lib/seller/intake";

// Review — four rows, each with what VYA decided and a way to disagree.
//
// Price shows how many comparable sales it read, because a number with no reasoning behind it is
// one she will override every time. "14 comps" is the difference between a guess and a finding.

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { photos, fields, setFields, imageUrls, compsCount, reset } = useDraft();
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | "active" | "draft">(null);
  const [error, setError] = useState<string | null>(null);

  // Typed as one shape so `note` exists on every row — a union would make it present on Price
  // only, which TypeScript rightly refuses to read off the others.
  const rows: { key: keyof typeof fields; label: string; value?: string; note?: string | null }[] = [
    { key: "brand", label: "Brand", value: fields.brand },
    { key: "price", label: "Price", value: fields.price, note: compsCount ? `${compsCount} comps` : null },
    { key: "condition", label: "Condition", value: fields.condition },
    { key: "category", label: "Category", value: fields.category },
  ];

  async function save(status: "active" | "draft") {
    setError(null);
    setSaving(status);
    try {
      await publishListing({ ...fields, imageUrls }, status);
      // The new piece has to show up wherever pieces are counted.
      await qc.invalidateQueries({ queryKey: ["store", "items"] });
      await qc.invalidateQueries({ queryKey: ["store", "overview", 1] });
      reset();
      router.dismissAll();
      router.replace("/(seller)/inventory");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {photos.slice(0, 4).map((p, i) => (
          <Image key={`${p}-${i}`} source={{ uri: p }} style={{ width: 62, height: 62, borderRadius: 8, backgroundColor: colors.chip }} />
        ))}
      </View>

      <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text, marginTop: spacing.xl }}>
        {fields.title ?? "New piece"}
      </Text>

      <View style={{ marginTop: spacing.lg }}>
        {rows.map((r) => (
          <View key={r.key} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
            <Text style={{ width: 92, fontSize: 14, color: colors.textMuted }}>{r.label}</Text>
            {editing === r.key ? (
              <TextInput
                autoFocus
                value={(fields as Record<string, string | undefined>)[r.key] ?? ""}
                onChangeText={(v) => setFields({ ...fields, [r.key]: v })}
                onBlur={() => setEditing(null)}
                style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" }}
              />
            ) : (
              <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>
                {r.value || "—"}
              </Text>
            )}
            {r.note ? (
              <Text style={{ fontSize: 13, color: colors.positive, marginRight: spacing.md }}>{r.note}</Text>
            ) : null}
            <Pressable hitSlop={8} onPress={() => setEditing(editing === r.key ? null : r.key)}>
              <Text style={{ fontSize: 14, color: colors.accent, fontWeight: "600" }}>
                {editing === r.key ? "Done" : "Change"}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      {error ? <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
        <Pressable
          disabled={saving !== null}
          onPress={() => void save("active")}
          style={{ flex: 2, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "600" }}>
            {saving === "active" ? "Listing…" : "List it"}
          </Text>
        </Pressable>
        <Pressable
          disabled={saving !== null}
          onPress={() => void save("draft")}
          style={{ flex: 1, backgroundColor: colors.chip, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {saving === "draft" ? "Saving…" : "Draft"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
