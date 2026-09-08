import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost, ApiError } from "../../lib/api";
import { colors, spacing, fonts } from "../../lib/theme";
import { uploadPhoto } from "../../lib/seller/intake";

// Quick list — a piece that is on the table but not in the system.
//
// Same route as the desktop: POST /api/store/market/quick-list/create makes a draft with a price
// and, when asked, starts a cash checkout for it in the same call. The description, era and the
// rest can be filled in later from Drafts; at a stall the price is the only thing that cannot wait.

export default function QuickList() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [photo, setPhoto] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState<"list" | "sell" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function snap() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setError("Camera access is off for VYA — turn it on in Settings."); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]?.uri) setPhoto(r.assets[0].uri);
  }

  async function submit(startCheckout: boolean) {
    setError(null);
    const n = Number(price.replace(/[^0-9.]/g, ""));
    if (!(n > 0)) { setError("Enter a price."); return; }
    setBusy(startCheckout ? "sell" : "list");
    try {
      // Upload first: the route takes a hosted URL, not bytes.
      const imageUrl = photo ? await uploadPhoto(photo).catch(() => null) : null;
      const r = await apiPost<{ ok: boolean; item: { id: string }; checkout: { id: string } | null }>("/api/store/market/quick-list/create", {
        price: n, brand, category, imageUrl,
        ...(startCheckout ? { startCheckout: "cash", clientKey: `phone-ql-${Date.now()}` } : {}),
      });
      void qc.invalidateQueries({ queryKey: ["store", "items"] });
      void qc.invalidateQueries({ queryKey: ["market", "home"] });
      if (startCheckout && r.checkout) router.replace({ pathname: "/market/checkout/[id]", params: { id: r.checkout.id } });
      else router.back();
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "Couldn't list that.");
      setBusy(null);
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
        style={{ flex: 1, fontSize: 17, color: colors.text, fontWeight: "600" }}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The market screen sets the bar light for its wine band; this screen is cream, so it
          must set it back — the bar is per-screen, and a light bar on cream is invisible. */}
      <StatusBar style="dark" />
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Pressable hitSlop={12} onPress={() => router.back()}><Text style={{ fontSize: 15, color: colors.accent, fontWeight: "600" }}>Back</Text></Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: fonts.serif, fontSize: 18, color: colors.text }}>Quick list</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => void snap()} style={{ height: 180, borderRadius: 14, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} /> : <Text style={{ fontSize: 14, color: colors.textMuted }}>Add a photo (optional)</Text>}
        </Pressable>

        <View style={{ marginTop: spacing.lg }}>
          {field("Price", price, setPrice, { numeric: true, autoFocus: true })}
          {field("Brand", brand, setBrand)}
          {field("Category", category, setCategory)}
        </View>

        {error ? <Text style={{ fontSize: 13.5, color: colors.text, marginTop: spacing.md }}>{error}</Text> : null}

        <Pressable
          onPress={() => void submit(true)}
          disabled={busy !== null}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.accent, borderRadius: 16, paddingVertical: spacing.xl, marginTop: spacing.xl, opacity: busy ? 0.6 : 1 }}
        >
          {busy === "sell" ? <ActivityIndicator color={colors.accentText} /> : null}
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.accentText }}>List and sell for cash</Text>
        </Pressable>
        <Pressable
          onPress={() => void submit(false)}
          disabled={busy !== null}
          style={{ alignItems: "center", justifyContent: "center", backgroundColor: colors.chip, borderRadius: 16, paddingVertical: spacing.xl, marginTop: spacing.md, opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>{busy === "list" ? "Listing…" : "Just list it"}</Text>
        </Pressable>
        <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: spacing.md, lineHeight: 18 }}>
          It lands in Drafts with what you typed. Finish the details when the stall is quiet.
        </Text>
      </ScrollView>
    </View>
  );
}
