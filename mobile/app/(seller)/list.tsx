import { useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../lib/theme";
import { useDraft } from "../../lib/seller/draft";

// Capture — the first screen of the one flow that makes her money.
//
// A REAL VIEWFINDER, not a grey panel with a button under it. Dark ground so the garment is the
// only lit thing, corner brackets to frame against, and one line of guidance. Shots collect in a
// strip as she goes, because a piece needs four or five photos and the old screen implied one.
//
// She can also pull from the library: half of listing is photographing a rail at home and doing
// the typing later.

export default function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const { photos, setPhotos } = useDraft();

  async function shoot() {
    if (busy) return;
    setBusy(true);
    try {
      const shot = await camera.current?.takePictureAsync({ quality: 0.85 });
      if (shot?.uri) setPhotos([...photos, shot.uri]);
    } finally {
      setBusy(false);
    }
  }

  async function pick() {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.85,
    });
    if (!r.canceled) setPhotos([...photos, ...r.assets.map((a) => a.uri)].slice(0, 6));
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: "#141210" }} />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: "#141210", alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
        <StatusBar style="light" />
        <Text style={{ color: "#fff", fontSize: 16, textAlign: "center" }}>VYA needs the camera to photograph a piece.</Text>
        <Pressable onPress={() => void requestPermission()} style={{ marginTop: spacing.lg, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>Allow camera</Text>
        </Pressable>
        {/* The library still works without the camera — never a dead end. */}
        <Pressable onPress={() => void pick()} style={{ marginTop: spacing.md }}>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>Choose from library instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#141210", paddingTop: insets.top }}>
      {/* Dark ground, so the clock and battery need to be light to be legible at all. */}
      <StatusBar style="light" />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Feather name="x" size={24} color="#fff" />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", color: "#fff", fontSize: 15 }}>
          {photos.length === 0 ? "New piece" : `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
        </Text>
        <Pressable hitSlop={12} onPress={() => void pick()} style={{ marginRight: spacing.lg }}>
          <Feather name="image" size={22} color="#fff" />
        </Pressable>
        {/* A rail's worth at once. Starts in the library, because that is where forty photos are. */}
        <Pressable hitSlop={12} onPress={() => router.push("/(seller)/new/bulk")}>
          <Feather name="layers" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* The frame */}
      <View style={{ flex: 1, marginHorizontal: spacing.lg, borderRadius: 14, overflow: "hidden" }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
        {/* Corner brackets — something to fill, rather than a bare rectangle. */}
        {([["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]] as const).map(([v, h]) => (
          <View
            key={`${v}${h}`}
            pointerEvents="none"
            style={{
              position: "absolute", width: 26, height: 26,
              [v]: 14, [h]: 14,
              [`border${v === "top" ? "Top" : "Bottom"}Width`]: 2,
              [`border${h === "left" ? "Left" : "Right"}Width`]: 2,
              borderColor: "rgba(255,255,255,0.85)",
            }}
          />
        ))}
        <Text
          pointerEvents="none"
          style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.8)", fontSize: 13 }}
        >
          Fill the frame — label and tag help
        </Text>
      </View>

      {/* The strip */}
      {photos.length > 0 ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          {photos.map((p, i) => (
            <Pressable key={`${p}-${i}`} onLongPress={() => setPhotos(photos.filter((_, n) => n !== i))}>
              <Image source={{ uri: p }} style={{ width: 52, height: 52, borderRadius: 8 }} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Shutter */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, paddingBottom: insets.bottom + spacing.lg }}>
        <View style={{ width: 72 }} />
        <Pressable
          onPress={() => void shoot()}
          style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#fff", alignSelf: "center", marginHorizontal: "auto", opacity: busy ? 0.6 : 1 }}
        />
        <Pressable
          disabled={photos.length === 0}
          onPress={() => router.push("/(seller)/new/details")}
          style={{ width: 72, alignItems: "flex-end" }}
        >
          <Text style={{ color: photos.length ? "#fff" : "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: "600" }}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}
