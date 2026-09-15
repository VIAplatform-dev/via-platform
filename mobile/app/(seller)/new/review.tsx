import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { GestureDetector } from "react-native-gesture-handler";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fonts, radius, pill, eyebrow } from "../../../lib/portal-theme";
import { useDraft } from "../../../lib/seller/draft";
import { PhotoGrid } from "../../../components/seller/PhotoGrid";
import { useEdgeBack } from "../../../components/seller/EdgeBack";
import { PhotoViewer } from "../../../components/seller/PhotoViewer";
import { MultiSelectRow, SelectRow } from "../../../components/seller/Select";
import { InlineField } from "../../../components/seller/Form";
import { WhenPicker } from "../../../components/seller/WhenPicker";
import { tomorrowEvening } from "../../../lib/seller/calendar";
import { FIELDS } from "../../../lib/seller/listing-fields";
import { PACKAGING, packagingById, packedWeightOz } from "../../../lib/seller/packaging";
import { liveCrossListPlatforms, crossListNote, crossListFootnote } from "../../../lib/seller/cross-listing";
import { TIER_DAYS, tierLabel, starterTiers, formFromTiers, termsProblem, termsPayload, termsSummary, type TermsForm } from "../../../lib/seller/rental-terms";
import { timed } from "../../../lib/seller/timing";
import { flawsFromLine, flawsToLine, costFromText, CONDITION_GRADES, type ConditionGrade } from "../../../lib/seller/intake-shape";
import { publishListing, draftListing, priceListing } from "../../../lib/seller/intake";
import { fillDraftBlanks, describeFilled } from "../../../lib/seller/fill";
import { filledFields } from "../../../lib/seller/listing";
import { formatMoney } from "../../../lib/seller/home";
import { parcelEstimateFrom, defaultParcelFor, parcelMismatch } from "../../../lib/seller/parcel";
import { floorMissFor, describeFloorMiss } from "../../../lib/seller/price-floor";
import { describeSchedule } from "../../../lib/seller/schedule";
import { templateFor, unitFor, measurementsFromForm, formatMeasurements, MEASUREMENT_LABELS, type MeasurementKey } from "../../../lib/seller/measurements";
import { apiGet, apiPatch, apiPost, apiPut } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useQuery } from "@tanstack/react-query";

// Review: a handful of rows, each with what VYA decided and a way to disagree.
//
// Price shows how many comparable sales it read, because a number with no reasoning behind it is
// one she will override every time. "14 comps" is the difference between a guess and a finding.
// Condition is chips on a fixed scale, Ships as is the parcel tier with a warning when her weight
// disagrees with what the piece looks like, and Measurements opens the category's template.
//
// This screen is also the ONLY place the pricing floor can be checked on the phone. Loading prices
// the piece before Review, and what she paid is typed here, so the price is set while the cost is
// still unknown and nothing earlier could have compared the two. Price and Cost are adjacent rows
// here, which makes this the first and last moment both numbers exist. See lib/seller/price-floor.ts.

/** Amber, for a field worth a second look. Not an error colour: the model being unsure does not
 *  make it wrong. It marks the label and the box's EDGE rather than washing the row, because a
 *  tinted block behind a row reads as a selection in the workspace's language. */
const UNSURE = colors.warning;

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
  const { photos, fields, setFields, imageUrls, compsCount, setCompsCount, priceCents, setPriceCents, itemId, setItemId, reset,
          movePhoto, removePhoto, unsure, setUnsure, confirmed, setConfirmed, collections, setCollections } = useDraft();
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
  // The store's unit for measurements. Inches for a US ship-from, cm elsewhere.
  const shipping = useQuery({ queryKey: ["store", "shipping"], queryFn: () => apiGet<{ currency?: string; shipFrom?: { country?: string | null } | null }>("/api/store/shipping"), enabled: !!storeSlug });
  const currency = me.data?.currency ?? "USD";
  const unit = unitFor({ country: shipping.data?.shipFrom?.country, currency: shipping.data?.currency ?? currency });
  // Her minimum markup over cost. Not defaulted to the server's 3000 on failure: a floor invented
  // client-side would accuse her of underpricing on no evidence, so a silent query means no warning.
  const pricingSettings = useQuery({ queryKey: ["store", "pricing"], queryFn: () => apiGet<{ minMarkupBps: number }>("/api/store/pricing"), enabled: !!storeSlug });
  const minMarkupBps = pricingSettings.data?.minMarkupBps ?? null;
  // WHICH FIELD HAS THE KEYBOARD. Every row is a live box now, so "is she mid-edit" is a focus
  // question rather than a mode: without it the floor warning fires on the first digit of a price
  // and argues with her while she is still typing it.
  const [focused, setFocused] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  // Back to the camera with a drag from the left edge. This screen is a tab, so it has no back
  // gesture of its own and there is no chevron on it either: before this, the only way out of a
  // half-finished listing was the tab bar.
  const edgeBack = useEdgeBack();
  // The box she ships it in. Seeded from the parcel the model judged, so the row is never blank on
  // a piece that has already been read, and never contradicts the weight below it.
  const [packing, setPacking] = useState<string | null>(null);
  // RENT THIS ONE OUT. Off unless she says so: a shop that rents part of its rail does not rent all
  // of it, and a piece is rentable exactly when terms exist for it.
  const [renting, setRenting] = useState(false);
  const [terms, setTerms] = useState<TermsForm | null>(null);
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
  const [filling, setFilling] = useState<string | null>(null);
  const [filledNote, setFilledNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ships as: the AI's parcel when it made one, else the category's default (lib/seller/parcel.ts).
  const estimate = parcelEstimateFrom(fields.parcel) ?? { ...defaultParcelFor(fields.category), source: "category" as const };
  const typedWeight = fields.weightOz && fields.weightOz.trim() ? Number(fields.weightOz) : null;
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
  const showFloorMiss = floorMiss && minMarkupBps !== null && floorKey !== floorSettled && focused !== "cost" && focused !== "price";

  // The store's collections. Same key and route as the piece editor, so opening one after the
  // other doesn't refetch a list that hasn't changed.
  const collectionOptions = useQuery({
    queryKey: ["store", "collections"],
    queryFn: () => apiGet<{ collections: { id: string; title: string }[] }>("/api/store/collections?all=1"),
    enabled: !!storeSlug,
  });
  // Renting is a store-level mode before it is a per-piece choice, which is the gate the web form
  // uses: offering "rent it out" on a shop that has never switched renting on would produce a piece
  // with terms and no policy behind them.
  const rentalSettings = useQuery({
    queryKey: ["store", "rentals", "settings"],
    queryFn: () => apiGet<{ settings?: { enabled?: boolean } }>("/api/store/rentals/settings"),
    enabled: !!storeSlug,
  });
  const rentalsOn = Boolean(rentalSettings.data?.settings?.enabled);
  // Opening prices from what the piece sells for, so the toggle never reveals three empty boxes.
  const rentForm = terms ?? formFromTiers(starterTiers(priceCents), null);
  const rentProblem = renting ? termsProblem(rentForm) : null;

  // ONLY THE MARKETPLACES THAT EXIST. The route returns all ten channels it knows about; seven are
  // mode "soon" and a chip that takes a decision and discards it is worse than no chip.
  const livePlatforms = liveCrossListPlatforms(crossList.data?.platforms ?? []);

  // Typed as one shape so `note` exists on every row. A union would make it present on Price
  // only, which TypeScript rightly refuses to read off the others.
  //
  // EVERY FIELD, NOT SEVEN. This screen showed brand, price, cost, condition, flaws, category and
  // the parcel, so a piece listed from the phone could never be given a title, a size, an era, a
  // material, a colour or a description without reopening it in Inventory afterwards. Those six
  // are the ones a shopper actually reads, and the pricer takes era and material as inputs.
  // THE SHARED LIST, IN THE SHARED ORDER. This screen and the piece editor both read FIELDS from
  // lib/seller/listing-fields.ts, so the two can never again ask the same questions in different
  // orders with different controls. Weight is pulled out because it belongs under the box it goes
  // in; condition is drawn as chips inside the loop, in its own place in the order.
  const rows = FIELDS.filter((f) => f.key !== "weightOz").map((f) => ({
    key: f.key,
    label: f.label,
    control: f.control,
    multiline: f.multiline,
    placeholder: f.placeholder,
    // The one row that carries a note: how many comparable sales stand behind the number.
    note: f.key === "price" && compsCount ? `${compsCount} comps` : null,
  }));
  /**
   * FILL THE REST WITH AI. The whole AI pass, on the one page.
   *
   * It used to be spread over three screens: a Details form asking a subset of these same fields, a
   * full-screen Loading page running the calls, and this. A seller filled in a brand on one screen
   * and met the brand row again on another, and the flow could not be completed without visiting
   * all three. It is one page now, and this is what the middle one did.
   *
   * THREE THINGS, IN ORDER, and only the ones still needed:
   *   1. Draft the fields. Everything already written goes up as `filled`, the route does not spend
   *      a pass generating what it is given, and the answer only ever lands in an EMPTY row. Her
   *      words are never replaced. See lib/seller/fill.ts, which a test holds to that.
   *   2. Price it, but only when there is no price. A number she typed is an answer, and running
   *      the pricer over it would be spending money to overrule her.
   *   3. Save it as a draft, if it isn't one yet. That is what makes "you can walk away" true: from
   *      here the piece exists server-side whether or not she taps List it, and List it then edits
   *      that row rather than creating a second copy.
   *
   * The label says which of the three is running, because they take tens of seconds between them
   * and a spinner that sits still for forty seconds is indistinguishable from one that has hung.
   */
  async function fillWithAI() {
    if (imageUrls.length === 0) { setError("Add a photo first. It reads the photographs."); return; }
    setError(null);
    setFilledNote(null);
    setFilling("Reading your photos…");
    try {
      const known = filledFields({
        title: fields.title, brand: fields.brand, era: fields.era, material: fields.material,
        colour: fields.colour, size: fields.size, category: fields.category,
        condition: fields.condition, conditionNote: fields.conditionNote, description: fields.description,
      });
      const draft = await timed("draft (/api/store/intake)", () => draftListing(imageUrls, known));
      const { fields: next, filled } = fillDraftBlanks(draft.fields, fields);
      setFields(next);
      // Only the blanks this pass actually filled can be newly unsure: fillDraftBlanks leaves
      // everything she already has a value for alone, so a field she has since corrected must not
      // be re-flagged by a second run.
      setUnsure(Array.from(new Set([...unsure, ...draft.unsure.filter((k) => filled.includes(k))])));
      // The measurement form is separate state, so a category arriving here changes which template
      // is asked for: the boxes she has already filled stay filled, the new template adds its own.
      setFilledNote(describeFilled(filled));

      // Everything the desktop sends. Three of these were once missing and the phone priced with
      // less evidence than the web on the same photo: a Todd Oldham dress came back at 16,013 here
      // and 1,681 there. See draftListing for what knowledgeHintCents is.
      let priced = priceCents;
      if (priceCents === null) {
        setFilling("Checking comparable sales…");
        const pricing = await timed("pricing (/api/store/intake/pricing)", () =>
          priceListing(imageUrls, next, {
            searchQuery: draft.searchQuery,
            reverseComps: draft.reverseComps,
            reverseTitles: draft.reverseTitles,
            editorialTitles: draft.editorialTitles,
            knowledgeHintCents: draft.knowledgeHintCents,
            draftRanFull: draft.draftRanFull,
          }),
        );
        setCompsCount(pricing.compsCount);
        setPriceCents(pricing.priceCents);
        priced = pricing.priceCents;
      }

      // Not fatal: this screen still holds everything and List it will create the piece itself. It
      // only costs her the "walk away and it's in Drafts" guarantee.
      if (!itemId) {
        setFilling("Saving to Drafts…");
        const saved = await timed("save draft (/api/store/intake/publish)", () =>
          publishListing({ ...next, imageUrls, priceCents: priced }, "draft"),
        ).catch(() => null);
        if (saved?.itemId) setItemId(saved.itemId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the photos. Try again.");
    } finally {
      setFilling(null);
    }
  }

  const commitFlaws = () => {
    if (flawsLine !== null) setFields({ ...fields, flaws: flawsFromLine(flawsLine) });
    setFlawsLine(null);
  };

  async function save(status: "active" | "draft") {
    setError(null);
    setSaving(status);
    const measurements = measurementsFromForm(measureForm, unit);
    // Loading's draft row when there is one; otherwise whatever publish just created.
    let rentalTarget: string | null = itemId;
    try {
      if (itemId) {
        // Loading already saved this piece as a draft; publishing is an edit of that row, so
        // "List it" never produces a second copy of the same piece in Inventory. Going live uses
        // the same `publish` transition the desktop does, so anything it schedules (cross-listing,
        // publish-at) happens here too.
        // EVERY FIELD SHE CAN EDIT, not a subset.
        //
        // This sent title, brand, condition, note, category, flaws, cost, weight, measurements and
        // price, and stopped there. Era, material, colour, size and description were drawn as rows
        // with a box, typed into, and then dropped: the draft row already carried the AI's values,
        // so the piece looked filled in and her CORRECTION was the thing that vanished. That lands
        // hardest on exactly the fields "AI unsure. Confirm" asks her to check.
        await apiPatch(`/api/store/items/${itemId}`, {
          ...(fields.title ? { title: fields.title } : {}),
          ...(fields.brand !== undefined ? { brand: fields.brand } : {}),
          ...(fields.era !== undefined ? { era: fields.era } : {}),
          ...(fields.material !== undefined ? { material: fields.material } : {}),
          ...(fields.colour !== undefined ? { colour: fields.colour } : {}),
          ...(fields.size !== undefined ? { size: fields.size } : {}),
          ...(fields.description !== undefined ? { description: fields.description } : {}),
          ...(collections.length ? { collections } : {}),
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
        // so it stays a draft and the publish-scheduled cron flips it. Publishing here as well
        // would put it live immediately and leave a schedule that had already happened.
        if (status === "active" && !when) await apiPost(`/api/store/items/${itemId}`, { action: "publish" });
      } else {
        const made = await publishListing(
          {
            ...fields, measurements, imageUrls, priceCents,
            ...(when ? { publishAt: when.toISOString() } : {}),
            ...(consignor !== null ? { consignment: { consignorId: consignor } } : {}),
            ...(channels.length ? { channels } : {}),
            ...(collections.length ? { collections } : {}),
          },
          // Same rule as above: a scheduled piece is saved as a draft with a time on it.
          when ? "draft" : status,
        );
        rentalTarget = made?.itemId ?? null;
      }

      // RENTING IS ITS OWN RESOURCE, not a field on the item: terms exist or they don't. So it is a
      // second call, after the piece has an id for them to hang off, exactly as the web form does
      // it. NOT FATAL: the piece is listed by this point, and failing the whole save over a rental
      // ladder would lose a finished listing to fix something she can set on the piece afterwards.
      if (renting && rentalTarget && !termsProblem(rentForm)) {
        /* allow-swallow: the piece is already listed; renting can be switched on from the piece */
        await apiPut(`/api/store/rentals/terms/${rentalTarget}`, termsPayload(rentForm, true)).catch(() => {});
      }

      // The new piece has to show up wherever pieces are counted, the rental list included.
      await qc.invalidateQueries({ queryKey: ["store", "items"] });
      if (renting) await qc.invalidateQueries({ queryKey: ["store", "rentals"] });
      await qc.invalidateQueries({ queryKey: ["store", "overview", 1] });
      reset();
      // NO dismissAll(). It was here for the old four-screen flow (Capture → Details → Loading →
      // Review), where publishing had a stack of pushed screens to clear before landing in
      // Inventory. The flow is two screens now and both are tabs, so there is nothing to pop:
      // React Navigation answered with "The action 'POP_TO_TOP' was not handled by any navigator"
      // on every successful listing. Harmless, dev-only, and a lie about the shape of the flow.
      // `replace` alone does the whole job: it swaps this screen for Inventory rather than
      // stacking on it, so the back chevron never returns to a piece she has just published.
      router.replace("/(seller)/inventory");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <GestureDetector gesture={edgeBack}>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Her photographs, in the order they will publish in. Hold one to drag it, tap it to see it
          full size. It was `photos.slice(0, 4)`: not merely unsortable, but silently hiding every
          shot past the fourth on a flow that accepts twenty. */}
      <PhotoGrid photos={photos} onMove={movePhoto} onOpen={setViewing} />

      <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text, marginTop: spacing.xl }} numberOfLines={2}>
        {fields.title ?? "New piece"}
      </Text>

      {/* THE AI, AS AN ASSIST RATHER THAN A ROUTE. Full width and secondary, the way the web draws
          it: the form is the thing, and this fills whatever of it she has left blank. Same label and
          same hint as add-listing/page.tsx, so the two cannot drift. The subscription's remaining
          AI listings will read here once tiers are wired. */}
      <Pressable
        disabled={filling !== null || saving !== null}
        onPress={() => void fillWithAI()}
        style={{ flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center", backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: pill, paddingVertical: spacing.md, marginTop: spacing.lg, opacity: filling ? 0.6 : 1 }}
      >
        <Feather name="zap" size={14} color={colors.textMuted} />
        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textMuted }}>
          {filling ?? "Fill the rest with AI"}
        </Text>
      </Pressable>
      <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, textAlign: "center", lineHeight: 17 }}>
        {!fields.brand?.trim()
          ? "Tip: adding the brand sharpens the price & description, but AI will infer it from the photo if you leave it blank."
          : "Only fills blanks. Your price is always checked against live market comps."}
      </Text>
      {filledNote ? (
        <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 }}>{filledNote}</Text>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        {/* EVERY ROW IS A BOX. Tap the words and type.
            This was a value and a "Change" button: the value was a <Text>, so tapping the thing she
            wanted to change did nothing and the only way in was a 60pt target at the far right of
            the row. Title, brand and price are the three fields filled by hand on almost every
            piece, and all three took two taps and a thumb reach to begin.
            The rows that are genuinely a CHOICE (condition, ships-in, measurements, collections)
            stay pickers. */}
        {rows.map((r) => {
          const flagged = unsure.includes(r.key) && !confirmed[r.key];

          // CONDITION IS CHIPS, in its own place in the order rather than bolted on at the end.
          // One right answer and it is on a list, so a box to type a grade into is the wrong
          // instrument. The piece editor draws the same chips from the same list.
          if (r.control === "grade") {
            return (
              <View key={r.key} style={{ marginTop: spacing.lg }}>
                <Text style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: "500" }}>{r.label}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 6 }}>
                  {CONDITION_GRADES.map((g) => {
                    const on = fields.condition === g;
                    return (
                      <Pressable
                        key={g}
                        onPress={() => setFields({ ...fields, condition: g })}
                        style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: pill, backgroundColor: on ? colors.chipActive : colors.bgCard, borderWidth: 1, borderColor: on ? colors.chipActive : colors.border }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "500", color: on ? colors.chipActiveText : colors.textMuted }}>{g}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {fields.condition ? (
                  <Text style={{ fontSize: 11.5, color: colors.textDim, marginTop: spacing.xs }}>
                    {CONDITION_DEFINITIONS[fields.condition as ConditionGrade]}
                  </Text>
                ) : null}
              </View>
            );
          }

          const value =
            r.key === "price" ? (priceCents !== null ? String(priceCents / 100) : "")
            : r.key === "flaws" ? (flawsLine ?? flawsToLine(fields.flaws))
            : ((fields as Record<string, string | undefined>)[r.key] ?? "");

          return (
            <View key={r.key} style={{ marginTop: spacing.lg }}>
              {/* THE LABEL ABOVE, THE VALUE IN A BOX WITH AN EDGE.
                  This was a 92pt label column beside a bare value, both small, with a hairline
                  between fields: "too small and too close together, it needs to be clearly in
                  different boxes". It is the web form's shape now, and the value is 16px. */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 6 }}>
                <Text style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: "500" }}>{r.label}</Text>
                {/* "● AI unsure. Confirm", the web's words (add-listing/page.tsx riskyField), in
                    the web's amber, beside the label where it reads at a glance. */}
                {flagged ? (
                  <Text style={{ fontSize: 11.5, color: UNSURE, fontWeight: "500" }}>{"\u25CF"} AI unsure. Confirm</Text>
                ) : null}
                {r.note ? <Text style={{ fontSize: 12.5, color: colors.positive, marginLeft: "auto" }}>{r.note}</Text> : null}
              </View>
              <View>
                <TextInput
                  value={value}
                  onChangeText={(v) => {
                    // Typing into a queried field IS answering it: she has replaced the guess.
                    if (unsure.includes(r.key) && !confirmed[r.key]) setConfirmed({ ...confirmed, [r.key]: true });
                    if (r.key === "flaws") setFlawsLine(v);
                    else if (r.key === "price") {
                      // Typed in whole currency, stored in cents. The same units the pricer used.
                      const n = Number(v.replace(/[^0-9.]/g, ""));
                      setPriceCents(Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null);
                    } else if (r.key === "cost") setFields({ ...fields, cost: v.replace(/[^0-9.]/g, "") });
                    else setFields({ ...fields, [r.key]: v });
                  }}
                  onFocus={() => setFocused(r.key)}
                  onBlur={() => { if (r.key === "flaws") commitFlaws(); setFocused(null); }}
                  multiline={r.multiline}
                  keyboardType={r.key === "price" || r.key === "cost" ? "decimal-pad" : "default"}
                  placeholder={r.placeholder}
                  placeholderTextColor={colors.textDim}
                  style={{
                    backgroundColor: colors.bgCard,
                    borderWidth: 1,
                    borderColor: flagged ? UNSURE : colors.border,
                    borderRadius: radius,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.md,
                    fontSize: 16,
                    color: colors.text,
                    minHeight: r.multiline ? 88 : 46,
                    textAlignVertical: r.multiline ? "top" : "center",
                  }}
                />
              </View>

              {/* Price: below what she decided she must make on it. Warned, never silently
                  rewritten. A price she has seen is a decision, and this only undoes one made
                  before the cost was known. This screen is the only place on the phone the floor
                  CAN be checked: pricing happens before Cost is typed, and these two rows are the
                  first moment both numbers exist. See lib/seller/price-floor.ts. */}
              {r.key === "price" && showFloorMiss && floorMiss && minMarkupBps !== null ? (
                <View style={{ marginLeft: 92, marginTop: spacing.sm, backgroundColor: colors.bgAlt, borderRadius: radius, padding: spacing.md }}>
                  <Text style={{ fontSize: 12, color: colors.text, lineHeight: 17 }}>
                    {describeFloorMiss(floorMiss, minMarkupBps, currency)}
                  </Text>
                  <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }}>
                    <Pressable hitSlop={8} onPress={() => setPriceCents(floorMiss.floorCents)}>
                      <Text style={{ fontSize: 13, color: colors.accentInk, fontWeight: "500" }}>
                        Raise it to {formatMoney(floorMiss.floorCents, currency)}
                      </Text>
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => setFloorSettled(floorKey)}>
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>Leave it</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* The tick. A real control, not a nag she can only silence by editing: the model
                  being unsure does not make it WRONG, and a seller who reads "Chanel" and knows it
                  is right must be able to say so in one tap. */}
              {flagged ? (
                <Pressable
                  onPress={() => setConfirmed({ ...confirmed, [r.key]: true })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 92, marginTop: spacing.sm }}
                >
                  <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: UNSURE }} />
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Confirmed</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {/* SHIPS IN: the web's one question, and the piece editor's, instead of a computed tier she
            could not change. Choosing a box writes its dimensions onto the piece; the weight follows
            the box unless she has weighed it herself, because a hand-typed weight is a measurement
            and a box picked afterwards must not overwrite it. */}
        <SelectRow
          label="Ships in"
          title="What does it ship in?"
          value={packing}
          options={PACKAGING.map((b) => ({ key: b.id, label: b.label, hint: b.hint }))}
          onChange={(key) => {
            const b = packagingById(key);
            if (!b) return;
            const hers = (fields.weightOz ?? "").trim();
            const wasStandard = hers === "" || hers === String(packedWeightOz(estimate.weightOz, packagingById(packing)));
            setPacking(b.id);
            setFields({ ...fields, ...(wasStandard ? { weightOz: String(packedWeightOz(estimate.weightOz, b)) } : {}) });
          }}
          placeholder="Pick a box or mailer"
          palette={colors}
        />

        <View style={{ marginTop: spacing.lg }}>
          <Text style={{ fontSize: 13.5, color: colors.textMuted, fontWeight: "500", marginBottom: 6 }}>Weight</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <TextInput
              value={fields.weightOz ?? ""}
              onChangeText={(v) => setFields({ ...fields, weightOz: v.replace(/[^0-9]/g, "") })}
              keyboardType="number-pad"
              placeholder={`${estimate.weightOz} oz packed`}
              placeholderTextColor={colors.textDim}
              style={{ flex: 1, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16, color: colors.text, minHeight: 46 }}
            />
            <Text style={{ fontSize: 14, color: colors.textMuted }}>oz</Text>
          </View>
        </View>
        {mismatch ? (
          <Text style={{ fontSize: 12, color: UNSURE, marginTop: spacing.xs }}>{mismatch.message}</Text>
        ) : null}

        {/* Measurements: the category's template, kept compact. One row, opening the fields. */}
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
                        value={measureForm[k] ?? ""}
                        onChangeText={(v) => setMeasureForm({ ...measureForm, [k]: v.replace(/[^0-9.]/g, "") })}
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
      </View>

      {/* When it goes out, whose it is, and where else it lands. The three things the web asks at
          publish time and the phone never did. */}
      <Text style={{ ...eyebrow, marginTop: spacing.xl }}>GOES LIVE</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        {([["Now", !when], ["Schedule", !!when]] as const).map(([label, on]) => (
          <Pressable
            key={label}
            onPress={() => setWhen(label === "Now" ? null : when ?? tomorrowEvening())}
            style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: pill, backgroundColor: on ? colors.chipActive : colors.chip }}
          >
            <Text style={{ fontSize: 12, fontWeight: "500", color: on ? colors.chipActiveText : colors.textMuted }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {when ? (
        <>
          <WhenPicker value={when} onChange={setWhen} />
          <Text style={{ fontSize: 12, color: colors.positive, marginTop: spacing.sm }}>
            {describeSchedule(when)}: it waits in Drafts until then.
          </Text>
        </>
      ) : null}

      {(consignors.data?.consignors ?? []).length > 0 ? (
        <>
          <Text style={{ ...eyebrow, marginTop: spacing.xl }}>CONSIGNOR</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable
              onPress={() => setConsignor(null)}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: consignor === null ? colors.chipActive : colors.chip }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: consignor === null ? colors.chipActiveText : colors.textMuted }}>None</Text>
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

      {/* ONLY THE MARKETPLACES THAT EXIST. This drew `platforms` raw, which is all ten channels the
          route knows about, so Poshmark, Etsy and Grailed sat here as tappable chips that do
          nothing: their mode is "soon". liveCrossListPlatforms has filtered to the three real ones
          since it was written, and this screen never called it. Each now says what choosing it
          actually causes: eBay posts itself; Depop and Vestiaire have no listing API at all and are
          finished from a browser with the extension. */}
      {livePlatforms.length > 0 ? (
        <>
          <Text style={{ ...eyebrow, marginTop: spacing.xl }}>ALSO LIST ON</Text>
          <View style={{ marginTop: spacing.sm }}>
            {livePlatforms.map((pl) => {
              const on = channels.includes(pl.key);
              return (
                <Pressable
                  key={pl.key}
                  onPress={() => setChannels(on ? channels.filter((k) => k !== pl.key) : [...channels, pl.key])}
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSoft }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.accent : "transparent", borderWidth: on ? 0 : 1.5, borderColor: colors.border }}>
                    {on ? <Feather name="check" size={14} color={colors.accentText} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text }}>{pl.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>{crossListNote(pl)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 }}>
            Your storefront always goes live. {crossListFootnote(livePlatforms)}
          </Text>
        </>
      ) : null}

      {/* RENT THIS ONE OUT.
          The web's add-listing form has carried this since it was built (RentalPanel), and the
          phone's piece EDITOR has it too, so renting could be switched on at a laptop, or on the
          phone afterwards by reopening a piece she had just finished listing. The one place it was
          missing was the moment she is deciding what the piece is for. Hidden entirely when the
          shop does not rent: terms with no store policy behind them are terms nothing can honour. */}
      {rentalsOn ? (
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingVertical: spacing.md, marginTop: spacing.lg }}>
          <Pressable
            onPress={() => { const next = !renting; setRenting(next); if (next && terms === null) setTerms(rentForm); }}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: colors.text, fontWeight: "500" }}>Rent it out</Text>
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>
                {renting ? (termsSummary(rentForm, currency) ?? "Give at least one length a price") : "Sale only"}
              </Text>
            </View>
            <View style={{ width: 38, height: 22, borderRadius: pill, backgroundColor: renting ? colors.accent : colors.border, justifyContent: "center" }}>
              <View style={{ width: 17, height: 17, borderRadius: pill, backgroundColor: "#fff", marginLeft: renting ? 18 : 3 }} />
            </View>
          </Pressable>

          {renting ? (
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
                <Text style={{ fontSize: 12, color: UNSURE, marginTop: spacing.sm }}>{rentProblem}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* COLLECTIONS, which the listing flow simply never had. The piece editor has carried this
          since it was built, so a seller could group a piece the moment she reopened it but not
          while she was listing it: the one screen where she is already thinking about what the
          piece IS. Titles not ids, so a collection typed here is created by the publish. */}
      <MultiSelectRow
        label="Collections"
        title="Which collections?"
        values={collections}
        options={Array.from(new Set([...(collectionOptions.data?.collections ?? []).map((c) => c.title), ...collections])).map((t) => ({ key: t, label: t }))}
        onChange={setCollections}
        onCreate={(t) => { if (!collections.includes(t)) setCollections([...collections, t]); }}
        createPlaceholder="New collection"
      />

      {error ? <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
        <Pressable
          disabled={saving !== null}
          onPress={() => void save("active")}
          style={{ flex: 2, backgroundColor: colors.accent, borderRadius: pill, paddingVertical: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "600" }}>
            {saving === "active" ? "Listing…" : when ? "Schedule it" : "List it"}
          </Text>
        </Pressable>
        <Pressable
          disabled={saving !== null}
          onPress={() => void save("draft")}
          style={{ flex: 1, backgroundColor: colors.chip, borderRadius: pill, paddingVertical: spacing.lg, alignItems: "center" }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {saving === "draft" ? "Saving…" : "Draft"}
          </Text>
        </Pressable>
      </View>

      <PhotoViewer
        photos={photos}
        index={viewing}
        onClose={() => setViewing(null)}
        onMove={movePhoto}
        onRemove={removePhoto}
      />
    </ScrollView>
    </GestureDetector>
  );
}
