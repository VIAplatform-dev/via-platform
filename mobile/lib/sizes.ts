import AsyncStorage from "@react-native-async-storage/async-storage";

// The sizes someone actually wears, used to filter what they're shown.
//
// Kept on the device, which is what the shipped app told people in as many words: "Your sizes are
// saved on this device. Sign in to sync across devices (coming soon)." There is a server-side taste
// profile (/api/public/taste) that also holds sizes, but the app owned this locally and the two
// were never wired together — worth doing, but not silently, since it changes what people see.
//
// The groups mirror TASTE_SIZE_GROUPS in the web repo (app/lib/tasteVibes.ts). Keeping them
// identical matters: a size the API doesn't recognise filters everything out rather than nothing.

export const SIZE_GROUPS: { label: string; options: string[] }[] = [
  { label: "Clothing", options: ["XS", "S", "M", "L", "XL", "XXL", "One Size"] },
  { label: "Numeric", options: ["0", "2", "4", "6", "8", "10", "12", "14", "16"] },
  { label: "Shoes (US)", options: ["5", "6", "7", "8", "9", "10", "11", "12"] },
];

const KEY = "vya.sizes.v1";

export async function loadSizes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    /* allow-swallow: no saved sizes is the ordinary first-run state, not a failure. */
    return [];
  }
}

export async function saveSizes(sizes: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(sizes));
  } catch {
    /* allow-swallow: a failed write costs a preference, not the session. */
  }
}
