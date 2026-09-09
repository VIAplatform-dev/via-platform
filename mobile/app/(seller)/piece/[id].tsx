import { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost, ApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { colors, spacing, fonts } from "../../../lib/theme";
import { formatMoney } from "../../../lib/seller/home";
import { daysListed } from "../../../lib/seller/aging";
import { describeHold, HOLD_LENGTHS } from "../../../lib/seller/holds";
import { flawsFromLine, flawsToLine } from "../../../lib/seller/intake-shape";
import { templateFor, unitFor, measurementsFromForm, measurementsToForm, formatMeasurements, MEASUREMENT_LABELS, type MeasurementKey, type Measurement } from "../../../lib/seller/measurements";
import { SellerScreen } from "../../../components/seller/Screen";

// One piece, reached by tapping anything in Inventory.
//
// Photos big, price and state together, views and saves as the only analytics that belong here —
// the rest is the Analytics screen's job. Three things she does to a piece from the counter: fix
// a detail, keep it back for someone, or mark it sold. All three are here; none opens the desktop.

type Item = {
  id: string;
  title: string;
  priceCents: number;
  costCents?: number | null;
  currency: string;
  images: string[];
  status: string;
  brand?: string | null;
  size?: string | null;
  condition?: string | null;
  conditionNote?: string | null;
  category?: string | null;
  measurementsJson?: Measurement[] | null;
  flaws?: string[] | null;
  createdAt?: string;
  views?: number;
  favorites?: number;
};

type Hold = { itemId: string; name: string; expiresAt: string };

type FieldKey = "title" | "price" | "cost" | "brand" | "size" | "condition" | "conditionNote" | "flaws";
const FIELDS: { key: FieldKey; label: string; numeric?: boolean; placeholder?: string }[] = [
  { key: "title", label: "Title" },
  { key: "price", label: "Price", numeric: true },
  // What she paid — the one number the margin report can't do without.
  { key: "cost", label: "Cost", numeric: true, placeholder: "what you paid" },
  { key: "brand", label: "Brand" },
  { key: "size", label: "Size" },
  { key: "condition", label: "Condition" },
  // Beyond the grade — her words on the wear, the same note Review and the web editor take.
  { key: "conditionNote", label: "Condition note", placeholder: "light wear to the sole, tiny mark inside…" },
  // As the web editor has it. Flaws are typed as one comma-separated line, like Review, and stored
  // as the list the product page prints under Condition.
  { key: "flaws", label: "Flaws", placeholder: "scuffed toe, light pilling — comma-separated" },
];

function Button({ label, onPress, disabled, primary }: { label: string; onPress?: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{ flex: 1, backgroundColor: primary ? colors.accent : colors.chip, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center", opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ color: primary ? colors.accentText : colors.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export default function PieceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeSlug } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit" | "hold">("view");
  const [form, setForm] = useState<Record<string, string>>({});
  const [holdName, setHoldName] = useState("");
  const [holdDays, setHoldDays] = useState<number>(3);
  const [error, setError] = useState<string | null>(null);
  // Measurements: null until she touches the template, so an untouched Save never rewrites them.
  const [measureForm, setMeasureForm] = useState<Partial<Record<MeasurementKey, string>> | null>(null);
  const [measuring, setMeasuring] = useState(false);

  const q = useQuery({
    queryKey: ["store", "items"],
    queryFn: () => apiGet<{ items: Item[] }>("/api/store/items"),
    enabled: !!storeSlug,
  });
  const holds = useQuery({
    queryKey: ["store", "holds"],
    queryFn: () => apiGet<{ holds: Hold[] }>("/api/store/holds"),
    enabled: !!storeSlug,
  });
  // The store's unit for measurements — inches for a US ship-from, cm elsewhere (as Review reads it).
  const shipping = useQuery({
    queryKey: ["store", "shipping"],
    queryFn: () => apiGet<{ currency?: string; shipFrom?: { country?: string | null } | null }>("/api/store/shipping"),
    enabled: !!storeSlug,
  });
  const item = (q.data?.items ?? []).find((i) => i.id === id);
  const hold = (holds.data?.holds ?? []).find((h) => h.itemId === id) ?? null;
  const unit = unitFor({ country: shipping.data?.shipFrom?.country, currency: shipping.data?.currency ?? item?.currency });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["store", "items"] });
    void qc.invalidateQueries({ queryKey: ["store", "holds"] });
  };
  const fail = (e: unknown, fallback: string) => setError(e instanceof ApiError && e.message ? e.message : fallback);

  const markSold = useMutation({
    mutationFn: () => apiPost(`/api/store/items/${id}`, { action: "sold" }),
    // Refetch rather than patching the cache by hand: the server decides what "sold" implies
    // (a hold to close, a cross-listing pull) and guessing here would drift.
    onSuccess: refresh,
    onError: (e) => fail(e, "Couldn't mark it sold. Try again."),
  });
  const save = useMutation({
    mutationFn: () => {
      // The route takes price in whole currency and turns it into cents itself.
      const body: Record<string, unknown> = {};
      for (const f of FIELDS) {
        const v = form[f.key];
        if (v === undefined) continue;
        if (f.key === "price") { const n = Number(v.replace(/[^0-9.]/g, "")); if (Number.isFinite(n) && n > 0) body.price = n; }
        // Cost may be cleared: an empty box means "I don't know", which the route stores as null.
        else if (f.key === "cost") { const t = v.replace(/[^0-9.]/g, ""); const n = Number(t); body.cost = t === "" ? null : (Number.isFinite(n) && n >= 0 ? n : undefined); if (body.cost === undefined) delete body.cost; }
        else if (f.key === "flaws") body.flaws = flawsFromLine(v);
        else body[f.key] = v;
      }
      // The template's numbers as the list the route stores (empties omitted), only once touched.
      if (measureForm) body.measurements = measurementsFromForm(measureForm, unit);
      return apiPatch(`/api/store/items/${id}`, body);
    },
    onSuccess: () => { setMode("view"); setForm({}); setMeasureForm(null); setMeasuring(false); refresh(); },
    onError: (e) => fail(e, "Couldn't save that. Try again."),
  });
  const placeHold = useMutation({
    mutationFn: () => apiPost(`/api/store/items/${id}`, { action: "hold", name: holdName, days: holdDays }),
    onSuccess: () => { setMode("view"); setHoldName(""); refresh(); },
    onError: (e) => fail(e, "Couldn't hold it. Try again."),
  });
  const release = useMutation({
    mutationFn: () => apiPost(`/api/store/items/${id}`, { action: "release" }),
    onSuccess: refresh,
    onError: (e) => fail(e, "Couldn't release it. Try again."),
  });

  // The whole inventory comes down on first open (1,400 pieces with photos is a few seconds on a
  // cold start). A blank screen for that long reads as broken — say that it is loading.
  if (q.isPending) return <SellerScreen title="Piece" back><ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} /></SellerScreen>;
  if (!item) {
    return (
      <SellerScreen title="Piece" back>
        <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.xl }}>
          This piece isn&apos;t in your inventory any more.
        </Text>
      </SellerScreen>
    );
  }

  const sold = item.status === "sold";
  const reserved = item.status === "reserved";
  const live = item.status === "active";
  const days = daysListed(item.createdAt ?? null);
  const pill = sold ? "SOLD" : reserved ? (hold ? "ON HOLD" : "RESERVED") : item.status === "draft" ? "DRAFT" : "LIVE";
  const busy = markSold.isPending || save.isPending || placeHold.isPending || release.isPending;
  const current = (key: string) => form[key] ?? (
    key === "price" ? String(item.priceCents / 100)
    : key === "cost" ? (item.costCents == null ? "" : String(item.costCents / 100))
    : key === "flaws" ? flawsToLine(Array.isArray(item.flaws) ? item.flaws.filter(Boolean) : [])
    : String((item as unknown as Record<string, unknown>)[key] ?? ""));
  const flaws = Array.isArray(item.flaws) ? item.flaws.filter(Boolean) : [];
  // Measurements: the category's template, the stored numbers as its strings until she edits them.
  const measureKeys = templateFor(item.category);
  const measureValues = measureForm ?? measurementsToForm(item.measurementsJson);
  const measurementsLine = formatMeasurements(measurementsFromForm(measureValues, unit));
  const storedMeasurementsLine = formatMeasurements(item.measurementsJson);
  const dirty = Object.keys(form).length > 0 || measureForm !== null;

  return (
    <SellerScreen title="Piece" back>
      {item.images?.[0] ? (
        <Image source={{ uri: item.images[0] }} style={{ width: "100%", height: 340, borderRadius: 12, backgroundColor: colors.chip }} />
      ) : (
        <View style={{ width: "100%", height: 340, borderRadius: 12, backgroundColor: colors.chip }} />
      )}

      <Text style={{ fontSize: 17, color: colors.text, fontWeight: "600", marginTop: spacing.lg }}>{item.title}</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
        <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text }}>
          {formatMoney(item.priceCents, item.currency)}
        </Text>
        <View style={{ paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.chip }}>
          <Text style={{ fontSize: 11, letterSpacing: 1, color: live ? colors.positive : colors.textMuted, fontWeight: "700" }}>{pill}</Text>
        </View>
        <Text style={{ marginLeft: "auto", fontSize: 13, color: colors.textMuted }}>
          {item.views ?? 0} views · {item.favorites ?? 0} saves
        </Text>
      </View>

      {/* the line that says how it stands: who it is held for, or how long it has sat */}
      {hold ? (
        <Text style={{ fontSize: 14, color: colors.text, marginTop: spacing.sm }}>{describeHold(hold)}</Text>
      ) : live && days !== null && days >= 7 ? (
        <Text style={{ fontSize: 13, color: days >= 90 ? colors.accent : colors.textMuted, marginTop: spacing.sm }}>
          Listed {days} days ago
        </Text>
      ) : null}

      {mode === "edit" ? (
        <View style={{ marginTop: spacing.lg }}>
          {FIELDS.map((f) => (
            <View key={f.key} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
              <Text style={{ width: 92, fontSize: 14, color: colors.textMuted }}>{f.label}</Text>
              <TextInput
                value={current(f.key)}
                onChangeText={(v) => setForm({ ...form, [f.key]: v })}
                keyboardType={f.numeric ? "decimal-pad" : "default"}
                placeholder={f.placeholder}
                placeholderTextColor={colors.textDim}
                style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" }}
              />
            </View>
          ))}
          {/* Measurements: the category's template, kept compact — one row, opening the fields (as Review). */}
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
                          value={measureValues[k] ?? ""}
                          onChangeText={(v) => setMeasureForm({ ...measureValues, [k]: v.replace(/[^0-9.]/g, "") })}
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
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
            <Button label={save.isPending ? "Saving…" : "Save"} primary disabled={busy || !dirty} onPress={() => save.mutate()} />
            <Button label="Cancel" disabled={busy} onPress={() => { setMode("view"); setForm({}); setMeasureForm(null); setMeasuring(false); setError(null); }} />
          </View>
        </View>
      ) : mode === "hold" ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>Keep it back for</Text>
          <TextInput
            autoFocus
            value={holdName}
            onChangeText={setHoldName}
            placeholder="Their name (optional)"
            placeholderTextColor={colors.textDim}
            style={{ fontSize: 17, color: colors.text, fontWeight: "600", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
          />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            {HOLD_LENGTHS.map((h) => (
              <Pressable
                key={h.days}
                onPress={() => setHoldDays(h.days)}
                style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: holdDays === h.days ? colors.text : colors.chip }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: holdDays === h.days ? colors.bg : colors.text }}>{h.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: spacing.md, lineHeight: 18 }}>
            Shoppers see &ldquo;On hold&rdquo; instead of Buy. It goes back on sale by itself when the time is up.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
            <Button label={placeHold.isPending ? "Holding…" : "Hold it"} primary disabled={busy} onPress={() => placeHold.mutate()} />
            <Button label="Cancel" disabled={busy} onPress={() => { setMode("view"); setError(null); }} />
          </View>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
            <Button label="Edit" primary disabled={busy} onPress={() => { setError(null); setMode("edit"); }} />
            <Button
              label={markSold.isPending ? "Marking…" : sold ? "Sold" : "Mark sold"}
              disabled={sold || busy}
              onPress={() => markSold.mutate()}
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
            {hold ? (
              <Button label={release.isPending ? "Releasing…" : "Release hold"} disabled={busy} onPress={() => release.mutate()} />
            ) : live ? (
              <Button label="Hold for someone" disabled={busy} onPress={() => { setError(null); setMode("hold"); }} />
            ) : null}
          </View>
        </>
      )}

      {error ? (
        <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.md }}>{error}</Text>
      ) : null}

      {/* Flaws — the list shoppers see under Condition; Edit changes it as one comma-separated line. */}
      {flaws.length > 0 && mode === "view" ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textDim, fontWeight: "700" }}>FLAWS</Text>
          {flaws.map((f, i) => (
            <Text key={`${f}-${i}`} style={{ fontSize: 14, color: colors.text, marginTop: spacing.xs }}>{"\u2022"} {f}</Text>
          ))}
        </View>
      ) : null}
      {/* Beyond the grade and the tape measure — both print on the product page; Edit changes them. */}
      {item.conditionNote && mode === "view" ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textDim, fontWeight: "700" }}>CONDITION NOTE</Text>
          <Text style={{ fontSize: 14, color: colors.text, marginTop: spacing.xs }}>{item.conditionNote}</Text>
        </View>
      ) : null}
      {storedMeasurementsLine && mode === "view" ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textDim, fontWeight: "700" }}>MEASUREMENTS</Text>
          <Text style={{ fontSize: 14, color: colors.text, marginTop: spacing.xs }}>{storedMeasurementsLine}</Text>
        </View>
      ) : null}
    </SellerScreen>
  );
}
