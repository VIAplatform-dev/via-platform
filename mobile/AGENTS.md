# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# @stripe/stripe-react-native is pinned ABOVE the SDK's version, on purpose

Expo SDK 54 pairs with 0.50.3. This app runs **0.76.0**, and `expo.install.exclude` in
package.json exists to stop `expo install --fix` quietly putting it back.

0.50.3 predates the Connect embedded components — `ConnectComponentsProvider`,
`ConnectAccountOnboarding`, `ConnectPayouts`. Those are what let a seller connect Stripe and
manage her bank account as NATIVE screens inside VYA instead of a browser sheet pointed at
vyaplatform.com, which is the one thing the seller app is not allowed to do. Downgrading does not
merely lose a feature; the imports stop resolving and the app will not build.

0.76.0's own devDependency on react-native is `^0.81`, which is exactly what this app runs.

`expo.install.exclude` is what keeps `expo-doctor` green on this; without it the mismatch shows up
as a permanent failing check, and a failing check nobody can fix is one everybody stops reading.

# The Stripe config plugin needs its props

In app.json the plugin is `["@stripe/stripe-react-native", { merchantIdentifier, enableGooglePay }]`,
never the bare string. 0.76.0's plugin destructures its props object, so a bare entry crashes
`expo config` with "Cannot read properties of undefined (reading 'merchantIdentifier')" — and with
it every prebuild and every EAS build, before any of our code is even read.

`merchantIdentifier` is deliberately empty: we do not offer Apple Pay, and the plugin only writes
the in-app-payments entitlement when the id is non-empty. Claiming an entitlement we never use is a
question at App Store review with no good answer.

# Expo Go runs everything EXCEPT the Stripe screens

Expo Go ships a fixed set of native modules and `@stripe/stripe-react-native` is not one of them, so
requiring it there throws. The Connect provider is mounted in `app/(seller)/_layout.tsx`, which means
an unguarded import takes down the whole seller app in Expo Go — every screen, not just the two that
use Stripe.

`lib/seller/stripe-native.ts` is the only place the module is loaded, behind a runtime check, with a
`require` rather than a static import (a static import is hoisted and would run before any check).
Payouts and Plan & billing read the components off it and say so when it is absent; everything else
is unaffected.

**Never add `import ... from "@stripe/stripe-react-native"` to a screen.** Import from
`stripe-native.ts` instead. `import type` is fine — types are erased.

# A web change to a shared surface is not done until the app matches

If a screen exists on both the web and here, changing it on the web means changing it here in the
same pass. Adding a button to market mode is exactly that. A section the app does not have at all —
cross-listing's own admin, the storefront editor — is a feature decision, not drift, and owes the
app nothing.

This cannot be automated: two packages, no shared component layer, and no test can notice that a
button appeared. What can be enforced is anything shaped like DATA. `lib/seller/listing-fields.ts`
holds the listing fields and the photo cap, checked against what the routes accept, and its test
fails when the phone falls behind. Extend that pattern whenever a list is duplicated across the two.
