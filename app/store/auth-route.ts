// Where a seller goes after signing in.
//
// The answer isn't knowable on the client — it depends on whether this email already has a store —
// so it's one question to the server, asked in exactly one place. Both the sign-in page (for a
// seller who is ALREADY signed in and shouldn't be shown a form) and /store/continue (for one who
// just signed in) call this. That's why signing up a second time doesn't push an existing seller
// back through onboarding, and why "sign in" still reaches the wizard for someone who created an
// account but never finished setting up.

export type StoreWhoAmI = { admin?: boolean; slug?: string; needsOnboarding?: boolean; dev?: boolean };

export const STORE_LOGIN = "/store/login";
export const STORE_SIGNUP = "/store/signup";
export const STORE_ONBOARDING = "/admin/onboarding";
export const STORE_WORKSPACE = "/admin/home";

/**
 * A `?next=` is only honoured when it's a path on this site.
 *
 * It arrives in the URL, where anyone can put anything, so an absolute URL or a protocol-relative
 * "//somewhere-else" would turn our own sign-in page into an open redirect that carries a
 * freshly-authenticated seller off to someone else's.
 */
export function safeNext(next: string | null | undefined): string | null {
 const v = (next || "").trim();
 if (!v.startsWith("/") || v.startsWith("//")) return null;
 return v;
}

/** Build a sign-in URL that comes back to where the seller was headed. */
export function loginHref(next?: string | null, mode: "login" | "signup" = "login"): string {
 const base = mode === "signup" ? STORE_SIGNUP : STORE_LOGIN;
 const n = safeNext(next);
 return n ? `${base}?next=${encodeURIComponent(n)}` : base;
}

/**
 * Ask the server who this is, and answer with where to send them.
 *
 * `retryOn401` is for the moment immediately after an OAuth or magic-link callback, where the
 * session cookie is occasionally not readable on the very first request. Bouncing back to the
 * sign-in page there would read as the sign-in having silently failed, which is the one thing this
 * flow must never do.
 */
export async function destinationAfterAuth(next?: string | null, retryOn401 = false): Promise<string> {
 const attempts = retryOn401 ? 3 : 1;
 for (let i = 0; i < attempts; i++) {
  if (i) await new Promise((r) => setTimeout(r, 700));
  const res = await fetch("/api/infrastructure/whoami", { cache: "no-store" }).catch(() => null);
  if (!res || res.status === 401) continue;
  const who: StoreWhoAmI = await res.json().catch(() => ({}) as StoreWhoAmI);
  // On `next dev`, whoami answers "owner" from NODE_ENV alone, with no session behind it. The proxy
  // does not honour that shortcut, so acting on it here means redirecting into the workspace, being
  // redirected straight back, and doing it again — a reload loop on the sign-in page. A shortcut
  // identity is not a sign-in: show the form, and let a real one replace it.
  if (who.dev) return STORE_LOGIN;
  // Signed in with no store yet → the wizard, and NOT wherever they were originally headed.
  // Setting the shop up comes first; `next` would drop them into an empty workspace.
  if (who.needsOnboarding) return STORE_ONBOARDING;
  if (who.slug || who.admin) return safeNext(next) || STORE_WORKSPACE;
 }
 return STORE_LOGIN;
}
