import Constants from "expo-constants";

// The VYA API client.
//
// ONE THING MAKES THIS DIFFERENT from an ordinary fetch wrapper: every route on the API — including
// the ones named "public" — is behind the pilot approval gate (app/lib/approval.ts in the web repo).
// For the app, a valid login IS approval: `isApprovedRequest` accepts any request carrying a
// verified `Authorization: Bearer <jwt>`. So the token goes on EVERY request, not just the ones
// that are obviously per-user. Omit it and the feed comes back as a 403, not an empty list.

// EXPO_PUBLIC_API_BASE_URL first so a local web server can be pointed at from .env.local without
// editing committed config; app.json's extra.apiBaseUrl is the shipped default.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  "https://vyaplatform.com";

/** Set by the auth provider whenever the token changes. Module-level so plain fetch helpers can
 *  read it without every call site threading a token through. */
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

/** Thrown for any non-2xx. `needsAuth` is the case worth branching on: the caller should send the
 *  person to sign in rather than showing "something went wrong" over an empty screen. */
export class ApiError extends Error {
  status: number;
  needsAuth: boolean;
  constructor(status: number, path: string, message?: string) {
    super(message || `API ${status}: ${path}`);
    this.status = status;
    // 401 = no/expired token. 403 = the approval gate, which for the app means the same thing.
    this.needsAuth = status === 401 || status === 403;
  }
}

async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // The API sends { error } on failure; surfacing it beats a bare status code in the UI.
    const detail = await res.json().catch(() => null);
    throw new ApiError(res.status, path, detail?.error);
  }
  // 204 and friends have no body.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});
export const apiPatch = <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {});
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
