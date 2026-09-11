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
import { floorMissFor, describeFloorMiss } from "../../../lib/seller/price-floor";
import { schedulePresets, describeSchedule } from "../../../lib/seller/schedule";
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
//
// This screen is also the ONLY place the pricing floor can be checked on the phone. Loading prices
// the piece before Review, and what she paid is typed here — so the price is set while the cost is
// still unknown and nothing earlier could have compared the two. Price and Cost are adjacent rows
// here, which makes this the first and last moment both numbers exist. See lib/seller/price-floor.ts.

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
  const consignors = useQuery({
    queryKey: ["store", "consignors"],
    queryFn: () => apiGet<{ consignors: { id: number; name: string }[] }>("/api/store/consignment/consignors"),
    enabled: !!storeSlug,
  });
  const crossList = useQuery({
    queryKey: ["store", "cross-listing"],
    queryFn: () => apiGet<{ platforms: { key: string; name: string }[] }>("/api/store/cross-listing"),
    enabled: !!storeSlug,
  });
  // The store's unit for measurements — inches for a US ship-from, cm elsewhere.
  const shipping = useQuery({ queryKey: ["store", "shipping"], queryFn: () => apiGet<{ currency?: string; shipFrom?: { country?: string | null } | null }>("/api/store/shipping"), enabled: !!storeSlug });
  const currency = me.data?.currency ?? "USD";
  const unit = unitFor({ country: shipping.data?.shipFrom?.country, currency: shipping.data?.currency ?? currency });
  // Her minimum markup over cost. Not defaulted to the server's 3000 on failure: a floor invented
  // client-side would accuse her of underpricing on no evidence, so a silent query means no warning.
  const pricingSettings = useQuery({ queryKey: ["store", "pricing"], queryFn: () => apiGet<{ minMarkupBps: number }>("/api/store/pricing"), enabled: !!storeSlug });
  const minMarkupBps = pricingSettings.data?.minMarkupBps ?? null;
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
  // The price/floor pair she has already said to leave alone.
  const [floorSettled, setFloorSettled] = useState<string | null>(null);
  // A time to go live instead of now. Null = list it the moment she taps.
  const [when, setWhen] = useState<Date | null>(null);
  const [consignor, setConsignor] = useState<number | null>(null);
  const [channels, setChannels] = useState<string[]>([]);
  const [saving, setSaving] = useState<null | "active" | "draft">(null);
  const [error, setError] = useState<string | null>(null);

  // Ships as: the AI's parcel when it made one, else the category's default (lib/seller/parcel.ts).
  const estimate = parcelEstimateFrom(fields.parcel) ?? { ...defaultParcelFor(fields.category), source: "category" as const };
  const typedWeight = fields.weightOz && fields.weightOz.trim() ? Number(fields.weightOz) : null;
  const tier = tierForWeight(typedWeight) ?? estimate.tier;
  const mismatch = parcelMismatch({ typedWeightOz: typedWeight, estimate, category: fields.category });
  const measureKeys = templateFor(fields.category);
  const measurementsLine = formatMeasurements(measurementsFromForm(measureForm, unit));

  // Below her floor? Cost is held as typed text in whole currency; the rule works in cents.
  const costCents = Math.round((costFromText(fields.cost) ?? 0) * 100);
  const floorMiss = floorMissFor(priceCents, costCents, minMarkupBps);
  // "Leave it" settles THIS pair of numbers, not the warning forever. Change either the price or the
  // cost afterwards and it is a different decision, so it gets asked again.
  const floorKey = floorMiss ? `${floorMiss.priceCents}:${floorMiss.floorCents}` : null;
  // Held back while she is actually typing in one of the two rows: a block appearing between her
  // finger and the keyboard shifts the field she is using. Web checks the instant the cost lands,
  // and blurring the row is this screen's version of landing.
  const showFloorMiss = floorMiss && minMarkupBps !== null && floorKey !== floorSettled && editing !== "cost" && editing !== "price";

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
          // Scheduling and consigning travel with the edit; cross-list channels are stored against
          // the piece and pushed by whichever path eventually publishes it.
          ...(when ? { publishAt: when.toISOString() } : {}),
          ...(consignor !== null ? { consignorId: consignor } : {}),
          ...(channels.length ? { channels } : {}),
        });
        // A SCHEDULED PIECE IS NOT PUBLISHED NOW. "List it" with a time set means "put it out then",
        // so it stays a draft and the publish-scheduled cron flips it — publishing here as well
        // would put it live immediately and leave a schedule that had already happened.
        if (status === "active" && !when) await apiPost(`/api/store/items/${itemId}`, { action: "publish" });
      } else {
        await publishListing(
          {
            ...fields, measurements, imageUrls, priceCents,
            ...(when ? { publishAt: when.toISOString() } : {}),
            ...(consignor !== null ? { consignment: { consignorId: consignor } } : {}),
            ...(channels.length ? { channels } : {}),
          },
          // Same rule as above: a scheduled piece is saved as a draft with a time on it.
          when ? "draft" : status,
        );
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

            {/* Price: below what she decided she must make on it. Warned, never silently rewritten —
                a price she has seen is a decision, and this only undoes one made before the cost was. */}
            {r.key === "price" && showFloorMiss && floorMiss && minMarkupBps !== null ? (
              <View style={{ marginLeft: 92, marginTop: spacing.sm, backgroundColor: colors.chip, borderRadius: 8, padding: spacing.md }}>
                <Text style={{ fontSize: 12, color: colors.text, lineHeight: 17 }}>
                  {describeFloorMiss(floorMiss, minMarkupBps, currency)}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }}>
                  <Pressable hitSlop={8} onPress={() => setPriceCents(floorMiss.floorCents)}>
                    <Text style={{ fontSize: 13, color: colors.accent, fontWeight: "600" }}>
                      Raise it to {formatMoney(floorMiss.floorCents, currency)}
                    </Text>
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => setFloorSettled(floorKey)}>
                    <Text style={{ fontSize: 13, color: colors.textMuted }}>Leave it</Text>
                  </Pressable>
                </View>
              </View>
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

      {/* When it goes out, whose it is, and where else it lands — the three things the web asks at
          publish time and the phone never did. */}
      <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xl }}>GOES LIVE</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
        <Pressable
          onPress={() => setWhen(null)}
          style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: !when ? colors.chipActive : colors.chip }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: !when ? colors.chipActiveText : colors.text }}>Now</Text>
        </Pressable>
        {schedulePresets().map((pr) => {
          const on = Boolean(when && when.getTime() === pr.at.getTime());
          return (
            <Pressable
              key={pr.key}
              onPress={() => setWhen(pr.at)}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: on ? colors.chipActive : colors.chip }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{pr.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {when ? (
        <Text style={{ fontSize: 12, color: colors.positive, marginTop: spacing.xs }}>
          {describeSchedule(when)} — it waits in Drafts until then.
        </Text>
      ) : null}

      {(consignors.data?.consignors ?? []).length > 0 ? (
        <>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xl }}>CONSIGNOR</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable
              onPress={() => setConsignor(null)}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: consignor === null ? colors.chipActive : colors.chip }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: consignor === null ? colors.chipActiveText : colors.text }}>Mine</Text>
            </Pressable>
            {(consignors.data?.consignors ?? []).map((c) => {
              const on = consignor === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setConsignor(c.id)}
                  style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: on ? colors.chipActive : colors.chip }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {(crossList.data?.platforms ?? []).length > 0 ? (
        <>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textMuted, marginTop: spacing.xl }}>ALSO LIST ON</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
            {(crossList.data?.platforms ?? []).map((pl) => {
              const on = channels.includes(pl.key);
              return (
                <Pressable
                  key={pl.key}
                  onPress={() => setChannels(on ? channels.filter((k) => k !== pl.key) : [...channels, pl.key])}
                  style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: on ? colors.chipActive : colors.chip }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{pl.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xs, lineHeight: 17 }}>
            Saved with the piece. The posting itself runs from the computer.
          </Text>
        </>
      ) : null}

      {error ? <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
        <Pressable
          disabled={saving !== null}
          onPress={() => void save("active")}
          style={{ flex: 2, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "600" }}>
            {saving === "active" ? "Listing…" : when ? "Schedule it" : "List it"}
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
