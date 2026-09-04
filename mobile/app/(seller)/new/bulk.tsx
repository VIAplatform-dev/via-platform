import { useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiPost } from "../../../lib/api";
import { colors, spacing, fonts } from "../../../lib/theme";
import { uploadPhoto, publishListing, draftListing, priceListing } from "../../../lib/seller/intake";
import { rowReadiness, batchSummary, canPriceBatch, type BulkRow } from "../../../lib/seller/listing";

// Add many — a rail's worth of pieces in one pass.
//
// BRAND AND COST ARE EDITABLE PER ROW BEFORE ANYTHING RUNS. She knows what she bought, and typing
// it is faster than correcting a guess — forty brands into a list beats forty corrections. Those
// two fields are also exactly what the pricer wants most, so a row she fills gets a better number
// than one she doesn't.
//
// "Save drafts" lists everything with NO AI at all. That is the path that still works when the
// month's allowance is gone, and it is why it sits beside the primary button rather than hidden.

type Status = "idle" | "grouping" | "pricing" | "saving";

export default function BulkScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 40,
      quality: 0.85,
    });
    if (r.canceled) return;

    setError(null);
    setStatus("grouping");
    setPhotoCount(r.assets.length);
    try {
      // Upload first — grouping is done server-side on the hosted URLs.
      const urls: string[] = [];
      for (const a of r.assets) {
        urls.push(await uploadPhoto(a.uri));
        setProgress({ done: urls.length, total: r.assets.length });
      }
      // Cluster by visual similarity: the front/back/tag shots of one bag become one piece. Falls
      // back to one piece per photo when embeddings aren't configured, which is a fine start.
      const { groups } = await apiPost<{ groups: string[][] }>("/api/store/intake/bulk-group", { imageUrls: urls });
      setRows(groups.map((g, i) => ({ id: `g${i}`, photos: g, brand: "", cost: "" })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read those photos.");
    } finally {
      setStatus("idle");
      setProgress(null);
    }
  }

  const set = (id: string, k: "brand" | "cost", v: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)));

  /** Save every row as a draft with no AI call at all. */
  async function saveDrafts() {
    setError(null);
    setStatus("saving");
    try {
      for (const [i, r] of rows.entries()) {
        setProgress({ done: i, total: rows.length });
        await publishListing(
          { imageUrls: r.photos, title: r.brand ? `${r.brand} piece` : "Untitled piece", brand: r.brand },
          "draft",
        );
      }
      await qc.invalidateQueries({ queryKey: ["store", "items"] });
      router.dismissAll();
      router.replace("/(seller)/inventory");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save those drafts.");
    } finally {
      setStatus("idle");
      setProgress(null);
    }
  }

  /** Draft + price each row, then land them all in Drafts for review. */
  async function priceAll() {
    setError(null);
    setStatus("pricing");
    try {
      for (const [i, r] of rows.entries()) {
        setProgress({ done: i, total: rows.length });
        const filled = { brand: r.brand, cost: r.cost };
        const d = await draftListing(r.photos, filled);
        const p = await priceListing(r.photos, d.fields, {
          searchQuery: d.searchQuery, reverseComps: d.reverseComps, reverseTitles: d.reverseTitles,
        });
        await publishListing({ ...d.fields, price: p.price ?? d.fields.price, imageUrls: r.photos }, "draft");
      }
      await qc.invalidateQueries({ queryKey: ["store", "items"] });
      router.dismissAll();
      router.replace("/(seller)/inventory");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't price those.");
    } finally {
      setStatus("idle");
      setProgress(null);
    }
  }

  const busy = status !== "idle";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Text style={{ fontSize: 15, color: colors.text }}>Back</Text>
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 15, color: colors.text, fontWeight: "600" }}>Add many</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: spacing.md }}>
        {progress ? `${progress.done} of ${progress.total}…` : batchSummary(photoCount, rows.length)}
      </Text>

      {rows.length === 0 ? (
        <Pressable
          disabled={busy}
          onPress={() => void pick()}
          style={{ backgroundColor: colors.accent, borderRadius: 12, paddingVertical: spacing.xl, alignItems: "center", marginTop: spacing.xl }}
        >
          <Text style={{ color: colors.accentText, fontSize: 16, fontWeight: "600" }}>
            {status === "grouping" ? "Reading photos…" : "Choose photos"}
          </Text>
        </Pressable>
      ) : (
        <>
          <Text style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm }}>
            Fill in what you know
          </Text>

          {rows.map((r) => {
            const state = rowReadiness(r);
            return (
              <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                {r.photos[0] ? (
                  <Image source={{ uri: r.photos[0] }} style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: colors.chip }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: colors.chip }} />
                )}
                <TextInput
                  value={r.brand}
                  onChangeText={(v) => set(r.id, "brand", v)}
                  placeholder="Brand"
                  placeholderTextColor={colors.textDim}
                  style={{ width: 96, backgroundColor: colors.chip, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, fontSize: 13, color: colors.text }}
                />
                <TextInput
                  value={r.cost}
                  onChangeText={(v) => set(r.id, "cost", v)}
                  placeholder="Cost"
                  placeholderTextColor={colors.textDim}
                  keyboardType="numeric"
                  style={{ width: 64, backgroundColor: colors.chip, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, fontSize: 13, color: colors.text }}
                />
                <Text
                  style={{
                    flex: 1, textAlign: "right", fontSize: 13, fontWeight: "600",
                    color: state === "ready" ? colors.positive : state === "partial" ? colors.textMuted : colors.text,
                  }}
                >
                  {state === "ready" ? "Ready" : state === "partial" ? "Partial" : "Needs you"}
                </Text>
              </View>
            );
          })}

          {error ? <Text style={{ fontSize: 13, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xl }}>
            <Pressable
              disabled={busy || !canPriceBatch(rows)}
              onPress={() => void priceAll()}
              style={{ flex: 2, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center", opacity: canPriceBatch(rows) ? 1 : 0.5 }}
            >
              <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: "600" }}>
                {status === "pricing" ? "Pricing…" : `Price all ${rows.length}`}
              </Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => void saveDrafts()}
              style={{ flex: 1, backgroundColor: colors.chip, borderRadius: 10, paddingVertical: spacing.lg, alignItems: "center" }}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                {status === "saving" ? "Saving…" : "Save drafts"}
              </Text>
            </Pressable>
          </View>

          <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.md, textAlign: "center" }}>
            Save drafts lists everything with no AI at all.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
