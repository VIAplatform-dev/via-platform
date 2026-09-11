import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { StripeConnectInstance } from "@stripe/stripe-react-native";
import { apiPost } from "../api";
import { colors } from "../theme";
import { stripeNative, stripeAvailable, STRIPE_UNAVAILABLE } from "./stripe-native";

// Stripe's own screens, rendered natively inside VYA rather than in a browser.
//
// WHY THIS REPLACED A BROWSER SHEET. Stripe's identity check cannot be rebuilt — it collects a legal
// name, an ID document and a bank account under Stripe's licence. But it does not have to be a trip
// to a WEBSITE: Connect embedded components render as real native views, themed to VYA, inside our
// own navigation. The seller sees a VYA screen asking Stripe's questions, not vyaplatform.com in a
// browser with an address bar.
//
// ONE HONEST CAVEAT. These are Express accounts, which means Stripe — not VYA — is responsible for
// collecting requirements, and Stripe requires the account holder to sign in to Stripe once during
// onboarding. Stripe presents that single sign-in step in a WebView it controls and explicitly does
// not allow to be replaced. It is Stripe's page, branded with our name and colour from the Connect
// settings, and it is the only part of any of this that is not ours. Everything around it is native.
//
// The client secret is minted by /api/store/payments/account-session, which already existed for the
// web's embedded components — the phone reuses it exactly, including the publishable key, so there
// is no second copy of the Stripe key living in the app bundle to go stale.
//
// See stripe-native.ts for why none of this is a static import.

type Ready = {
  instance: StripeConnectInstance | null;
  error: string | null;
  loading: boolean;
  /** True when the native module isn't in this binary at all (Expo Go). Not an error — a fact. */
  unavailable: boolean;
};

const Ctx = createContext<Ready>({ instance: null, error: null, loading: false, unavailable: !stripeAvailable });

export function useConnect(): Ready {
  return useContext(Ctx);
}

export function SellerConnectProvider({ children }: { children: ReactNode }) {
  // No native module, nothing to provide — and crucially, nothing to crash. The seller app renders
  // in full; the two screens that need Stripe check `unavailable` and say so.
  if (!stripeAvailable) return <Ctx.Provider value={UNAVAILABLE}>{children}</Ctx.Provider>;
  return <LiveConnectProvider>{children}</LiveConnectProvider>;
}

const UNAVAILABLE: Ready = { instance: null, error: null, loading: false, unavailable: true };

function LiveConnectProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The FIRST call does two jobs: it hands back a client secret, and it tells us the publishable key
  // to initialise with. Stripe wants the key up front and the secret lazily, so the key is captured
  // from the first response and the instance is built once it arrives.
  const fetchClientSecret = useMemo(
    () => async (): Promise<string> => {
      const r = await apiPost<{ clientSecret: string; publishableKey: string }>("/api/store/payments/account-session", {});
      if (r?.publishableKey) setPublishableKey(r.publishableKey);
      if (!r?.clientSecret) throw new Error("Stripe didn't return a session.");
      return r.clientSecret;
    },
    [],
  );

  const [instance, setInstance] = useState<StripeConnectInstance | null>(null);

  // Kick off exactly one priming call, so the key is known before any component mounts.
  //
  // useEffect, NOT useMemo: this mints a Stripe session, which is a side effect with a cost. React is
  // free to run a useMemo body twice (StrictMode does exactly that in development), and two account
  // sessions per app launch is two more than anyone wants.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiPost<{ clientSecret: string; publishableKey: string }>("/api/store/payments/account-session", {})
      .then((r) => {
        if (!alive) return;
        if (!r?.publishableKey) throw new Error("Stripe isn't configured on the server.");
        setPublishableKey(r.publishableKey);
        setInstance(
          stripeNative!.loadConnectAndInitialize({
            publishableKey: r.publishableKey,
            fetchClientSecret,
            // Stripe's screens in VYA's colours rather than Stripe purple. This is the whole point of
            // embedded components over a hosted page.
            appearance: {
              variables: {
                colorPrimary: colors.accent,
                colorBackground: colors.bg,
                colorText: colors.text,
                buttonPrimaryColorBackground: colors.accent,
                buttonPrimaryColorText: colors.accentText,
              },
            },
          }),
        );
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't reach Stripe.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // Once per mount of the seller area. A second call would mint a second session for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Ready>(() => ({ instance, error, loading, unavailable: false }), [instance, error, loading]);

  // Until the key is known there is no provider to give — children still render, and any screen that
  // needs a component checks `instance` first. Nothing here should be able to blank a screen that
  // does not use Stripe at all.
  if (!instance || !publishableKey) return <Ctx.Provider value={value}>{children}</Ctx.Provider>;

  const ConnectComponentsProvider = stripeNative!.ConnectComponentsProvider;
  return (
    <Ctx.Provider value={value}>
      <ConnectComponentsProvider connectInstance={instance}>{children}</ConnectComponentsProvider>
    </Ctx.Provider>
  );
}

export { STRIPE_UNAVAILABLE };
