import { useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fonts } from "../../../lib/theme";
import { useDraft } from "../../../lib/seller/draft";
import { publishListing, uploadPhoto } from "../../../lib/seller/intake";

// Details — the same shape as the desktop: a form, with "Fill with AI" BESIDE it rather than in
// front of it.
//
// She types the brand and era she can read off the label. The pricer has taken those as inputs all
// along and nothing ever asked her for them, so it guessed at things she could simply have told it
// and the comps were worse for it. Cost sets a floor and feeds the P&L.
//
// NOTHING HERE REQUIRES THE AI. "I'll fill it in myself" saves straight to Drafts without a single
// paid call — which is the path that still works when the month's allowance is gone, and the
// reason it is a real button rather than a fallback nobody tested.

const FIELDS = [
  { key: "brand", label: "Brand", placeholder: "Prada", optional: false },
  { key: "era", label: "Era or year", placeholder: "Late 1990s", optional: false },
  { key: "material", label: "Material", placeholder: "Re-Nylon, leather trim", optional: true },
  { key: "size", label: "Size", placeholder: "One size", optional: true },
  { key: "cost", label: "What you paid", placeholder: "140", optional: false },
] as const;

export default function DetailsScreen() {
  const insets = useSafeAreaInsets();
  const { photos, typed, setTyped, setImageUrls } = useDraft();
  const [saving, setSaving] = useState<null | "ai" | "manual">(null);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setTyped({ ...typed, [k]: v });

  /** Photos have to become URLs before either path can run — intake takes URLs, not bytes. */
  async function upload(): Promise<string[]> {
    const urls: string[] = [];
    for (const p of photos) urls.push(await uploadPhoto(p));
    setImageUrls(urls);
    return urls;
  }

  async function fillWithAI() {
    setError(null);
    setSaving("ai");
    try {
      await upload();
      router.push("/(seller)/new/loading");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload those photos.");
    } finally {
      setSaving(null);
    }
  }

  async function saveManually() {
    setError(null);
    setSaving("manual");
    try {
      const urls = await upload();
      await publishListing(
        {
          imageUrls: urls,
          title: typed.brand ? `${typed.brand} piece` : "Untitled piece",
          brand: typed.brand,
          era: typed.era,
          material: typed.material,
          size: typed.size,
        },
        "draft",
      );
      router.dismissAll();
      router.replace("/(seller)/inventory");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that draft.");
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

      <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xl }}>
        <Text style={{ flex: 1, fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>Details</Text>
        <Pressable
          disabled={saving !== null}
          onPress={() => void fillWithAI()}
          style={{ backgroundColor: colors.chip, borderRadius: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
            {saving === "ai" ? "Uploading…" : "Fill with AI"}
          </Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
        Fill in what you know — then let AI do the rest.
      </Text>

      <View style={{ marginTop: spacing.lg }}>
        {FIELDS.map((f) => (
          <View key={f.key} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
            <Text style={{ width: 110, fontSize: 14, color: colors.textMuted }}>{f.label}</Text>
            <TextInput
              value={typed[f.key] ?? ""}
              onChangeText={(v) => set(f.key, v)}
              placeholder={f.placeholder}
              placeholderTextColor={colors.textDim}
              keyboardType={f.key === "cost" ? "numeric" : "default"}
              style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600", paddingVertical: spacing.sm }}
            />
            {f.optional ? <Text style={{ fontSize: 10, letterSpacing: 1, color: colors.textDim }}>OPTIONAL</Text> : null}
          </View>
        ))}
      </View>

      {error ? <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
        <Pressable
          disabled={saving !== null}
          onPress={() => void fillWithAI()}
          style={{ flex: 2, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "600" }}>List it</Text>
        </Pressable>
        <Pressable
          disabled={saving !== null}
          onPress={() => void saveManually()}
          style={{ flex: 1, backgroundColor: colors.chip, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {saving === "manual" ? "Saving…" : "Draft"}
          </Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.md, textAlign: "center" }}>
        Draft saves it with no AI at all.
      </Text>
    </ScrollView>
  );
}
