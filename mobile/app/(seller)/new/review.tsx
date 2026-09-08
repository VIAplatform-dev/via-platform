import { useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fonts } from "../../../lib/theme";
import { useDraft } from "../../../lib/seller/draft";
import { flawsFromLine, flawsToLine, costFromText, CONDITION_GRADES, type ConditionGrade } from "../../../lib/seller/intake-shape";
import { publishListing } from "../../../lib/seller/intake";
import { formatMoney } from "../../../lib/seller/home";
import { parcelEstimateFrom, defaultParcelFor, tierForWeight, parcelMismatch, describeParcel } from "../../../lib/seller/parcel";
import { templateFor, unitFor, measurementsFromForm, formatMeasurements, MEASUREMENT_LABELS, type MeasurementKey } from "../../../lib/seller/measurements";
import { apiGet, apiPatch, apiPost } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useQuery } from "@tanstack/react-query";

// Review — a handful of rows, each with what VYA decided and a way to disagree.
//
// Price shows how many comparable sales it read, because a number with no reasoning behind it is
// one she will override every time. "14 comps" is the difference between a guess and a finding.
// Condition is chips on a fixed scale, Ships as is the parcel tier with a warning when her weight
// disagrees with what the piece looks like, and Measurements opens the category's template.

const CONDITION_DEFINITIONS: Record<ConditionGrade, string> = {
  Mint: "Unworn, or as good as.",
  Excellent: "Worn and cared for. No visible flaws.",
  "Very good": "Light, honest wear.",
  Good: "Clearly worn, still lovely.",
  Fair: "Well loved. Visible wear or a repair.",
};

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { photos, fields, setFields, imageUrls, compsCount, priceCents, setPriceCents, itemId, reset } = useDraft();
  const { storeSlug } = useAuth();
  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  // The store's unit for measurements — inches for a US ship-from, cm elsewhere.
  const shipping = useQuery({ queryKey: ["store", "shipping"], queryFn: () => apiGet<{ currency?: string; shipFrom?: { country?: string | null } | null }>("/api/store/shipping"), enabled: !!storeSlug });
  const currency = me.data?.currency ?? "USD";
  const unit = unitFor({ country: shipping.data?.shipFrom?.country, currency: shipping.data?.currency ?? currency });
  const [editing, setEditing] = useState<string | null>(null);
  // Typed as one line while editing; split into the list when she's done, so a comma mid-typing
  // doesn't vanish under her.
  const [flawsLine, setFlawsLine] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measureForm, setMeasureForm] = useState<Partial<Record<MeasurementKey, string>>>(() => {
    const out: Partial<Record<MeasurementKey, string>> = {};
    for (const m of fields.measurements ?? []) out[m.key as MeasurementKey] = String(m.value);
    return out;
  });
  const [saving, setSaving] = useState<null | "active" | "draft">(null);
  const [error, setError] = useState<string | null>(null);

  // Ships as: the AI's parcel when it made one, else the category's default (lib/seller/parcel.ts).
  const estimate = parcelEstimateFrom(fields.parcel) ?? { ...defaultParcelFor(fields.category), source: "category" as const };
  const typedWeight = fields.weightOz && fields.weightOz.trim() ? Number(fields.weightOz) : null;
  const tier = tierForWeight(typedWeight) ?? estimate.tier;
  const mismatch = parcelMismatch({ typedWeightOz: typedWeight, estimate, category: fields.category });
  const measureKeys = templateFor(fields.category);
  const measurementsLine = formatMeasurements(measurementsFromForm(measureForm, unit));

  // Typed as one shape so `note` exists on every row — a union would make it present on Price
  // only, which TypeScript rightly refuses to read off the others.
  const rows: { key: keyof typeof fields; label: string; value?: string; note?: string | null }[] = [
    { key: "brand", label: "Brand", value: fields.brand },
    // Price is held in cents and formatted here; the row edits it back through priceCents.
    { key: "price", label: "Price", value: priceCents !== null ? formatMoney(priceCents, currency) : undefined, note: compsCount ? `${compsCount} comps` : null },
    // What she paid — optional, hers alone, and the one number the profit report cannot do without.
    { key: "cost", label: "Cost", value: fields.cost?.trim() || undefined },
    { key: "condition", label: "Condition", value: fields.condition },
    { key: "flaws", label: "Flaws", value: flawsToLine(fields.flaws) || undefined },
    { key: "category", label: "Category", value: fields.category },
    { key: "weightOz", label: "Ships as", value: describeParcel(tier, typedWeight ?? estimate.weightOz), note: typedWeight == null ? (estimate.source === "ai" ? "estimated" : "by category") : null },
  ];
  const commitFlaws = () => {
    if (flawsLine !== null) setFields({ ...fields, flaws: flawsFromLine(flawsLine) });
    setFlawsLine(null);
  };

  async function save(status: "active" | "draft") {
    setError(null);
    setSaving(status);
    const measurements = measurementsFromForm(measureForm, unit);
    try {
      if (itemId) {
        // Loading already saved this piece as a draft; publishing is an edit of that row, so
        // "List it" never produces a second copy of the same piece in Inventory. Going live uses
        // the same `publish` transition the desktop does, so anything it schedules (cross-listing,
        // publish-at) happens here too.
        await apiPatch(`/api/store/items/${itemId}`, {
          ...(fields.title ? { title: fields.title } : {}),
          ...(fields.brand !== undefined ? { brand: fields.brand } : {}),
          ...(fields.condition !== undefined ? { condition: fields.condition } : {}),
          ...(fields.conditionNote !== undefined ? { conditionNote: fields.conditionNote } : {}),
          ...(fields.category !== undefined ? { category: fields.category } : {}),
          ...(fields.flaws !== undefined ? { flaws: fields.flaws } : {}),
          ...(costFromText(fields.cost) !== undefined ? { cost: costFromText(fields.cost) } : {}),
          ...(typedWeight != null && typedWeight > 0 ? { weightOz: typedWeight } : {}),
          ...(measurements.length ? { measurements } : {}),
          ...(typeof priceCents === "number" && priceCents > 0 ? { price: priceCents / 100 } : {}),
        });
        if (status === "active") await apiPost(`/api/store/items/${itemId}`, { action: "publish" });
      } else {
        await publishListing({ ...fields, measurements, imageUrls, priceCents }, status);
      }
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
          <View key={r.key} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ width: 92, fontSize: 14, color: colors.textMuted }}>{r.label}</Text>
              {editing === r.key && r.key !== "condition" ? (
                <TextInput
                  autoFocus
                  value={r.key === "price"
                    ? (priceCents !== null ? String(priceCents / 100) : "")
                    : r.key === "flaws"
                      ? (flawsLine ?? flawsToLine(fields.flaws))
                      : r.key === "weightOz"
                        ? (fields.weightOz ?? "")
                        : ((fields as Record<string, string | undefined>)[r.key] ?? "")}
                  onChangeText={(v) => {
                    if (r.key === "flaws") setFlawsLine(v);
                    else if (r.key === "price") {
                      // Typed in whole currency, stored in cents — the same units the pricer used.
                      const n = Number(v.replace(/[^0-9.]/g, ""));
                      setPriceCents(Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null);
                    } else if (r.key === "weightOz") setFields({ ...fields, weightOz: v.replace(/[^0-9]/g, "") });
                    else if (r.key === "cost") setFields({ ...fields, cost: v.replace(/[^0-9.]/g, "") });
                    else setFields({ ...fields, [r.key]: v });
                  }}
                  keyboardType={r.key === "price" || r.key === "weightOz" || r.key === "cost" ? "numeric" : "default"}
                  placeholder={r.key === "flaws" ? "scuffed toe, light pilling — comma-separated" : r.key === "weightOz" ? `${estimate.weightOz} oz packed` : r.key === "cost" ? "what you paid" : undefined}
                  placeholderTextColor={colors.textDim}
                  onBlur={() => { if (r.key === "flaws") commitFlaws(); setEditing(null); }}
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
              <Pressable hitSlop={8} onPress={() => { if (editing === "flaws") commitFlaws(); setEditing(editing === r.key ? null : r.key); }}>
                <Text style={{ fontSize: 14, color: colors.accent, fontWeight: "600" }}>
                  {editing === r.key ? "Done" : "Change"}
                </Text>
              </Pressable>
            </View>

            {/* Condition: chips on the scale, and a note for what the grade doesn't say. */}
            {r.key === "condition" && editing === "condition" ? (
              <View style={{ marginTop: spacing.md, marginLeft: 92 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {CONDITION_GRADES.map((g) => {
                    const on = fields.condition === g;
                    return (
                      <Pressable key={g} onPress={() => setFields({ ...fields, condition: g })} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: on ? colors.chipActive : colors.chip }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{g}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {fields.condition && (CONDITION_GRADES as readonly string[]).includes(fields.condition) ? (
                  <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: spacing.sm }}>{CONDITION_DEFINITIONS[fields.condition as ConditionGrade]}</Text>
                ) : null}
                <TextInput
                  value={fields.conditionNote ?? ""}
                  onChangeText={(v) => setFields({ ...fields, conditionNote: v })}
                  placeholder="Condition note — light wear to the sole…"
                  placeholderTextColor={colors.textDim}
                  style={{ marginTop: spacing.sm, fontSize: 14, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.xs }}
                />
              </View>
            ) : r.key === "condition" && fields.conditionNote ? (
              <Text style={{ fontSize: 12, color: colors.textMuted, marginLeft: 92, marginTop: 2 }} numberOfLines={2}>{fields.conditionNote}</Text>
            ) : null}

            {/* Ships as: only when her weight lands in a different tier from what the piece looks like. */}
            {r.key === "weightOz" && mismatch ? (
              <Text style={{ fontSize: 12, color: colors.text, marginLeft: 92, marginTop: spacing.xs }}>{mismatch.message}</Text>
            ) : null}
          </View>
        ))}

        {/* Measurements: the category's template, kept compact — one row, opening the fields. */}
        {measureKeys.length > 0 ? (
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ width: 92, fontSize: 14, color: colors.textMuted }}>Measurements</Text>
              <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{measurementsLine || "—"}</Text>
              <Pressable hitSlop={8} onPress={() => setMeasuring(!measuring)}>
                <Text style={{ fontSize: 14, color: colors.accent, fontWeight: "600" }}>{measuring ? "Done" : "Change"}</Text>
              </Pressable>
            </View>
            {measuring ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md, marginLeft: 92 }}>
                {measureKeys.map((k) => (
                  <View key={k} style={{ width: 96 }}>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>{MEASUREMENT_LABELS[k]}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <TextInput
                        value={measureForm[k] ?? ""}
                        onChangeText={(v) => setMeasureForm({ ...measureForm, [k]: v.replace(/[^0-9.]/g, "") })}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={colors.textDim}
                        style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600", paddingVertical: spacing.xs }}
                      />
                      <Text style={{ fontSize: 12, color: colors.textDim }}>{unit}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
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
