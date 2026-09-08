import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { colors, spacing, fonts } from "../../lib/theme";
import { formatMoney } from "../../lib/seller/home";
import { reservedWord } from "../../lib/seller/inventory";

// Find item — point the phone at the piece in the buyer's hand.
//
// Same route as the desktop's camera panel: POST /api/store/market/match with a JPEG data URL,
// which answers ranked candidates from the store's own inventory with their live status. A sold
// piece can still come back at the top ("looks like X — sold") but is never sellable from here.
// Tapping a candidate starts a cash checkout through /api/store/market/checkout — the one path.

type Candidate = { score: number; item: { id: string; title: string; priceCents: number; currency: string; status: string; images?: string[]; image?: string | null } };
type Match = { level: "high" | "medium" | "none"; candidates: Candidate[]; notConfigured?: boolean; unindexed?: boolean };

const SELLABLE = new Set(["active", "draft", "reserved"]);

export default function FindItem() {
  const insets = useSafeAreaInsets();
  const { storeSlug } = useAuth();
  const [shot, setShot] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState<"matching" | "starting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = useQuery({ queryKey: ["store", "me"], queryFn: () => apiGet<{ currency: string }>("/api/store/me"), enabled: !!storeSlug });
  const currency = me.data?.currency ?? "USD";
  // "on hold" is a person; "reserved" is a buyer mid-checkout — the same words as Inventory.
  const holds = useQuery({ queryKey: ["store", "holds"], queryFn: () => apiGet<{ holds: { itemId: string }[] }>("/api/store/holds"), enabled: !!storeSlug });
  const held = new Set((holds.data?.holds ?? []).map((h) => h.itemId));

  async function snap() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setError("Camera access is off for VYA — turn it on in Settings."); return; }
    // Quality and size are capped so the data URL stays under the route's ~2 MB limit.
    const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, allowsEditing: false });
    if (r.canceled || !r.assets[0]?.base64) return;
    setShot(r.assets[0].uri);
    setMatch(null);
    setBusy("matching");
    try {
      const m = await apiPost<Match>("/api/store/market/match", { image: `data:image/jpeg;base64,${r.assets[0].base64}` });
      setMatch(m);
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "Couldn't read that photo — try again with more light.");
    } finally {
      setBusy(null);
    }
  }

  async function sell(c: Candidate) {
    setError(null);
    setBusy("starting");
    try {
      const r = await apiPost<{ ok: boolean; checkout: { id: string; amountCents: number } }>("/api/store/market/checkout", {
        itemId: c.item.id, tender: "cash", clientKey: `phone-${c.item.id}-${Date.now()}`,
      });
      router.replace({ pathname: "/market/checkout/[id]", params: { id: r.checkout.id } });
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "Couldn't start that sale.");
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The market screen sets the bar light for its wine band; this screen is cream, so it
          must set it back — the bar is per-screen, and a light bar on cream is invisible. */}
      <StatusBar style="dark" />
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Pressable hitSlop={12} onPress={() => router.back()}><Text style={{ fontSize: 15, color: colors.accent, fontWeight: "600" }}>Back</Text></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: fonts.serif, fontSize: 18, color: colors.text }}>Find item</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        {shot ? (
          <Image source={{ uri: shot }} style={{ width: "100%", height: 260, borderRadius: 14, backgroundColor: colors.chip }} />
        ) : (
          <Text style={{ fontSize: 15, color: colors.textMuted, lineHeight: 22 }}>
            Take a photo of the piece the buyer is holding. It is matched against your own inventory, so the price and whether it is still for sale come back together.
          </Text>
        )}

        <Pressable
          onPress={() => void snap()}
          disabled={busy !== null}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.accent, borderRadius: 16, paddingVertical: spacing.xl, marginTop: spacing.lg, opacity: busy ? 0.6 : 1 }}
        >
          {busy === "matching" ? <ActivityIndicator color={colors.accentText} /> : null}
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.accentText }}>{busy === "matching" ? "Looking…" : shot ? "Take another" : "Take a photo"}</Text>
        </Pressable>

        {error ? <Text style={{ fontSize: 13.5, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

        {match ? (
          <View style={{ marginTop: spacing.xl }}>
            {match.notConfigured || match.unindexed ? (
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Photo matching isn&apos;t set up for this store yet — search by name on Inventory instead.</Text>
            ) : match.candidates.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Nothing in your inventory looks like this. Quick-list it if it is new.</Text>
            ) : (
              <>
                <Text style={{ fontSize: 11, letterSpacing: 1.4, color: colors.textDim, fontWeight: "700", marginBottom: spacing.sm }}>
                  {match.level === "high" ? "WE FOUND IT" : "CLOSEST MATCHES"}
                </Text>
                {match.candidates.map((c) => {
                  const img = c.item.images?.[0] ?? c.item.image ?? null;
                  const sellable = SELLABLE.has(c.item.status);
                  return (
                    <Pressable
                      key={c.item.id}
                      disabled={!sellable || busy !== null}
                      onPress={() => void sell(c)}
                      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: sellable ? 1 : 0.5 }}
                    >
                      {img ? <Image source={{ uri: img }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.chip }} /> : <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.chip }} />}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{c.item.title}</Text>
                        <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                          {formatMoney(c.item.priceCents, c.item.currency || currency)} · {reservedWord(c.item.status, held.has(c.item.id)) ?? c.item.status}
                        </Text>
                      </View>
                      {sellable ? <Text style={{ fontSize: 14, fontWeight: "700", color: colors.accent }}>Sell ›</Text> : null}
                    </Pressable>
                  );
                })}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
