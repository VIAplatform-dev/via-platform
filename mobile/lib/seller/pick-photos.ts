import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";

// Getting photos onto a piece, from the two places they come from.
//
// "+ Add" opened the library and nothing else. On the one device she actually photographs stock
// with, the camera was unreachable, so a piece with no picture could only be fixed by leaving the
// app, shooting it in Camera, coming back, and finding it again in the roll.
//
// The camera goes FIRST in the sheet. A piece without a photo is almost always a piece sitting in
// front of her right now; the library is for the shoot she already did.

export type PickSource = "camera" | "library";

/** Ask which one. Resolves null if she dismisses. */
function askSource(): Promise<PickSource | null> {
  return new Promise((resolve) => {
    Alert.alert("Add photos", undefined, [
      { text: "Take a photo", onPress: () => resolve("camera") },
      { text: "Choose from library", onPress: () => resolve("library") },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

/**
 * Permission, asked once and explained when refused.
 *
 * A silent no-op after a denial is the worst outcome: the button looks broken and there is nothing
 * on screen saying the answer lives in Settings. `canAskAgain` is false once iOS has stopped
 * showing the system prompt, and that is the only case where sending her to Settings is the right
 * advice rather than a shrug.
 */
async function ensure(source: PickSource): Promise<boolean> {
  const res = source === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (res.granted) return true;

  const what = source === "camera" ? "the camera" : "your photos";
  if (res.canAskAgain) {
    Alert.alert("Permission needed", `VYA needs access to ${what} to add a picture.`);
    return false;
  }
  Alert.alert(
    "Permission needed",
    `VYA needs access to ${what} to add a picture. You can turn it on in Settings.`,
    [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => void Linking.openSettings() }],
  );
  return false;
}

/**
 * Photo URIs, from the camera or the library, capped at `remaining`.
 *
 * Returns [] for every ordinary "no". Dismissed the sheet, denied permission, cancelled the
 * picker, so a caller never has to tell those apart. It only throws if the picker itself breaks.
 *
 * The camera returns exactly one shot; iOS has no multi-capture. That is fine: she takes one,
 * it appears, she taps Add again. The library is where multi-select belongs.
 */
export async function pickPhotos(remaining: number): Promise<string[]> {
  if (remaining <= 0) return [];

  const source = await askSource();
  if (!source) return [];
  if (!(await ensure(source))) return [];

  const r = source === "camera"
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
      });

  if (r.canceled) return [];
  return r.assets.map((a) => a.uri).slice(0, remaining);
}

/** How many more a piece can take. Kept here so no screen invents its own arithmetic. */
export function remainingSlots(have: number, max: number): number {
  return Math.max(0, max - have);
}

/**
 * The same two sources, returned as data URLs instead of file URIs.
 *
 * Ask VYA sends photographs to the model inline, base64 in the request body, because there is
 * nowhere to upload an inspiration shot to: it is not a listing photo and it never becomes one.
 * `pickPhotos` above can't serve that, since a `file://` URI means nothing to an API on a server.
 *
 * QUALITY IS LOWER THAN A LISTING'S ON PURPOSE. A modern phone shot is 3-6MB, base64 adds a third
 * again, and the route's body is the whole conversation, every previous image included. 0.5 at
 * 1024px is plenty for "make my storefront feel like this" and keeps a four-image turn sendable.
 * Anything still over the cap is dropped rather than sent to be rejected.
 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function pickImageData(remaining: number): Promise<string[]> {
  if (remaining <= 0) return [];

  const source = await askSource();
  if (!source) return [];
  if (!(await ensure(source))) return [];

  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.5, base64: true };
  const r = source === "camera"
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: remaining });

  if (r.canceled) return [];
  return r.assets
    .slice(0, remaining)
    .map((a) => (a.base64 ? { data: a.base64, type: a.mimeType || "image/jpeg" } : null))
    .filter((a): a is { data: string; type: string } => !!a)
    // base64 is 4 characters per 3 bytes; compare decoded size against the cap.
    .filter((a) => (a.data.length * 3) / 4 <= MAX_IMAGE_BYTES)
    .map((a) => `data:${a.type};base64,${a.data}`);
}
