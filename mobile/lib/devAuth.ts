import type { User } from "./types";

// Signing in without the email round-trip, in development only.
//
// WHY THIS EXISTS. The magic link cannot complete in Expo Go: the emailed link opens Safari, and
// Expo Go is not registered for the `vya://` scheme, so the deep link never reaches the app. That is
// not a bug in the app — it is what Expo Go is. The web repo already carries the answer, and says so
// in its own docstring: POST /api/mobile/auth/dev-login mints a session for an email directly.
//
// Skipping the sign-in SCREEN is not enough on its own. Every route on the API — the "public" ones
// included — is behind the approval gate, and for the app a valid token IS the approval. An app that
// simply skipped login would show empty screens and 403s, which looks far more broken than a login
// form. So the bypass mints a real token; everything downstream then behaves exactly as it will in
// the real build.
//
// SAFETY. Three independent locks, because this route can mint a session for any email:
//   1. `__DEV__` — false in every release build, so the call is unreachable in anything shipped.
//   2. The credentials come from mobile/.env.local, which is gitignored and never present on an
//      EAS build machine, so they are `undefined` there and this returns null.
//   3. The route itself demands ADMIN_PASSWORD, so the secret alone is what gates it server-side.
//
// Never move these values into app.json — that file is committed, and EXPO_PUBLIC_* values are
// inlined into the bundle at build time.

const EMAIL = process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL;
const ADMIN = process.env.EXPO_PUBLIC_DEV_ADMIN_PASSWORD;

export function devLoginConfigured(): boolean {
  return Boolean(__DEV__ && EMAIL && ADMIN);
}

/** Mint a dev session, or null when this isn't a configured development build. */
export async function devLogin(): Promise<{ token: string; user: User; storeSlug: string | null } | null> {
  if (!devLoginConfigured()) return null;
  try {
    // The admin secret is the Authorization header here, NOT a user token — this is the one call in
    // the app that authenticates as the platform rather than as a person.
    const res = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://vyaplatform.com"}/api/mobile/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN}` },
      body: JSON.stringify({ email: EMAIL }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { token: string; user: User; storeSlug: string | null };
  } catch {
    /* allow-swallow: a dev convenience that fails should drop you on the sign-in screen, which
       still works — not take the app down. */
    return null;
  }
}
