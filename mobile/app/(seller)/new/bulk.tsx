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
import { splitCostAcross, batchCostLine } from "../../../lib/seller/cost-split";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../lib/api";

// Add many — a rail's worth of pieces in one pass.
//
// BRAND AND COST ARE EDITABLE PER ROW BEFORE ANYTHING RUNS. She knows what she bought, and typing
// it is faster than correcting a guess — forty brands into a list beats forty corrections. Those
// two fields are also exactly what the pricer wants most, so a row she fills gets a better number
// than one she doesn't.
//
// "Save drafts" lists everything with NO AI at all. That is the path that still works when the
// month's allowance is gone, and it is why it sits beside the primary button rather than hidden.
//
// THE BATCH IS A LOT. Where these came from and when is one answer for the whole rail, not forty;
// and "these 12 cost £340" is how she actually bought them. The total is split equally across the
// rows (prices aren't known yet at this point) with the same remainder rule as the server, and a
// cost she typed on a row wins over its share.

type Status = "idle" | "grouping" | "pricing" | "saving";

export default function BulkScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Batch-level: one price for all of them, divided at publish.
  const [lotTotal, setLotTotal] = useState("");
  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me") });
  const currency = me.data?.currency ?? "USD";

  /** What each row carries at publish: its cost — typed on the row, or its share of the batch. */
  function batchCosts(): Record<string, { cost?: number }> {
    const totalCents = lotTotal.trim() ? Math.round(Number(lotTotal.replace(/[^0-9.]/g, "")) * 100) : 0;
    const share = totalCents > 0 ? splitCostAcross(totalCents, rows.map((r) => r.id)) : {};
    const out: Record<string, { cost?: number }> = {};
    for (const r of rows) {
      const typed = r.cost.trim() ? Number(r.cost.replace(/[^0-9.]/g, "")) : NaN;
      const cost = Number.isFinite(typed) && typed >= 0 ? typed : share[r.id] != null ? share[r.id] / 100 : undefined;
      out[r.id] = cost !== undefined ? { cost } : {};
    }
    return out;
  }

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
      const lot = batchCosts();
      for (const [i, r] of rows.entries()) {
        setProgress({ done: i, total: rows.length });
        await publishListing(
          { imageUrls: r.photos, title: r.brand ? `${r.brand} piece` : "Untitled piece", brand: r.brand, ...lot[r.id] },
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
      const lot = batchCosts();
      for (const [i, r] of rows.entries()) {
        setProgress({ done: i, total: rows.length });
        const filled = { brand: r.brand, cost: r.cost };
        const d = await draftListing(r.photos, filled);
        const p = await priceListing(r.photos, d.fields, {
          searchQuery: d.searchQuery, reverseComps: d.reverseComps, reverseTitles: d.reverseTitles,
        });
        // The drafted fields never carried the cost she typed — it reached the pricer and stopped
        // there. The lot fields put it (or its share of the batch) on the piece itself.
        await publishListing({ ...d.fields, priceCents: p.priceCents, imageUrls: r.photos, ...lot[r.id] }, "draft");
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

          {/* The batch: one price for all of them. */}
          <View style={{ backgroundColor: colors.chip, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm }}>
              <Text style={{ width: 128, fontSize: 13, color: colors.textMuted }}>These {rows.length} cost</Text>
              <TextInput value={lotTotal} onChangeText={setLotTotal} placeholder="total, e.g. 340" placeholderTextColor={colors.textDim} keyboardType="decimal-pad" style={{ flex: 1, fontSize: 14, color: colors.text, fontWeight: "600" }} />
            </View>
            {batchCostLine(rows.length, Math.round(Number(lotTotal.replace(/[^0-9.]/g, "")) * 100) || 0, currency) ? (
              <Text style={{ fontSize: 12, color: colors.textDim, marginTop: spacing.xs }}>
                {batchCostLine(rows.length, Math.round(Number(lotTotal.replace(/[^0-9.]/g, "")) * 100) || 0, currency)} — a cost typed on a row wins.
              </Text>
            ) : null}
          </View>

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
