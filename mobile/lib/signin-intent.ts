// What a sign-in was FOR, and where it should land.
//
// WHY INTENT HAS TO BE REMEMBERED. The link arrives by email, so the tap that starts a sign-in and
// the tap that finishes it are minutes apart and may be in a different app. By the time the callback
// runs, nothing on screen remembers which button was pressed, and "Sign in as a store" followed by
// the shopper marketplace, with no word about why, is the failure this exists to stop.
//
// The destination itself is decided here, in one tested function, rather than inline in the callback.

export type SignInIntent = "shop" | "store";

export type Destination =
 | { route: "/(seller)" }
 | { route: "/(tabs)" }
 | { route: "/auth/no-store"; email: string | null };

/**
 * Where to land after the emailed link is exchanged.
 *
 * `slug` is the store the address belongs to, as the server resolved it. Null for an address with
 * no shop.
 *
 * A STORE SIGN-IN THAT FINDS NO SHOP DOES NOT SILENTLY BECOME A SHOPPER SIGN-IN. She is signed in
 * either way (the session is real), but she asked for her shop and she is owed a sentence about why
 * she has not got it. Dropping her in the marketplace instead is what made this look broken.
 */
export function destinationFor(slug: string | null | undefined, intent: SignInIntent | null, email?: string | null): Destination {
 if (slug) return { route: "/(seller)" };
 if (intent === "store") return { route: "/auth/no-store", email: email ?? null };
 return { route: "/(tabs)" };
}

// ── Remembering it across the email hop ──────────────────────────────────────────────────────────
// AsyncStorage, not SecureStore: this is a breadcrumb, not a secret, and it has to survive the app
// being backgrounded while she goes to her mail.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "vya-signin-intent";

/** Stamped, and only honoured for an hour. A link opened days later should not still be steering. */
export async function rememberIntent(intent: SignInIntent): Promise<void> {
 try { await AsyncStorage.setItem(KEY, JSON.stringify({ intent, at: Date.now() })); } catch { /* not worth failing a sign-in over */ }
}

/** What she asked for, once. Cleared on read so a later sign-in starts clean. */
export async function takeIntent(): Promise<SignInIntent | null> {
 try {
  const raw = await AsyncStorage.getItem(KEY);
  await AsyncStorage.removeItem(KEY);
  if (!raw) return null;
  const p = JSON.parse(raw) as { intent?: SignInIntent; at?: number };
  if (!p?.intent || !p.at || Date.now() - p.at > 3600000) return null;
  return p.intent;
 } catch { return null; }
}
