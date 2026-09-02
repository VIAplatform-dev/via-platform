import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { SIZE_GROUPS } from "../lib/sizes";
import { CATEGORY_OPTIONS, EMPTY_FILTERS, SORTS, activeCount, type Filters } from "../lib/filters";
import { colors, eyebrow, fonts, spacing } from "../lib/theme";

// The filter sheet.
//
// Edits a DRAFT and only hands it back on Apply. Filtering live as you tap would refetch on every
// chip — and worse, the list behind the sheet would reshuffle under a half-made decision.
//
// Cancel throws the draft away; Clear resets it but leaves the sheet open, because clearing is
// usually the start of choosing again rather than the end of filtering.

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999,
        borderWidth: 1, borderColor: on ? colors.accent : colors.border,
        backgroundColor: on ? colors.accent : "transparent",
      }}
    >
      <Text style={{ fontSize: 14, color: on ? colors.accentText : colors.text }}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={eyebrow}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>{children}</View>
    </View>
  );
}

export default function FilterSheet({
  visible, value, onClose, onApply, hideCategories, hideStores,
}: {
  visible: boolean;
  value: Filters;
  onClose: () => void;
  onApply: (f: Filters) => void;
  /** A category page already IS a category filter; offering it again is confusing. */
  hideCategories?: boolean;
  hideStores?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Filters>(value);

  // Reopening should show what is currently applied, not the last abandoned draft.
  useEffect(() => { if (visible) setDraft(value); }, [visible, value]);

  const stores = useQuery({
    queryKey: ["stores"],
    queryFn: () => apiGet<{ stores: { slug: string; name: string }[] }>("/api/public/stores"),
    enabled: visible && !hideStores,
  });

  const toggle = (key: "sizes" | "categories" | "stores", v: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(v) ? d[key].filter((x) => x !== v) : [...d[key], v] }));

  const n = activeCount(draft);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable onPress={onClose} hitSlop={10}><Feather name="x" size={24} color={colors.text} /></Pressable>
          <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.text }}>Filter</Text>
          <Pressable onPress={() => setDraft(EMPTY_FILTERS)} hitSlop={10}>
            <Text style={{ fontSize: 15, color: n ? colors.text : colors.textDim }}>Clear</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
          <Section title="Sort">
            {SORTS.map((s) => (
              <Chip key={s.value} label={s.label} on={draft.sort === s.value} onPress={() => setDraft((d) => ({ ...d, sort: s.value }))} />
            ))}
          </Section>

          {hideCategories ? null : (
            <Section title="Category">
              {CATEGORY_OPTIONS.map((c) => (
                <Chip key={c} label={c} on={draft.categories.includes(c.toLowerCase())} onPress={() => toggle("categories", c.toLowerCase())} />
              ))}
            </Section>
          )}

          {SIZE_GROUPS.map((g) => (
            <Section key={g.label} title={`Size · ${g.label}`}>
              {g.options.map((o) => (
                <Chip key={`${g.label}-${o}`} label={o} on={draft.sizes.includes(o)} onPress={() => toggle("sizes", o)} />
              ))}
            </Section>
          ))}

          <View style={{ marginTop: spacing.xl }}>
            <Text style={eyebrow}>Price</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md }}>
              {(["priceMin", "priceMax"] as const).map((key, i) => (
                <View key={key} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
                  <Text style={{ fontSize: 16, color: colors.textMuted }}>$</Text>
                  <TextInput
                    value={draft[key] != null ? String(draft[key]) : ""}
                    onChangeText={(t) => {
                      const digits = t.replace(/[^0-9]/g, "");
                      setDraft((d) => ({ ...d, [key]: digits ? Number(digits) : null }));
                    }}
                    keyboardType="number-pad"
                    placeholder={i === 0 ? "Min" : "Max"}
                    placeholderTextColor={colors.textDim}
                    style={{ flex: 1, fontSize: 16, color: colors.text }}
                  />
                </View>
              ))}
            </View>
          </View>

          {hideStores ? null : (
            <Section title="Store">
              {(stores.data?.stores ?? []).map((s) => (
                <Chip key={s.slug} label={s.name} on={draft.stores.includes(s.slug)} onPress={() => toggle("stores", s.slug)} />
              ))}
            </Section>
          )}
        </ScrollView>

        <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Pressable onPress={() => { onApply(draft); onClose(); }} style={{ backgroundColor: colors.accent, paddingVertical: spacing.lg, alignItems: "center" }}>
            <Text style={{ color: colors.accentText, fontSize: 15, letterSpacing: 1.8, textTransform: "uppercase" }}>
              {n ? `Apply · ${n}` : "Apply"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
