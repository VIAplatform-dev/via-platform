import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost, ApiError } from "../../../lib/api";
import { uploadPhoto } from "../../../lib/seller/intake";
import { useAuth } from "../../../lib/auth";
import { colors, spacing, fonts } from "../../../lib/theme";
import { formatMoney } from "../../../lib/seller/home";
import { daysListed } from "../../../lib/seller/aging";
import { describeHold, HOLD_LENGTHS } from "../../../lib/seller/holds";
import { flawsFromLine, flawsToLine } from "../../../lib/seller/intake-shape";
import { templateFor, unitFor, measurementsFromForm, measurementsToForm, formatMeasurements, MEASUREMENT_LABELS, type MeasurementKey, type Measurement } from "../../../lib/seller/measurements";
import { SellerScreen } from "../../../components/seller/Screen";
import { FIELDS, PARCEL_KEYS, MAX_PHOTOS, type FieldKey } from "../../../lib/seller/listing-fields";
import { schedulePresets, parseScheduleInput, describeSchedule } from "../../../lib/seller/schedule";
import { InlineField } from "../../../components/seller/Form";

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
  description?: string | null;
  era?: string | null;
  material?: string | null;
  colour?: string | null;
  weightOz?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  measurementsJson?: Measurement[] | null;
  /** Titles, as /api/store/items attaches them. The PATCH takes titles too and creates any new one. */
  collections?: string[] | null;
  /** Set on a scheduled draft; the publish-scheduled cron flips it live at this time. */
  publishAt?: string | null;
  /** Marketplaces this piece is meant for. Stored here, pushed at publish — never from the phone. */
  crossListChannels?: string[] | null;
  consignorId?: number | null;
  flaws?: string[] | null;
  createdAt?: string;
  views?: number;
  favorites?: number;
};

type Hold = { itemId: string; name: string; expiresAt: string };


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
  // Photos: null until she touches them, so an untouched Save never rewrites the set. Same rule as
  // measurements — the difference between "she left them alone" and "she cleared them" matters here
  // more than anywhere else, because the images ARE the listing.
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  // Collections: null until touched, like photos and measurements.
  const [cols, setCols] = useState<string[] | null>(null);
  const [newCol, setNewCol] = useState("");
  // undefined = untouched; null = "clear it"; a Date = this time. Three states, because clearing a
  // schedule and never touching one must not look the same to the route.
  const [when, setWhen] = useState<Date | null | undefined>(undefined);
  const [whenTyped, setWhenTyped] = useState("");
  const [channels, setChannels] = useState<string[] | null>(null);
  const [consignor, setConsignor] = useState<number | null | undefined>(undefined);

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
  const collections = useQuery({
    queryKey: ["store", "collections"],
    queryFn: () => apiGet<{ collections: { id: string; title: string }[] }>("/api/store/collections?all=1"),
    enabled: !!storeSlug,
  });
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
        // Blank means "unknown" and the route stores null; a non-number is dropped rather than
        // sent, so a stray character can't wipe a weight that was right.
        else if (PARCEL_KEYS.includes(f.key)) { const t = v.replace(/[^0-9]/g, ""); if (t === "") body[f.key] = null; else { const n = Number(t); if (Number.isFinite(n) && n > 0) body[f.key] = n; } }
        else body[f.key] = v;
      }
      // The template's numbers as the list the route stores (empties omitted), only once touched.
      if (measureForm) body.measurements = measurementsFromForm(measureForm, unit);
      if (photos) body.images = photos;
      if (cols) body.collections = cols;
      if (when !== undefined) body.publishAt = when === null ? null : when.toISOString();
      if (channels) body.channels = channels;
      if (consignor !== undefined) body.consignorId = consignor;
      return apiPatch(`/api/store/items/${id}`, body);
    },
    onSuccess: () => { setMode("view"); setForm({}); setMeasureForm(null); setMeasuring(false); setPhotos(null); setCols(null); setNewCol(""); setWhen(undefined); setWhenTyped(""); setChannels(null); setConsignor(undefined); refresh(); },
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
    : PARCEL_KEYS.includes(key)
      ? (() => { const n = (item as unknown as Record<string, unknown>)[key]; return n == null ? "" : String(n); })()
    : String((item as unknown as Record<string, unknown>)[key] ?? ""));
  const flaws = Array.isArray(item.flaws) ? item.flaws.filter(Boolean) : [];
  // Measurements: the category's template, the stored numbers as its strings until she edits them.
  const measureKeys = templateFor(item.category);
  const measureValues = measureForm ?? measurementsToForm(item.measurementsJson);
  const measurementsLine = formatMeasurements(measurementsFromForm(measureValues, unit));
  const storedMeasurementsLine = formatMeasurements(item.measurementsJson);
  const dirty = Object.keys(form).length > 0 || measureForm !== null || photos !== null || cols !== null
    || when !== undefined || channels !== null || consignor !== undefined;
  // The three that can be set here but only ACT at publish.
  const scheduledAt = when !== undefined ? when : (item.publishAt ? new Date(item.publishAt) : null);
  const chosenChannels = channels ?? (Array.isArray(item.crossListChannels) ? item.crossListChannels : []);
  const chosenConsignor = consignor !== undefined ? consignor : (item.consignorId ?? null);
  const isDraft = item.status === "draft";
  const chosen = cols ?? (Array.isArray(item.collections) ? item.collections : []);
  const toggleCol = (t: string) => setCols(chosen.includes(t) ? chosen.filter((c) => c !== t) : [...chosen, t]);
  const shots = photos ?? (Array.isArray(item.images) ? item.images : []);

  /** Add from the library. Uploaded immediately — the route stores URLs, never bytes. */
  async function addPhotos() {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
      quality: 0.85,
    });
    if (r.canceled) return;
    setError(null);
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const a of r.assets) urls.push(await uploadPhoto(a.uri));
      // One definition of the cap (listing-fields.ts), matching what the routes actually store.
      setPhotos([...shots, ...urls].slice(0, MAX_PHOTOS));
    } catch (e) {
      fail(e, "Couldn't upload those photos.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <SellerScreen title="Piece" back>
      {/* EVERY photo, not just the first. A piece shot from eight angles on the web showed up here
          as one picture, which reads as photos that failed to upload. Horizontal, so the cover
          stays the size it was and the rest are a swipe away. */}
      {shots.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {shots.map((src, i) => (
            <Image key={`${src}-${i}`} source={{ uri: src }} style={{ width: 300, height: 340, borderRadius: 12, backgroundColor: colors.chip }} />
          ))}
        </ScrollView>
      ) : shots[0] ? (
        <Image source={{ uri: shots[0] }} style={{ width: "100%", height: 340, borderRadius: 12, backgroundColor: colors.chip }} />
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
          {/* Photos first, because they are the listing. Tap one to make it the cover — the first
              image is what every grid, the storefront and the shopper's search result show, and it
              was previously only changeable on the web. ✕ removes. */}
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md }}>
            <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: spacing.sm }}>Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {shots.map((src, i) => (
                <View key={`${src}-${i}`}>
                  <Pressable onPress={() => setPhotos([src, ...shots.filter((_, j) => j !== i)])}>
                    <Image source={{ uri: src }} style={{ width: 84, height: 84, borderRadius: 8, backgroundColor: colors.chip }} />
                  </Pressable>
                  {i === 0 ? (
                    <View style={{ position: "absolute", bottom: 4, left: 4, backgroundColor: colors.accent, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9, letterSpacing: 0.8, fontWeight: "700", color: colors.accentText }}>COVER</Text>
                    </View>
                  ) : null}
                  <Pressable
                    hitSlop={8}
                    onPress={() => setPhotos(shots.filter((_, j) => j !== i))}
                    style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "700" }}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() => void addPhotos()}
                disabled={uploading}
                style={{ width: 84, height: 84, borderRadius: 8, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center", opacity: uploading ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 13, color: colors.text, fontWeight: "600" }}>{uploading ? "…" : "+ Add"}</Text>
              </Pressable>
            </ScrollView>
            {shots.length > 1 ? (
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm }}>Tap a photo to make it the cover.</Text>
            ) : null}
          </View>
          {FIELDS.map((f) => (
            <InlineField
              key={f.key}
              label={f.label}
              labelWidth={92}
              value={current(f.key)}
              onChangeText={(v) => setForm({ ...form, [f.key]: v })}
              keyboardType={f.numeric ? "decimal-pad" : "default"}
              multiline={f.multiline}
              placeholder={f.placeholder}
            />
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
          {/* Collections — the same grouping the storefront and the web editor use. Titles, not ids:
              the route creates one that doesn't exist yet, so "Add" is both pick and create. */}
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
            <Text style={{ fontSize: 14, color: colors.textMuted }}>Collections</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
              {Array.from(new Set([...(collections.data?.collections ?? []).map((c) => c.title), ...chosen])).map((t) => {
                const on = chosen.includes(t);
                return (
                  <Pressable
                    key={t}
                    onPress={() => toggleCol(t)}
                    style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: on ? colors.chipActive : colors.chip }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm }}>
              <TextInput
                value={newCol}
                onChangeText={setNewCol}
                placeholder="New collection"
                placeholderTextColor={colors.textDim}
                autoCapitalize="words"
                onSubmitEditing={() => { const t = newCol.trim(); if (t && !chosen.includes(t)) { setCols([...chosen, t]); setNewCol(""); } }}
                style={{ flex: 1, fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.xs }}
              />
              <Pressable
                hitSlop={8}
                disabled={!newCol.trim()}
                onPress={() => { const t = newCol.trim(); if (t && !chosen.includes(t)) { setCols([...chosen, t]); setNewCol(""); } }}
              >
                <Text style={{ fontSize: 14, color: colors.accent, fontWeight: "600", opacity: newCol.trim() ? 1 : 0.4 }}>Add</Text>
              </Pressable>
            </View>
          </View>

          {/* WHEN IT GOES LIVE. Drafts only — the cron that flips a schedule looks at drafts, so
              offering this on a live piece would be offering something that cannot happen. */}
          {isDraft ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Goes live</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                <Pressable
                  onPress={() => { setWhen(null); setWhenTyped(""); }}
                  style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: !scheduledAt ? colors.chipActive : colors.chip }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: !scheduledAt ? colors.chipActiveText : colors.text }}>When I say</Text>
                </Pressable>
                {schedulePresets().map((pr) => {
                  const on = Boolean(scheduledAt && scheduledAt.getTime() === pr.at.getTime());
                  return (
                    <Pressable
                      key={pr.key}
                      onPress={() => { setWhen(pr.at); setWhenTyped(""); }}
                      style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: on ? colors.chipActive : colors.chip }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{pr.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={whenTyped}
                onChangeText={(v) => { setWhenTyped(v); const d = parseScheduleInput(v); if (d) setWhen(d); }}
                placeholder="or 2026-09-15 18:00"
                placeholderTextColor={colors.textDim}
                keyboardType="numbers-and-punctuation"
                style={{ fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.xs, marginTop: spacing.sm }}
              />
              <Text style={{ fontSize: 12, color: scheduledAt ? colors.positive : colors.textDim, marginTop: spacing.xs }}>
                {describeSchedule(scheduledAt) ?? "It stays a draft until you list it."}
              </Text>
            </View>
          ) : null}

          {/* WHOSE PIECE IT IS. */}
          {(consignors.data?.consignors ?? []).length > 0 ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Consignor</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                <Pressable
                  onPress={() => setConsignor(null)}
                  style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: chosenConsignor == null ? colors.chipActive : colors.chip }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: chosenConsignor == null ? colors.chipActiveText : colors.text }}>Mine</Text>
                </Pressable>
                {(consignors.data?.consignors ?? []).map((c) => {
                  const on = chosenConsignor === c.id;
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
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xs, lineHeight: 17 }}>
                Their cut comes from the split on their record. A piece that has already sold keeps
                the consignor it sold under.
              </Text>
            </View>
          ) : null}

          {/* CROSS-LISTING. Stored here, pushed when the piece publishes — never from the phone. */}
          {(crossList.data?.platforms ?? []).length > 0 ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Also list on</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                {(crossList.data?.platforms ?? []).map((pl) => {
                  const on = chosenChannels.includes(pl.key);
                  return (
                    <Pressable
                      key={pl.key}
                      onPress={() => setChannels(on ? chosenChannels.filter((k) => k !== pl.key) : [...chosenChannels, pl.key])}
                      style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: on ? colors.chipActive : colors.chip }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{pl.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xs, lineHeight: 17 }}>
                Saved against the piece. The actual posting runs from the computer — connecting a
                marketplace needs a sign-in the phone can&apos;t complete.
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
            <Button label={save.isPending ? "Saving…" : "Save"} primary disabled={busy || !dirty} onPress={() => save.mutate()} />
            <Button label="Cancel" disabled={busy} onPress={() => { setMode("view"); setForm({}); setMeasureForm(null); setMeasuring(false); setPhotos(null); setCols(null); setNewCol(""); setWhen(undefined); setWhenTyped(""); setChannels(null); setConsignor(undefined); setError(null); }} />
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
