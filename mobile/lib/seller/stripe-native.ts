import Constants, { ExecutionEnvironment } from "expo-constants";

// Whether Stripe's native module is actually in this binary.
//
// EXPO GO CANNOT LOAD IT. Expo Go ships a fixed set of native modules; @stripe/stripe-react-native
// is a third-party one and is not among them, so requiring it there throws. That matters far more
// than it sounds: the Connect provider is mounted in app/(seller)/_layout.tsx, so an unguarded
// import took down the ENTIRE seller app in Expo Go — every screen, not just the two that use it.
//
// Guarded, Expo Go runs everything else: inventory, the piece editor, returns, shipping, tax,
// consignors, discounts, customers, orders. Only Stripe's own surfaces say they need the real app,
// which is a fair trade for being able to test the other twenty screens without waiting on a build.
//
// The require is deliberately NOT a static import — a static one is hoisted and runs before any
// check we could make. `stripeNative` is resolved once, at module load, so component identity is
// stable across renders and there is no conditional-hook problem downstream.

export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type StripeModule = typeof import("@stripe/stripe-react-native");

let mod: StripeModule | null = null;
if (!inExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@stripe/stripe-react-native") as StripeModule;
  } catch {
    // A dev build that predates the dependency. Same handling as Expo Go: say so, don't crash.
    mod = null;
  }
}

export const stripeNative = mod;
export const stripeAvailable = mod !== null;

/** What to tell her when a Stripe screen cannot run here. Names the reason, not just the symptom. */
export const STRIPE_UNAVAILABLE = inExpoGo
  ? "Stripe's screens need the full VYA app — they can't run in Expo Go. Everything else here works."
  : "This build doesn't include Stripe yet. It'll be there in the next one.";
