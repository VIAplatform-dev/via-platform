import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiPost } from "./api";

// Push registration for a seller's phone.
//
// Runs once a store account is signed in (lib/auth.tsx) and again when the Notifications screen
// opens. Idempotent: the server keeps (store, token) unique, so re-registering the same phone is
// a no-op there. Three outcomes, and the screen says which:
//   registered   — a token was minted and sent; a sale or a message will buzz this phone
//   denied       — she said no to the OS prompt; iOS/Android Settings is the only way back
//   unavailable  — this build cannot mint a token. Expo Go dropped remote push in SDK 53, so a
//                  development session lands here every time; a store build never should.
// Degrades silently: nothing here throws, and nothing here blocks sign-in.

export type PushStatus = "registered" | "denied" | "unavailable";

let last: PushStatus | null = null;

/** What the most recent registration attempt found, for a screen that mounts after it ran. */
export function lastPushStatus(): PushStatus | null {
  return last;
}

export async function registerForPush(): Promise<PushStatus> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return (last = "denied");

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return (last = "unavailable");
    await apiPost("/api/mobile/push-token", { token, platform: Platform.OS });
    return (last = "registered");
  } catch {
    /* allow-swallow: an Expo Go session, a simulator, or a network blip — push is a courtesy */
    return (last = "unavailable");
  }
}
