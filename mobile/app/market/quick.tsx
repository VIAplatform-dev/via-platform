import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost, ApiError } from "../../lib/api";
import { colors, spacing, fonts } from "../../lib/theme";
import { uploadPhoto, draftListing } from "../../lib/seller/intake";
import { fillDraftBlanks } from "../../lib/seller/fill";
import { filledFields } from "../../lib/seller/listing";
import { CATEGORY_GROUPS, CATEGORY_LABELS } from "../../lib/seller/categories";
import { SelectRow } from "../../components/seller/Select";

// Quick list: a piece that is on the table but not in the system.
//
// Same route as the desktop: POST /api/store/market/quick-list/create makes a draft with a price
// and, when asked, starts a cash checkout for it in the same call. The description, era and the
// rest can be filled in later from Drafts; at a stall the price is the only thing that cannot wait.
//
// THREE TENDERS, LIKE THE DESKTOP. Card is the primary button because it is the common one; cash
// and "just list" share the row beneath it. The phone used to offer cash or nothing, which at a
// market means turning away anybody without notes on them.
//
// Card takes two calls, not one: quick-list/create only ever opens a CASH checkout (see its route),
// so a card sale creates the piece first and then opens a `qr` checkout against it. The same two
// steps the desktop takes when it hands the confirm screen `?go=qr`.
//
// IT ASKS WHAT KIND OF PIECE IT IS, and that is not a fourth optional box.
//
// Measurements are chosen by category (lib/seller/measurements.ts). A dress is asked for a waist,
// a bag for a strap drop, a piece with no category for a length and a width and nothing else. Every
// piece this screen has ever made arrived in Drafts with `category` either empty or holding a typed
// word the templates don't know, so finishing one later offered the generic pair no matter what it
// was. The fix belongs HERE rather than in the editor: the piece is in her hands at this moment and
// she will never again be as sure what it is.
//
// It asks; it does not block. The ask is the tender button opening the picker instead of listing,
// once, with the tender remembered, so answering costs one tap and carries straight on into the
// sale. "Not sure" is one of the answers, because a queue at a stall beats a taxonomy.

export default function QuickList() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [photo, setPhoto] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [brand, setBrand] = useState("");
  // "" = not answered yet, "skip" = answered "not sure". The two are different: one is a question
  // still to ask, the other is an answer, and only the first one stops a tender button.
  const [category, setCategory] = useState("");
  const [askCategory, setAskCategory] = useState(false);
  /** The tender she reached for while the category was still unanswered, resumed once it is. */
  const [pending, setPending] = useState<"card" | "cash" | null | undefined>(undefined);
  const [busy, setBusy] = useState<"list" | "sell" | "card" | null>(null);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The hosted URL, once something has needed it, so a fill and a sale don't upload twice. */
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  async function snap() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setError("Camera access is off for VYA. Turn it on in Settings."); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]?.uri) { setPhoto(r.assets[0].uri); setPhotoUrl(null); }
  }

  /**
   * `chosen` is passed explicitly when the picker resumes a sale, and ONLY then. setState is not
   * synchronous: resuming on the state would read the empty category this call just set, decide the
   * question was still unanswered and open the picker again, forever.
   */
  async function submit(tender: "card" | "cash" | null, chosen: string = category) {
    setError(null);
    const n = Number(price.replace(/[^0-9.]/g, ""));
    if (!(n > 0)) { setError("Enter a price."); return; }
    // Ask once. Answering resumes this exact tender from the picker's onChange, so nothing is lost
    // and nothing is repeated, and once answered, every later piece goes straight through.
    if (!chosen) { setPending(tender); setAskCategory(true); return; }
    setBusy(tender === "cash" ? "sell" : tender === "card" ? "card" : "list");
    try {
      // Upload first: the route takes a hosted URL, not bytes.
      const imageUrl = photoUrl ?? (photo ? await uploadPhoto(photo).catch(() => null) : null);
      const r = await apiPost<{ ok: boolean; item: { id: string }; checkout: { id: string } | null }>("/api/store/market/quick-list/create", {
        // "Not sure" is stored as no category at all, never as the word. The storefront navigates
        // by these slugs and "skip" is not one of them.
        price: n, brand, category: chosen === "skip" ? "" : chosen, imageUrl,
        ...(tender === "cash" ? { startCheckout: "cash", clientKey: `phone-ql-${Date.now()}` } : {}),
      });
      void qc.invalidateQueries({ queryKey: ["store", "items"] });
      void qc.invalidateQueries({ queryKey: ["market", "home"] });

      if (tender === "cash" && r.checkout) {
        router.replace({ pathname: "/market/checkout/[id]", params: { id: r.checkout.id } });
        return;
      }
      if (tender === "card") {
        // Second call: the piece exists, now open a card checkout against it. The route refuses
        // with `payments_disabled` when Stripe isn't finished, and that message is worth showing
        // as-is. It names the fix.
        const co = await apiPost<{ ok: boolean; checkout: { id: string } }>("/api/store/market/checkout", {
          itemId: r.item.id,
          clientKey: `phone-card-${Date.now()}`,
          tender: "qr",
        });
        router.replace({ pathname: "/market/checkout/[id]", params: { id: co.checkout.id } });
        return;
      }
      router.back();
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "Couldn't list that.");
      setBusy(null);
    }
  }

  /**
   * FILL WITH AI, at the stall.
   *
   * Only brand and category, because they are the only two fields on this screen the AI has any
   * business with: the price is the whole reason she is standing here and it is hers. Both go
   * straight into the piece, so a quick list stops arriving in Drafts as an unbranded, uncategorised
   * square she has to finish from memory a week later.
   *
   * BLANKS ONLY, like everywhere else: a brand she has typed is not replaced. The upload is kept,
   * so filling and then selling costs one upload rather than two, which matters with a queue.
   */
  async function fillWithAI() {
    if (!photo) { setError("Take the photo first. It reads the photograph."); return; }
    setError(null);
    setFilling(true);
    try {
      const url = photoUrl ?? (await uploadPhoto(photo));
      setPhotoUrl(url);
      const { fields } = await draftListing([url], filledFields({ brand, category }));
      const { fields: next, filled } = fillDraftBlanks(fields, { brand, category });
      if (next.brand && !brand.trim()) setBrand(next.brand);
      // Only a slug the storefront actually navigates by. The model can answer with a word.
      if (next.category && !category && (CATEGORY_LABELS as Record<string, string>)[next.category]) setCategory(next.category);
      if (filled.length === 0) setError("Nothing it could read that you haven't already said.");
    } catch {
      setError("Couldn't read that photo. Fill it in yourself and carry on.");
    } finally {
      setFilling(false);
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, opts?: { numeric?: boolean; autoFocus?: boolean }) => (
    <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md }}>
      <Text style={{ width: 92, fontSize: 14, color: colors.textMuted }}>{label}</Text>
      <TextInput
        autoFocus={opts?.autoFocus}
        value={value}
        onChangeText={set}
        keyboardType={opts?.numeric ? "decimal-pad" : "default"}
        placeholder={opts?.numeric ? "0" : "optional"}
        placeholderTextColor={colors.textDim}
        style={{ flex: 1, fontSize: 16, color: colors.text, fontWeight: "600" }}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The market screen sets the bar light for its wine band; this screen is cream, so it
          must set it back. The bar is per-screen, and a light bar on cream is invisible. */}
      <StatusBar style="dark" />
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Pressable hitSlop={12} onPress={() => router.back()}><Text style={{ fontSize: 15, color: colors.accent, fontWeight: "600" }}>Back</Text></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: fonts.serif, fontSize: 18, color: colors.text }}>Quick list</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => void snap()} style={{ height: 120, borderRadius: 12, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} /> : <Text style={{ fontSize: 14, color: colors.textMuted }}>Add a photo (optional)</Text>}
        </Pressable>

        {/* Only once there is something to read. Offered before the photo it is a button that can
            only tell her off. */}
        {photo ? (
          <Pressable
            disabled={filling || busy !== null}
            onPress={() => void fillWithAI()}
            style={{ alignSelf: "flex-start", marginTop: spacing.sm, backgroundColor: colors.chip, borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, opacity: filling ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
              {filling ? "Reading…" : "Fill with AI"}
            </Text>
          </Pressable>
        ) : null}

        <View style={{ marginTop: spacing.lg }}>
          {field("Price", price, setPrice, { numeric: true, autoFocus: true })}
          {field("Brand", brand, setBrand)}
          {/* The taxonomy the storefront navigates by, grouped as its nav groups it, not a text
              box, because "bag", "Bags" and "handbag" are three different category pages and two
              of them are empty. */}
          <SelectRow
            label="Category"
            title="What kind of piece?"
            placeholder="Tap to choose"
            value={category || null}
            palette={colors}
            groups={[
              ...CATEGORY_GROUPS.map((g) => ({
                label: g.label,
                options: g.slugs.map((slug) => ({ key: slug, label: CATEGORY_LABELS[slug] })),
              })),
              { label: "", options: [{ key: "skip", label: "Not sure", hint: "Finish it from Drafts later" }] },
            ]}
            autoOpen={askCategory}
            onAutoOpened={() => setAskCategory(false)}
            onChange={(key) => {
              setCategory(key);
              // Straight on with whatever she reached for before the question. `undefined` means
              // she opened the picker herself and is not mid-sale.
              if (pending !== undefined) { const t = pending; setPending(undefined); void submit(t, key); }
            }}
          />
        </View>
        <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 }}>
          It decides which measurements the draft asks you for later. A dress is asked for a waist,
          a bag for its strap drop.
        </Text>

        {error ? <Text style={{ fontSize: 13.5, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

        {/* Card on its own, cash and "just list" sharing the row under it. The desktop's shape.
            The old buttons were two full-width slabs at 24pt of padding each, which ate the screen
            and made the least common action as loud as the most. */}
        <Pressable
          onPress={() => void submit("card")}
          disabled={busy !== null}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: spacing.lg, marginTop: spacing.xl, opacity: busy ? 0.6 : 1 }}
        >
          {busy === "card" ? <ActivityIndicator color={colors.accentText} /> : null}
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.accentText }}>Card</Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          <Pressable
            onPress={() => void submit("cash")}
            disabled={busy !== null}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.chip, borderRadius: 12, paddingVertical: spacing.md, opacity: busy ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{busy === "sell" ? "…" : "Cash"}</Text>
          </Pressable>
          <Pressable
            onPress={() => void submit(null)}
            disabled={busy !== null}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgAlt, borderRadius: 12, paddingVertical: spacing.md, opacity: busy ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{busy === "list" ? "…" : "Just list"}</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: spacing.md, lineHeight: 18 }}>
          It lands in Drafts with what you typed. Finish the details when the stall is quiet.
        </Text>
      </ScrollView>
    </View>
  );
}
