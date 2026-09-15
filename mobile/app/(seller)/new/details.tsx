import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fonts, radius } from "../../../lib/portal-theme";
import { useDraft } from "../../../lib/seller/draft";
import { uploadPhoto } from "../../../lib/seller/intake";
import { filledFields } from "../../../lib/seller/listing";
import { InlineField } from "../../../components/seller/Form";
import { SelectRow } from "../../../components/seller/Select";
import { CONDITION_GRADES } from "../../../lib/seller/intake-shape";
import { CATEGORY_SLUGS, CATEGORY_LABELS } from "../../../lib/seller/categories";

/** What each grade means, in her words rather than a scale nobody defines. Same lines as Review. */
const CONDITION_HINTS: Record<string, string> = {
  Mint: "Unworn, as it left the shop.",
  Excellent: "Worn and cared for. No visible flaws.",
  "Very good": "Light wear. Nothing that draws the eye.",
  Good: "Honest wear, or a small flaw worth naming.",
  Fair: "Needs work, and the price says so.",
};

// Details: the same shape as the desktop: a form, with "Fill with AI" BESIDE it rather than in
// front of it.
//
// She types the brand and era she can read off the label. The pricer has taken those as inputs all
// along and nothing ever asked her for them, so it guessed at things she could simply have told it
// and the comps were worse for it. Cost sets a floor and feeds the P&L.
//
// NOTHING HERE REQUIRES THE AI. "I'll fill it in myself" saves straight to Drafts without a single
// paid call, which is the path that still works when the month's allowance is gone, and the
// reason it is a real button rather than a fallback nobody tested.

const FIELDS = [
  { key: "brand", label: "Brand", placeholder: "Prada", optional: false },
  { key: "era", label: "Era or year", placeholder: "Late 1990s", optional: false },
  { key: "material", label: "Material", placeholder: "Re-Nylon, leather trim", optional: true },
  { key: "colour", label: "Colour", placeholder: "Chocolate brown", optional: true },
  { key: "size", label: "Size", placeholder: "One size", optional: true },
  { key: "cost", label: "Cost", placeholder: "what you paid", optional: false },
] as const;

export default function DetailsScreen() {
  const insets = useSafeAreaInsets();
  const { photos, typed, setTyped, fields, setFields, setImageUrls } = useDraft();
  const [saving, setSaving] = useState<null | "ai" | "manual">(null);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setTyped({ ...typed, [k]: v });

  /** Photos have to become URLs before either path can run. Intake takes URLs, not bytes. */
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

  /**
   * The no-AI path, and it goes to Review, not straight to Inventory.
   *
   * IT USED TO PUBLISH A STUB. Six fields went up as a draft called "Prada piece" and she landed
   * back in Inventory, having never been asked for a price, a description, measurements, flaws or
   * what it ships as. The only way to any of those was to reopen the piece afterwards, so "all the
   * fields" existed on precisely one route through this flow: the one that spent an AI call.
   * Condition and Category weren't even sent. This screen asks for them and this function dropped
   * them on the floor.
   *
   * Review is already the full form, and it already knows how to publish a piece that has no itemId
   * (it calls publishListing itself). So skipping the AI now means skipping the AI, not skipping
   * the rest of the listing.
   */
  async function fillItInMyself() {
    setError(null);
    setSaving("manual");
    try {
      const urls = await upload();
      setFields({
        ...fields,
        ...filledFields(typed),
        // A title so Review has a heading; hers the moment she edits the row.
        ...(fields.title || typed.title ? {} : typed.brand ? { title: `${typed.brand} piece` } : {}),
      });
      setImageUrls(urls);
      router.push("/(seller)/new/review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload those photos.");
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
          style={{ backgroundColor: colors.chip, borderRadius: radius, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
            {saving === "ai" ? "Uploading…" : "Fill with AI"}
          </Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
        Fill in what you know, then let AI do the rest.
      </Text>

      <View style={{ marginTop: spacing.lg }}>
        {FIELDS.map((f) => (
          // InlineField, so tapping the LABEL puts the cursor in the box. It used to be a bare row:
          // the label owned 110pt on the left and swallowed every tap that landed on it, which is
          // where a thumb goes when the word names the thing you want to change.
          <InlineField
            key={f.key}
            label={f.label}
            labelWidth={110}
            value={typed[f.key] ?? ""}
            onChangeText={(v) => set(f.key, v)}
            placeholder={f.placeholder}
            keyboardType={f.key === "cost" ? "numeric" : "default"}
            trailing={f.optional ? <Text style={{ fontSize: 10, letterSpacing: 1, color: colors.textDim }}>OPTIONAL</Text> : null}
          />
        ))}
      </View>

      {/* THE TWO A PHOTOGRAPH CANNOT ANSWER.
          Condition is a judgement. A picture cannot feel a thinning seam or smell smoke, and a
          seller who has handled the piece is simply more right than a model looking at it. It was
          drafted by the AI and shown for correction two screens later, which is the wrong order:
          the correction is the part she is qualified for.
          Category is the same, and it carries more than it looks: measurements are per-category, so
          getting it wrong here means the wrong template later. Both are pickers rather than boxes,
          there is one right answer and it is on a list. */}
      <View style={{ marginTop: spacing.lg }}>
        <SelectRow
          label="Condition"
          value={typed.condition ?? null}
          options={CONDITION_GRADES.map((g) => ({ key: g, label: g, hint: CONDITION_HINTS[g] }))}
          onChange={(v) => set("condition", v ?? "")}
          placeholder="How it is now"
          palette={colors}
        />
        <SelectRow
          label="Category"
          value={typed.category ?? null}
          options={CATEGORY_SLUGS.map((slug) => ({ key: slug, label: CATEGORY_LABELS[slug] ?? slug }))}
          onChange={(v) => set("category", v ?? "")}
          placeholder="What it is"
          palette={colors}
        />
      </View>

      {error ? <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
        <Pressable
          disabled={saving !== null}
          onPress={() => void fillWithAI()}
          style={{ flex: 2, backgroundColor: colors.accent, borderRadius: radius, paddingVertical: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "600" }}>List it</Text>
        </Pressable>
        <Pressable
          disabled={saving !== null}
          onPress={() => void fillItInMyself()}
          style={{ flex: 1.1, backgroundColor: colors.chip, borderRadius: radius, paddingVertical: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
            {saving === "manual" ? "Uploading…" : "I'll fill it in"}
          </Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.md, textAlign: "center" }}>
        Either way you land on the same form, with every field. “I’ll fill it in” spends no AI at all.
      </Text>
    </ScrollView>
  );
}
