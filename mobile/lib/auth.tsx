import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { apiGet, apiPost, setAuthToken } from "./api";
import { devLogin, devLoginConfigured } from "./devAuth";
import type { User } from "./types";

// Sign-in state for the whole app.
//
// Two ways in, both recovered from the shipped build: an emailed magic link, and Google. Whichever
// is used, the API hands back a JWT which is the only credential the app keeps.
//
// WHERE THE TOKEN LIVES. SecureStore — the iOS keychain — not AsyncStorage. The token is a bearer
// credential for someone's account and their order history; AsyncStorage is a plaintext file in the
// app container.
//
// WHY `me` RUNS ON LAUNCH. /api/mobile/auth/me returns a freshly renewed token on every call, so
// calling it at startup both validates the stored token and extends it. A token that has actually
// expired fails here, once, quietly — instead of failing later as an unexplained empty feed.

const TOKEN_KEY = "vya.auth.token";

type AuthState = {
  user: User | null;
  token: string | null;
  /** The store this account administers, when the email matches a store contact. */
  storeSlug: string | null;
  /** True until the stored token has been read and checked — hold navigation until then. */
  loading: boolean;
  /** Development build with dev-login configured: the sign-in screen is bypassed. */
  devMode: boolean;
  requestMagicLink: (email: string) => Promise<void>;
  verifyMagicLink: (token: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Every path that changes the token goes through here, so the API client and the keychain can
  // never disagree with React state about who is signed in.
  const applyToken = useCallback(async (next: string | null, nextUser: User | null) => {
    setAuthToken(next);
    setTok(next);
    setUser(nextUser);
    if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!stored) {
          // Expo Go can't receive the emailed link (it isn't registered for the vya:// scheme), so
          // in development we mint a session directly instead of showing a form that cannot be
          // completed. Release builds never reach this — see lib/devAuth.ts.
          const dev = await devLogin();
          if (dev) {
            setStoreSlug(dev.storeSlug ?? null);
            await applyToken(dev.token, dev.user);
          }
          return;
        }
        setAuthToken(stored); // so the me() call below is authenticated
        const me = await apiGet<{ user: User; token: string; storeSlug: string | null }>("/api/mobile/auth/me");
        setStoreSlug(me.storeSlug ?? null);
        await applyToken(me.token, me.user);
      } catch {
        /* allow-swallow: an expired or revoked token is an ordinary way to arrive here, not an
           error to report. Clearing it drops the person on the sign-in screen, which is correct. */
        await applyToken(null, null);
      } finally {
        setLoading(false);
      }
    })();
  }, [applyToken]);

  const requestMagicLink = useCallback(async (email: string) => {
    // In development the API signs a token immediately rather than sending mail, so honour it if
    // it comes back — otherwise this just sends the email and the callback route finishes the job.
    const r = await apiPost<{ ok: boolean; token?: string; user?: User }>("/api/mobile/auth/magic-link/request", { email });
    if (r.token && r.user) await applyToken(r.token, r.user);
  }, [applyToken]);

  // BOTH sign-in paths must set storeSlug, not just the launch check above. It is what the app
  // routes a seller on, so leaving it null here would land a store owner in the shopper tabs and
  // only correct itself when they next relaunch.
  const verifyMagicLink = useCallback(async (linkToken: string) => {
    const r = await apiPost<{ token: string; user: User; storeSlug?: string | null }>("/api/mobile/auth/magic-link/verify", { token: linkToken });
    setStoreSlug(r.storeSlug ?? null);
    await applyToken(r.token, r.user);
  }, [applyToken]);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const r = await apiPost<{ token: string; user: User; storeSlug?: string | null }>("/api/mobile/auth/google", { idToken });
    setStoreSlug(r.storeSlug ?? null);
    await applyToken(r.token, r.user);
  }, [applyToken]);

  const signOut = useCallback(async () => {
    setStoreSlug(null);
    await applyToken(null, null);
  }, [applyToken]);

  // Surfaced so the sign-in screen can say why it's being skipped rather than flashing past.
  const devMode = devLoginConfigured();

  const value = useMemo<AuthState>(
    () => ({ user, token, storeSlug, loading, devMode, requestMagicLink, verifyMagicLink, signInWithGoogle, signOut }),
    [user, token, storeSlug, loading, devMode, requestMagicLink, verifyMagicLink, signInWithGoogle, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
