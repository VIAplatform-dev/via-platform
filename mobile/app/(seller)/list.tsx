import { useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { MAX_PHOTOS } from "../../lib/seller/listing-fields";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius } from "../../lib/portal-theme";
import { useDraft } from "../../lib/seller/draft";
import { uploadPhoto } from "../../lib/seller/intake";
import { PhotoGrid } from "../../components/seller/PhotoGrid";
import { PhotoViewer } from "../../components/seller/PhotoViewer";

// Capture: the first screen of the one flow that makes her money.
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
  const { photos, setPhotos, movePhoto, removePhoto, reset, setImageUrls } = useDraft();
  const [uploading, setUploading] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

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
    // 20, because that is what the routes store (items PATCH and intake/publish both cap there).
    // Six was a number this screen invented, and it meant a piece could carry more photos on the
    // web than the phone would let her pick, on the one device she actually shoots them with.
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
      quality: 0.85,
    });
    if (!r.canceled) setPhotos([...photos, ...r.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
  }

  /**
   * Leaving without listing THROWS THE PIECE AWAY.
   *
   * It used to keep everything. The draft is app-wide context (lib/seller/draft.tsx) and nothing
   * emptied it except a successful publish, so backing out of a half-shot piece meant the next
   * time she tapped + the old photographs were still sitting in the strip, waiting to be published
   * onto a completely different garment.
   *
   * IT ASKS FIRST, which is the one place this deliberately does not do what she described. A shot
   * from VYA's own camera is written to the app's cache, NOT to her camera roll, so discarding is
   * not "clear the screen", it is "delete eight photographs of a coat that is now back on the
   * rail". One tap to confirm is cheap; re-shooting a piece is not. Nothing to lose, nothing to
   * ask: an empty capture screen just closes.
   */
  function leave() {
    if (photos.length === 0) { router.back(); return; }
    Alert.alert(
      "Discard this piece?",
      `${photos.length} ${photos.length === 1 ? "photo" : "photos"} will be deleted. Photos taken here aren't saved to your camera roll.`,
      [
        { text: "Keep shooting", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => { reset(); router.back(); } },
      ],
    );
  }

  /**
   * Done: hosted photos, then the form. ONE form.
   *
   * There used to be a Details screen between these two, asking for a subset of the same fields the
   * form asks for again, and a full-screen Loading page after it. Three screens to list a piece,
   * two of them asking overlapping questions. The upload is the only thing that genuinely has to
   * happen before the form can do anything (intake takes URLs, not bytes), so it happens here,
   * against the photographs she is already looking at, with a count rather than a spinner.
   */
  async function done() {
    if (photos.length === 0 || uploading) return;
    try {
      const urls: string[] = [];
      for (const [i, p] of photos.entries()) {
        setUploading(`${i + 1} of ${photos.length}`);
        urls.push(await uploadPhoto(p));
      }
      setImageUrls(urls);
      router.push("/(seller)/new/review");
    } catch {
      Alert.alert("Couldn't upload those photos", "Check your connection and try again.");
    } finally {
      setUploading(null);
    }
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: "#141210" }} />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: "#141210", alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
        <StatusBar style="light" />
        <Text style={{ color: "#fff", fontSize: 16, textAlign: "center" }}>VYA needs the camera to photograph a piece.</Text>
        <Pressable onPress={() => void requestPermission()} style={{ marginTop: spacing.lg, backgroundColor: colors.accent, borderRadius: radius, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md }}>
          <Text style={{ color: colors.accentText, fontWeight: "600" }}>Allow camera</Text>
        </Pressable>
        {/* The library still works without the camera, never a dead end. */}
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
        <Pressable hitSlop={12} onPress={leave} accessibilityLabel="Close">
          <Feather name="x" size={24} color="#fff" />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", color: "#fff", fontSize: 15 }}>
          {photos.length === 0 ? "New piece" : `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
        </Text>
        <Pressable hitSlop={12} onPress={() => void pick()}>
          <Feather name="image" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* A rail's worth at once. Starts in the library, because that is where forty photos are.
          IT SAYS WHAT IT IS. This was a bare `layers` glyph. White on black, no label, wedged
          between the library icon and the edge, and listing a rail in one pass was a screen the
          app had built and nobody could find: the only door to it was an icon nothing named.
          Its own row under the header, because the words don't fit beside a centred title. */}
      <Pressable
        accessibilityLabel="List multiple items"
        onPress={() => router.push("/(seller)/new/bulk")}
        style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", paddingHorizontal: spacing.lg, paddingVertical: 6 }}
      >
        <Feather name="layers" size={15} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }} numberOfLines={1}>List multiple items</Text>
      </Pressable>

      {/* The frame */}
      <View style={{ flex: 1, marginHorizontal: spacing.lg, borderRadius: radius, overflow: "hidden" }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
        {/* Corner brackets. Something to fill, rather than a bare rectangle. */}
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
          Fill the frame: label and tag help
        </Text>
      </View>

      {/* The roll so far. Hold one to drag it somewhere else in the order, tap it to see it full
          size. It used to be a row of 52pt squares where a long press deleted one without asking,
          which is both the gesture every other app uses to PICK a photo up and an unlabelled way
          to lose a shot that is not in her camera roll. */}
      {photos.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <PhotoGrid photos={photos} onMove={movePhoto} onOpen={setViewing} cell={60} dark />
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
          disabled={photos.length === 0 || uploading !== null}
          onPress={() => void done()}
          style={{ width: 72, alignItems: "flex-end" }}
        >
          <Text style={{ color: photos.length ? "#fff" : "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: "600" }} numberOfLines={1}>
            {uploading ?? "Done"}
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
    </View>
  );
}
