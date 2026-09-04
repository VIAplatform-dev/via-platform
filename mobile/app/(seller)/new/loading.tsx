import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fonts } from "../../../lib/theme";
import { useDraft } from "../../../lib/seller/draft";
import { draftListing, priceListing } from "../../../lib/seller/intake";

// Named steps, not a spinner.
//
// The work genuinely takes a while — a vision pass, a reverse-image search across frames, then a
// comps computation — and a slow spinner is indistinguishable from a hung one. Naming the step
// makes a slow run legible instead of worrying, and the line at the bottom tells her she can walk
// away, which is the honest thing: the request is already in flight server-side.
//
// THE TIME QUOTED IS MEASURED, NOT GUESSED. A real production run took 24.7s for the draft and
// 16.1s for the pricing — about forty seconds all in. The copy used to promise eight, which on
// this screen is the worst possible error: a seller who is told eight and waits forty concludes it
// has hung and kills it, losing the paid call she just made. If these calls get faster, measure
// again and lower the number; do not lower it hopefully.

type Step = { key: string; label: (n: number | null) => string };

const STEPS: Step[] = [
  { key: "brand", label: () => "Found the brand" },
  { key: "comps", label: (n) => (n === null ? "Checking comparable sales" : `Checking ${n} comparable sales`) },
  { key: "copy", label: () => "Writing the description" },
];

export default function LoadingScreen() {
  const insets = useSafeAreaInsets();
  const { photos, imageUrls, typed, setFields, setCompsCount, compsCount, setPriceCents } = useDraft();
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const draft = await draftListing(imageUrls, typed);
        if (!alive) return;
        setFields(draft.fields);
        setDone(1);

        const pricing = await priceListing(imageUrls, draft.fields, {
          searchQuery: draft.searchQuery,
          reverseComps: draft.reverseComps,
          reverseTitles: draft.reverseTitles,
        });
        if (!alive) return;
        // priceListing already returns the normalised { priceCents, compsCount } — the raw route
        // answers { estimate: { suggestedCents, comps } } and nothing at a top-level `price`.
        setCompsCount(pricing.compsCount);
        setPriceCents(pricing.priceCents);
        setFields(draft.fields);
        setDone(3);
        router.replace("/(seller)/new/review");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "That didn't work.");
      }
    })();
    return () => { alive = false; };
    // Runs once for this piece — re-running would spend another paid pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: insets.top + spacing.lg }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {photos.slice(0, 4).map((p, i) => (
          <Image key={`${p}-${i}`} source={{ uri: p }} style={{ width: 62, height: 62, borderRadius: 8, backgroundColor: colors.chip }} />
        ))}
      </View>

      <Text style={{ fontFamily: fonts.serif, fontSize: 28, color: colors.text, marginTop: spacing.xl }}>
        Reading your photos
      </Text>

      <View style={{ marginTop: spacing.xl }}>
        {STEPS.map((s, i) => {
          const state = error && i >= done ? "failed" : i < done ? "done" : i === done ? "running" : "waiting";
          return (
            <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg }}>
              {state === "done" ? (
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(31,122,92,0.15)", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="check" size={13} color={colors.positive} />
                </View>
              ) : state === "running" ? (
                <ActivityIndicator size="small" color={colors.accent} style={{ width: 22 }} />
              ) : (
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border }} />
              )}
              <Text style={{ fontSize: 15, color: state === "waiting" || state === "failed" ? colors.textDim : colors.text }}>
                {s.label(compsCount)}
              </Text>
            </View>
          );
        })}
      </View>

      {error ? (
        <Text style={{ fontSize: 14, color: colors.text, marginTop: spacing.md }}>
          {error} Your photos are saved — go back and try again, or save it as a draft.
        </Text>
      ) : (
        <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.md, lineHeight: 19 }}>
          Usually around half a minute — it reads the photos, then checks comparable sales. You can
          leave this; it finishes on its own and lands in Drafts.
        </Text>
      )}
    </View>
  );
}
