import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { pickPhotos, remainingSlots } from "../../../lib/seller/pick-photos";
import { liveCrossListPlatforms, crossListNote, crossListFootnote, type CrossListPlatform } from "../../../lib/seller/cross-listing";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost, apiPut, apiDelete, ApiError } from "../../../lib/api";
import { uploadPhoto, draftListing } from "../../../lib/seller/intake";
import { useAuth } from "../../../lib/auth";
// `pill` is aliased: this screen already has a local `pill`, the status WORD ("SOLD",
// "RESERVED"). React Native accepts a string for borderRadius (it can be a percentage), so
// the collision typechecks and renders wrong rather than failing.
import { colors, spacing, fonts, radius, pill as pillRadius, eyebrow } from "../../../lib/portal-theme";
import { formatMoney } from "../../../lib/seller/home";
import { daysListed } from "../../../lib/seller/aging";
import { describeHold, HOLD_LENGTHS } from "../../../lib/seller/holds";
import { flawsFromLine, flawsToLine, CONDITION_GRADES } from "../../../lib/seller/intake-shape";
import { fillBlanks, fillSummary } from "../../../lib/seller/fill";
import { templateFor, unitFor, measurementsFromForm, measurementsToForm, formatMeasurements, MEASUREMENT_LABELS, type MeasurementKey, type Measurement } from "../../../lib/seller/measurements";
import { SellerScreen } from "../../../components/seller/Screen";
import { FIELDS, PARCEL_KEYS, MAX_PHOTOS, type FieldKey } from "../../../lib/seller/listing-fields";
import { PACKAGING, packagingById, packagingFromDims, packagingSummary, suggestPackaging, weightForPackaging } from "../../../lib/seller/packaging";
import { TIER_DAYS, tierLabel, starterTiers, formFromTiers, termsProblem, termsPayload, termsSummary, type TermsForm } from "../../../lib/seller/rental-terms";
import { describeSchedule } from "../../../lib/seller/schedule";
import { WhenPicker } from "../../../components/seller/WhenPicker";
import { tomorrowEvening } from "../../../lib/seller/calendar";
import { InlineField } from "../../../components/seller/Form";
import { SelectRow, MultiSelectRow } from "../../../components/seller/Select";

// One piece, reached by tapping anything in Inventory.
//
// Photos big, price and state together, views and saves as the only analytics that belong here,
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
  /** Marketplaces this piece is meant for. Stored here, pushed at publish, never from the phone. */
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
      style={{ flex: 1, backgroundColor: primary ? colors.accent : colors.chip, borderRadius: pillRadius, paddingVertical: spacing.lg, alignItems: "center", opacity: disabled ? 0.5 : 1 }}
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
  // measurements. The difference between "she left them alone" and "she cleared them" matters here
  // more than anywhere else, because the images ARE the listing.
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  // Collections: null until touched, like photos and measurements.
  const [cols, setCols] = useState<string[] | null>(null);
  // undefined = untouched; null = "clear it"; a Date = this time. Three states, because clearing a
  // schedule and never touching one must not look the same to the route.
  const [when, setWhen] = useState<Date | null | undefined>(undefined);
  const [channels, setChannels] = useState<string[] | null>(null);
  const [consignor, setConsignor] = useState<number | null | undefined>(undefined);
  const [packing, setPacking] = useState<string | null>(null);
  const [renting, setRenting] = useState<boolean | null>(null);
  const [terms, setTerms] = useState<TermsForm | null>(null);
  // What the AI pass did, in a line, so a screen full of freshly filled boxes says where they came
  // from. Cleared when the edits are (saved, or discarded).
  const [filling, setFilling] = useState(false);
  const [filledNote, setFilledNote] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Still on screen? An exit save finishes after this component is gone, and touching state then is
  // a warning and a leak. The query cache is safe to write to. It outlives the screen.
  const onScreen = useRef(true);
  useEffect(() => () => { onScreen.current = false; }, []);
  // One write at a time. Tapping Done and immediately swiping back would otherwise send the same
  // patch twice, and the second one races the refetch the first kicked off.
  const inFlight = useRef(false);

  // THIS PIECE, not the inventory it sits in. This used to fetch every item the store has and pick
  // one out of the list. 12.5 MB on the largest store here, downloaded to open one dress, and the
  // same list the Inventory screen had already loaded in its lighter form. One piece comes whole:
  // description, measurements, collections and whose piece it is, which a list does not carry.
  const q = useQuery({
    queryKey: ["store", "item", id],
    queryFn: () => apiGet<{ item: Item }>(`/api/store/items/${id}`),
    enabled: !!storeSlug && !!id,
  });
  const holds = useQuery({
    queryKey: ["store", "holds"],
    queryFn: () => apiGet<{ holds: Hold[] }>("/api/store/holds"),
    enabled: !!storeSlug,
  });
  // The store's unit for measurements. Inches for a US ship-from, cm elsewhere (as Review reads it).
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
  // A piece is rentable exactly when terms exist for it. 404 is the ordinary answer for "not
  // rentable", not an error, so it resolves to null rather than throwing a red screen.
  const rental = useQuery({
    queryKey: ["store", "rental-terms", id],
    queryFn: () => apiGet<{ terms?: { tiers: { days: number; cents: number }[]; replacementCents: number | null; alsoForSale?: boolean } | null }>(`/api/store/rentals/terms/${id}`)
      .then((r) => r.terms ?? null)
      .catch(() => null),
    enabled: !!storeSlug && !!id,
  });
  const crossList = useQuery({
    queryKey: ["store", "cross-listing"],
    queryFn: () => apiGet<{ platforms: CrossListPlatform[] }>("/api/store/cross-listing"),
    enabled: !!storeSlug,
  });
  const shipping = useQuery({
    queryKey: ["store", "shipping"],
    queryFn: () => apiGet<{ currency?: string; shipFrom?: { country?: string | null } | null }>("/api/store/shipping"),
    enabled: !!storeSlug,
  });
  const item = q.data?.item;
  const hold = (holds.data?.holds ?? []).find((h) => h.itemId === id) ?? null;
  const unit = unitFor({ country: shipping.data?.shipFrom?.country, currency: shipping.data?.currency ?? item?.currency });

  // Awaited by the save path, so the fresh row is in hand BEFORE the local edits are dropped.
  // Clearing first, which is what this screen used to do. Shows the pre-edit values for as long
  // as the refetch takes, and a field that flickers back to its old text reads as a failed save.
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["store", "item", id] }),
      // A prefix, so it catches both the full inventory and the list projection under it.
      qc.invalidateQueries({ queryKey: ["store", "items"] }),
      qc.invalidateQueries({ queryKey: ["store", "holds"] }),
      qc.invalidateQueries({ queryKey: ["store", "rental-terms", id] }),
    ]);
  };
  const fail = (e: unknown, fallback: string) => setError(e instanceof ApiError && e.message ? e.message : fallback);

  const markSold = useMutation({
    mutationFn: () => apiPost(`/api/store/items/${id}`, { action: "sold" }),
    // Refetch rather than patching the cache by hand: the server decides what "sold" implies
    // (a hold to close, a cross-listing pull) and guessing here would drift.
    onSuccess: () => { void refresh(); },
    onError: (e) => fail(e, "Couldn't mark it sold. Try again."),
  });
  /**
   * PUBLISH A DRAFT. The piece exists; this is the transition that makes it live.
   *
   * The screen had no way to do it. `isDraft` gated the schedule block and one line of copy that
   * read "it stays a draft until you list it" beside no button that would list it, so a draft
   * edited on the phone could only be published from a laptop, or by deleting it and listing the
   * same garment again. The listing flow has used this exact call all along
   * (POST /api/store/items/{id} with action "publish"), which is the same transition the web
   * takes, so anything it schedules (cross-listing, publish-at) happens here too.
   *
   * SAVE FIRST. Leaving the screen is what saves an edit (see onExit), and publishing does not
   * leave the screen, so a seller who fixes the price and taps Publish in one breath would
   * otherwise put the OLD price live. Pending edits go up, then the transition.
   */
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await persist();
      return apiPost(`/api/store/items/${id}`, { action: "publish" });
    },
    onSuccess: () => { clearEdits(); setMode("view"); void refresh(); },
    onError: (e) => fail(e, "Couldn't publish it. Try again."),
  });

  /** Every edit buffer back to untouched. Called once the server has the changes, and by Discard. */
  const clearEdits = () => {
    setForm({}); setMeasureForm(null); setMeasuring(false); setPhotos(null); setCols(null);
    setWhen(undefined); setChannels(null); setConsignor(undefined);
    setPacking(null); setRenting(null); setTerms(null); setFilledNote(null);
  };

  /** What she has changed, as the body the route takes. Untouched things are absent, not null. */
  const patchBody = () => {
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
    return body;
  };

  /**
   * THE WHOLE SAVE, callable from anywhere, including from a screen that is already unmounting.
   *
   * It is not a mutation body because the most important time it runs is on the way out: react-query
   * tears an observer down with its component, and a callback that fires after that is a callback
   * that does not fire. This is a plain async function closing over the current edits; the mutation
   * below only wraps it so the Done button has something to show a spinner from.
   *
   * NOTHING HERE CHANGES THE PIECE'S STATUS. A draft stays a draft; a live listing stays live. An
   * auto-save is for the words and the numbers. Taking a listing off the storefront is a decision,
   * and a decision has to be made on purpose.
   */
  async function persist() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await apiPatch(`/api/store/items/${id}`, patchBody());
      // RENTING IS ITS OWN RESOURCE, not a field on the item: terms exist or they don't, and
      // that is what makes a piece rentable. Saved after the item so a failed patch never
      // leaves a piece rentable with the wrong price on it.
      if (renting !== null || terms !== null) {
        if (isRentable && rentProblem) {
          // The one part that can be half-finished. Everything else is already saved, so say
          // exactly what did not go rather than failing the lot. The words and the price are
          // worth more than the rental tiers she was still typing.
          if (onScreen.current) setError(`Saved. Except the rental prices. ${rentProblem}`);
        } else if (isRentable) {
          await apiPut(`/api/store/rentals/terms/${id}`, termsPayload(rentForm, true));
        } else {
          await apiDelete(`/api/store/rentals/terms/${id}`);
        }
      }
      await refresh();
      if (onScreen.current) { clearEdits(); setSavedAt(Date.now()); }
    } finally {
      inFlight.current = false;
    }
  }

  const save = useMutation({
    mutationFn: persist,
    onSuccess: () => { setMode("view"); },
    onError: (e) => fail(e, "Couldn't save that. Try again."),
  });

  /**
   * LEAVING THE SCREEN IS THE SAVE.
   *
   * The Save button is gone. It was the only way out that kept anything, and everything else a
   * phone does to a screen. The back chevron, the swipe from the left edge, the hardware back,
   * tapping through to Consignors to add someone. Threw the edit away without a word. On a laptop
   * that costs a moment; on a phone, where leaving a screen is a gesture you make without deciding
   * to, it costs the description she just typed with one hand on a bus.
   *
   * The blur cleanup fires for all of those, and for an unmount, which is why the write is a plain
   * function rather than a mutation. What it CANNOT do is tell her about a failure she has already
   * walked away from: the screen is gone and this app has no toast. She would find the old text
   * when she next opened the piece. Worth knowing; still better than losing every edit every time.
   */
  const onExit = useRef<() => void>(() => {});
  useFocusEffect(useCallback(() => () => onExit.current(), []));
  const placeHold = useMutation({
    mutationFn: () => apiPost(`/api/store/items/${id}`, { action: "hold", name: holdName, days: holdDays }),
    onSuccess: () => { setMode("view"); setHoldName(""); void refresh(); },
    onError: (e) => fail(e, "Couldn't hold it. Try again."),
  });
  const release = useMutation({
    mutationFn: () => apiPost(`/api/store/items/${id}`, { action: "release" }),
    onSuccess: () => { void refresh(); },
    onError: (e) => fail(e, "Couldn't release it. Try again."),
  });

  // The whole inventory comes down on first open (1,400 pieces with photos is a few seconds on a
  // cold start). A blank screen for that long reads as broken, say that it is loading.
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
    || when !== undefined || channels !== null || consignor !== undefined || packing !== null || renting !== null || terms !== null;
  // Assigned here rather than where the ref is declared: `dirty` and `persist` close over values
  // that do not exist until this point in the render, and reading them earlier is a crash.
  onExit.current = () => { if (dirty && !inFlight.current) void persist().catch(() => {}); };
  // The three that can be set here but only ACT at publish.
  const scheduledAt = when !== undefined ? when : (item.publishAt ? new Date(item.publishAt) : null);
  const chosenChannels = channels ?? (Array.isArray(item.crossListChannels) ? item.crossListChannels : []);
  // Which box it ships in. There is no `packaging` column, only L/W/H are stored, so the
  // current choice is read back FROM those numbers; otherwise every edit would quietly reset a
  // chosen large box to the suggestion. See lib/seller/packaging.ts.
  // Renting: what the piece has today, unless she has touched it this session.
  const isRentable = renting ?? Boolean(rental.data);
  const rentForm = terms ?? (rental.data
    ? formFromTiers(rental.data.tiers ?? [], rental.data.replacementCents ?? null)
    : formFromTiers(starterTiers(item.priceCents), null));
  const rentProblem = isRentable ? termsProblem(rentForm) : null;

  const rec = item as unknown as Record<string, unknown>;
  const currentPacking = packing ?? packagingFromDims({
    lengthIn: rec.lengthIn as number | null, widthIn: rec.widthIn as number | null,
    heightIn: rec.heightIn as number | null, weightOz: rec.weightOz as number | null,
  });
  // ONLY THE THREE THAT ARE ACTUALLY WIRED UP. The route returns every marketplace VYA knows
  // about, including seven still marked "soon", and this screen was drawing all ten as if they
  // were choices, so a seller could switch on Poshmark or Grailed and nothing would ever happen.
  const platforms = liveCrossListPlatforms(crossList.data?.platforms ?? []);
  const chosenConsignor = consignor !== undefined ? consignor : (item.consignorId ?? null);
  const isDraft = item.status === "draft";
  const chosen = cols ?? (Array.isArray(item.collections) ? item.collections : []);
  const shots = photos ?? (Array.isArray(item.images) ? item.images : []);

  /** Camera or library: a piece with no photo is usually one sitting right in front of her.
   *  Uploaded immediately: the route stores URLs, never bytes. */
  async function addPhotos() {
    // One definition of the cap (listing-fields.ts), matching what the routes actually store.
    const uris = await pickPhotos(remainingSlots(shots.length, MAX_PHOTOS));
    if (uris.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const uri of uris) urls.push(await uploadPhoto(uri));
      setPhotos([...shots, ...urls].slice(0, MAX_PHOTOS));
    } catch (e) {
      fail(e, "Couldn't upload those photos.");
    } finally {
      setUploading(false);
    }
  }

  /**
   * FILL WITH AI: the add-listing page's button, on a piece that already exists.
   *
   * The listing flow has always been able to read a photograph; the editor never could. So a piece
   * that arrived thin, a Market Mode quick list, a Shopify import, anything typed at a stall,
   * could only be finished by hand, field by field, even though the photographs were sitting right
   * there at the top of this very screen.
   *
   * TWO RULES, BOTH THE WEB'S. Everything already written is sent as `filled`, which the route
   * treats as authoritative and does not spend a pass generating. And the answer only ever lands in
   * an EMPTY field: her words are never overwritten, which is what makes it safe to tap on a piece
   * that is already half described and already live.
   *
   * It does not re-price. The web fills and prices in one go because it is drafting something that
   * has no price yet; this piece has one, chosen by a person, and quietly moving it would be the
   * single worst thing this button could do.
   */
  async function fillWithAI() {
    if (shots.length === 0) { setError("Add a photo first. It reads the photographs."); return; }
    setError(null);
    setFilledNote(null);
    setFilling(true);
    try {
      // Everything already written goes up as `filled`: the route only drafts what it is NOT given,
      // so her words are authoritative and cost nothing to compute. The same bargain the web makes.
      const known: Record<string, string | undefined> = {};
      for (const f of FIELDS) { const v = current(f.key).trim(); if (v) known[f.key] = v; }
      const { fields } = await draftListing(shots, known);

      // The rule about what may be written lives in lib/seller/fill.ts, where a test holds it.
      const { values, filled, parcelFilled } = fillBlanks(fields, (key) => current(key));
      setForm({ ...form, ...values });
      // The box follows the numbers. Filling three dimensions and leaving "Ships in" on its old
      // answer would put two contradicting claims about the same parcel on one screen.
      if (parcelFilled) {
        setPacking(packagingFromDims({
          lengthIn: values.lengthIn ?? (rec.lengthIn as number | null),
          widthIn: values.widthIn ?? (rec.widthIn as number | null),
          heightIn: values.heightIn ?? (rec.heightIn as number | null),
          weightOz: values.weightOz ?? (rec.weightOz as number | null),
        }));
      }
      setFilledNote(fillSummary(filled));
    } catch (e) {
      fail(e, "Couldn't read the photos. Try again.");
    } finally {
      setFilling(false);
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
            <Image key={`${src}-${i}`} source={{ uri: src }} style={{ width: 300, height: 340, borderRadius: radius, backgroundColor: colors.chip }} />
          ))}
        </ScrollView>
      ) : shots[0] ? (
        <Image source={{ uri: shots[0] }} style={{ width: "100%", height: 340, borderRadius: radius, backgroundColor: colors.chip }} />
      ) : (
        <View style={{ width: "100%", height: 340, borderRadius: radius, backgroundColor: colors.chip }} />
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
          {/* Photos first, because they are the listing. Tap one to make it the cover. The first
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
            <View style={{ flexDirection: "row", marginTop: spacing.md }}>
              <Button
                label={filling ? "Reading the photos…" : "Fill with AI"}
                disabled={busy || filling || uploading || shots.length === 0}
                onPress={() => void fillWithAI()}
              />
            </View>
            {filledNote ? (
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 }}>{filledNote}</Text>
            ) : shots.length === 0 ? (
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 }}>
                Add a photo and it can fill the empty fields for you.
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 }}>
                Fills the empty fields only. Anything you have written is left alone, and the price
                is never touched.
              </Text>
            )}
          </View>
          {/* THE SAME QUESTIONS, IN THE SAME ORDER, AS THE NEW-LISTING FORM.
              Both screens read FIELDS from lib/seller/listing-fields.ts. They used to keep their own
              orders and their own controls: this one put Price second and asked for Condition in a
              free-text box, where a seller could type "quite good" and get a grade the product page
              cannot render. Listing a piece and editing it an hour later were two different forms
              about one record. */}
          {FIELDS.map((f) =>
            f.control === "grade" ? (
              <View key={f.key} style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingVertical: spacing.md }}>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>{f.label}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                  {CONDITION_GRADES.map((g) => {
                    const on = current(f.key) === g;
                    return (
                      <Pressable
                        key={g}
                        onPress={() => setForm({ ...form, [f.key]: g })}
                        style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: pillRadius, backgroundColor: on ? colors.chipActive : colors.chip }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "500", color: on ? colors.chipActiveText : colors.textMuted }}>{g}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <InlineField
                key={f.key}
                label={f.label}
                labelWidth={92}
                value={current(f.key)}
                onChangeText={(v) => {
                  setForm({ ...form, [f.key]: v });
                  // Typing a weight moves "Ships in" to the box that weight belongs to. She is the
                  // one holding the piece: heavier than the selected box means the box was wrong.
                  if (f.key === "weightOz") {
                    const oz = Number(v.replace(/[^0-9]/g, ""));
                    if (Number.isFinite(oz) && oz > 0) setPacking(suggestPackaging(oz));
                  }
                }}
                keyboardType={f.numeric ? "decimal-pad" : "default"}
                multiline={f.multiline}
                placeholder={f.placeholder}
              />
            ),
          )}

          {/* SHIPS IN: the web's one question instead of the phone's three boxes, and a row
              instead of seven chips. Choosing a preset writes its L/W/H onto the piece, which is
              exactly what the web does; the line underneath shows the size and the packed weight so
              nothing is decided out of sight. */}
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md }}>
            <SelectRow
              label="Ships in"
              title="What does it ship in?"
              value={currentPacking}
              options={PACKAGING.map((b) => ({ key: b.id, label: b.label, hint: b.hint }))}
              onChange={(key) => {
                const b = packagingById(key);
                if (!b) return;
                // The weight comes with the box, unless she weighed it herself. A hand-typed
                // weight is a measurement; a box picked afterwards must not overwrite it.
                const hers = current("weightOz").trim();
                const wasStandard = hers === "" || hers === String(weightForPackaging(currentPacking));
                setPacking(b.id);
                setForm({
                  ...form,
                  lengthIn: String(b.lengthIn), widthIn: String(b.widthIn), heightIn: String(b.heightIn),
                  ...(wasStandard ? { weightOz: String(weightForPackaging(b.id)) } : {}),
                });
              }}
            />
            {packagingSummary(currentPacking, current("weightOz")) ? (
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 }}>
                {packagingSummary(currentPacking, current("weightOz"))}
              </Text>
            ) : null}
          </View>

          {/* Measurements: the category's template, kept compact. One row, opening the fields (as Review). */}
          {measureKeys.length > 0 ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ width: 92, fontSize: 14, color: colors.textMuted }}>Measurements</Text>
                <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{measurementsLine || "-"}</Text>
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
                          placeholder="-"
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
          {/* Collections: the same grouping the storefront and the web editor use. Titles, not ids:
              the route creates one that doesn't exist yet, so the box inside the sheet is both pick
              and create. A store with twenty collections drew twenty chips here. */}
          <MultiSelectRow
            label="Collections"
            title="Which collections?"
            values={chosen}
            options={Array.from(new Set([...(collections.data?.collections ?? []).map((c) => c.title), ...chosen])).map((t) => ({ key: t, label: t }))}
            onChange={setCols}
            onCreate={(t) => { if (!chosen.includes(t)) setCols([...chosen, t]); }}
            createPlaceholder="New collection"
          />

          {/* WHEN IT GOES LIVE. Drafts only: the cron that flips a schedule looks at drafts, so
              offering this on a live piece would be offering something that cannot happen. */}
          {isDraft ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Goes live</Text>
              {/* The same calendar the listing form uses. It was four presets and a box wanting
                  "2026-09-15 18:00" typed by hand, which is a date format, not a question. */}
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                {([["When I say", !scheduledAt], ["Schedule", !!scheduledAt]] as const).map(([label, on]) => (
                  <Pressable
                    key={label}
                    onPress={() => setWhen(label === "When I say" ? null : scheduledAt ?? tomorrowEvening())}
                    style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: pillRadius, backgroundColor: on ? colors.chipActive : colors.chip }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "500", color: on ? colors.chipActiveText : colors.textMuted }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {scheduledAt ? <WhenPicker value={scheduledAt} onChange={(d) => setWhen(d)} /> : null}
              <Text style={{ fontSize: 12, color: scheduledAt ? colors.positive : colors.textDim, marginTop: spacing.xs }}>
                {describeSchedule(scheduledAt) ?? "It stays a draft until you list it."}
              </Text>
            </View>
          ) : null}

          {/* WHOSE PIECE IT IS. Asked whether or not anybody has been added yet.
              
              This section used to appear only once a store had at least one consignor, which is
              exactly backwards: a shop takes its first consigned piece BEFORE it has a consignor
              record, usually with the person standing at the counter holding the coat. With the
              section hidden there was nothing on the screen to say the app could do this at all,
              so the piece went in as the store's own and the split was reconstructed later, by
              memory. The row is always here now, and the sheet's last line is the way in. */}
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
            <SelectRow
              label="Consignor"
              title="Is this on consignment?"
              value={chosenConsignor == null ? "" : String(chosenConsignor)}
              options={[
                // "None", not "Mine": the row is labelled Consignor, and a piece she bought outright
                // has no consignor. "Mine" reads as her BEING one, owed a split of her own sale.
                { key: "", label: "None", hint: "You bought it outright" },
                ...(consignors.data?.consignors ?? []).map((c) => ({ key: String(c.id), label: c.name })),
              ]}
              onChange={(key) => setConsignor(key === "" ? null : Number(key))}
              action={{
                label: "+ Add someone…",
                // The edit is not at risk: leaving this screen saves it (see onExit), so she comes
                // back to the piece as she left it with the new person in the list.
                onPress: () => router.push("/(seller)/consignors"),
              }}
            />
            <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xs, lineHeight: 17 }}>
              {(consignors.data?.consignors ?? []).length === 0
                ? "Nobody added yet: open this to add the person who brought it in, and their split."
                : "Their cut comes from the split on their record. A piece that has already sold keeps the consignor it sold under."}
            </Text>
          </View>

          {/* CROSS-LISTING. Stored here, pushed when the piece publishes, never from the phone. */}
          {platforms.length > 0 ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Also list on</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
                {platforms.map((pl) => {
                  const on = chosenChannels.includes(pl.key);
                  return (
                    <Pressable
                      key={pl.key}
                      onPress={() => setChannels(on ? chosenChannels.filter((k) => k !== pl.key) : [...chosenChannels, pl.key])}
                      style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius, borderWidth: 1, borderColor: on ? colors.chipActive : colors.border, backgroundColor: on ? colors.chipActive : colors.chip }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.chipActiveText : colors.text }}>{pl.name}</Text>
                      {/* SAY WHAT EACH ONE WILL DO. eBay has a real API and posts itself; Depop and
                          Vestiaire have none, so the extension fills her own logged-in form and
                          that only happens at a browser. Same chip, two different promises. */}
                      <Text style={{ fontSize: 11, marginTop: 1, color: on ? colors.chipActiveText : colors.textDim, opacity: on ? 0.8 : 1 }}>
                        {crossListNote(pl)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 }}>
                {crossListFootnote(platforms)}
              </Text>
            </View>
          ) : null}

          {/* RENT IT OUT. A piece is rentable exactly when terms exist for it, so this is a switch
              and a short price list rather than a form. The lengths are VYA's three. A long
              weekend, a week, a month, and an unpriced one is simply not offered. Opening prices
              are suggested from what the piece sells for, using the same proportions as the web,
              because three empty boxes and a Save that fails is how the toggle used to feel. */}
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
            <Pressable
              onPress={() => { setRenting(!isRentable); if (!isRentable && terms === null) setTerms(rentForm); }}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.text }}>Rent it out</Text>
                <Text style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>
                  {isRentable ? (termsSummary(rentForm, item.currency) ?? "Give at least one length a price") : "Sale only"}
                </Text>
              </View>
              <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius, borderWidth: 1, borderColor: isRentable ? colors.chipActive : colors.border, backgroundColor: isRentable ? colors.chipActive : colors.chip }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: isRentable ? colors.chipActiveText : colors.text }}>{isRentable ? "On" : "Off"}</Text>
              </View>
            </Pressable>

            {isRentable ? (
              <View style={{ marginTop: spacing.md }}>
                {TIER_DAYS.map((days) => (
                  <InlineField
                    key={days}
                    label={tierLabel(days)}
                    labelWidth={92}
                    value={rentForm.prices[days] ?? ""}
                    onChangeText={(v) => setTerms({ ...rentForm, prices: { ...rentForm.prices, [days]: v } })}
                    keyboardType="decimal-pad"
                    placeholder="not offered"
                  />
                ))}
                <InlineField
                  label="If it's lost"
                  labelWidth={92}
                  value={rentForm.replacement}
                  onChangeText={(v) => setTerms({ ...rentForm, replacement: v })}
                  keyboardType="decimal-pad"
                  placeholder="replacement value"
                />
                {rentProblem ? (
                  <Text style={{ fontSize: 12, color: colors.accent, marginTop: spacing.sm }}>{rentProblem}</Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Done, not Save: the changes are already going whether or not this is tapped, and a
              button that promises to do something that has happened anyway is a button that teaches
              her to distrust the screen. Discard is the one that changes the outcome, so it says
              what it does rather than "Cancel". */}
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
            <Button label={save.isPending ? "Saving…" : "Done"} primary={!isDraft} disabled={busy || filling} onPress={() => (dirty ? save.mutate() : setMode("view"))} />
            {/* Straight from the form. She has just finished the piece; making her tap Done, read
                the view, and find Publish is three taps for one intention. */}
            {isDraft ? (
              <Button
                label={publish.isPending ? "Publishing…" : scheduledAt ? "Schedule it" : "Publish"}
                primary
                disabled={busy || filling}
                onPress={() => publish.mutate()}
              />
            ) : null}
            {dirty ? (
              <Button label="Discard changes" disabled={busy || filling} onPress={() => { setMode("view"); clearEdits(); setError(null); }} />
            ) : null}
          </View>
          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 }}>
            {save.isPending
              ? "Saving…"
              : dirty
                ? `Changes save themselves when you leave${isDraft ? ": it stays a draft until you list it" : ""}.`
                : savedAt
                  ? "Saved."
                  : "Changes save themselves when you leave."}
          </Text>
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
          {/* A DRAFT'S FIRST QUESTION IS "PUT IT OUT", so on a draft that is the filled button and
              Edit steps back. On a live piece there is nothing to publish and Edit leads. */}
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
            {isDraft ? (
              <Button
                label={publish.isPending ? "Publishing…" : scheduledAt ? "Schedule it" : "Publish"}
                primary
                disabled={busy}
                onPress={() => publish.mutate()}
              />
            ) : null}
            <Button label="Edit" primary={!isDraft} disabled={busy} onPress={() => { setError(null); setMode("edit"); }} />
            {isDraft ? null : (
              <Button
                label={markSold.isPending ? "Marking…" : sold ? "Sold" : "Mark sold"}
                disabled={sold || busy}
                onPress={() => markSold.mutate()}
              />
            )}
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

      {/* Flaws: the list shoppers see under Condition; Edit changes it as one comma-separated line. */}
      {flaws.length > 0 && mode === "view" ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...eyebrow }}>FLAWS</Text>
          {flaws.map((f, i) => (
            <Text key={`${f}-${i}`} style={{ fontSize: 14, color: colors.text, marginTop: spacing.xs }}>{"\u2022"} {f}</Text>
          ))}
        </View>
      ) : null}
      {/* Beyond the grade and the tape measure. Both print on the product page; Edit changes them. */}
      {item.conditionNote && mode === "view" ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...eyebrow }}>CONDITION NOTE</Text>
          <Text style={{ fontSize: 14, color: colors.text, marginTop: spacing.xs }}>{item.conditionNote}</Text>
        </View>
      ) : null}
      {storedMeasurementsLine && mode === "view" ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...eyebrow }}>MEASUREMENTS</Text>
          <Text style={{ fontSize: 14, color: colors.text, marginTop: spacing.xs }}>{storedMeasurementsLine}</Text>
        </View>
      ) : null}
    </SellerScreen>
  );
}
