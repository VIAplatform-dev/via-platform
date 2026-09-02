# VYA mobile

The VYA iOS app. Expo SDK 54, expo-router, TypeScript. It lives inside the website's repo at
`mobile/` and talks to the same backend over HTTPS — there is no shared code between them.

## Getting started

```bash
git clone https://github.com/VIAplatform-dev/via-platform.git
cd via-platform/mobile
npm install
npx expo start
```

Scan the QR with Expo Go. If your machine and phone are on different networks, use
`npx expo start --tunnel` instead — slower, but it does not care about the network.

### Signing in during development

**You cannot complete a magic link in Expo Go.** The emailed link opens Safari, and Expo Go is not
registered for the `vya://` scheme, so it never reaches the app.

The backend has a route for exactly this. Copy `.env.local.example` to `.env.local` and fill in the
admin password (ask Hana — it is `ADMIN_PASSWORD` from the web app's env):

```
EXPO_PUBLIC_DEV_LOGIN_EMAIL=you@example.com
EXPO_PUBLIC_DEV_ADMIN_PASSWORD=…
```

The app then mints a real session on launch and goes straight in. Three things keep this out of
anything shipped: `__DEV__` is false in release builds, `.env.local` is gitignored and never
present on an EAS build machine, and the route itself demands the admin secret. See `lib/devAuth.ts`.

Restart with `--clear` after changing env — Expo inlines these at bundle time.

## Where things are

```
app/                 expo-router routes; the file tree IS the navigation
  (tabs)/            the five-icon bar + the screens reachable from it
  product/[id]       the piece page
  store/[slug]       a store's own page
components/          shared UI (ProductCard, FilterSheet, AppHeader…)
lib/                 api client, auth, cart, favourites, filters, tracking
```

`lib/api.ts` is the only thing that talks to the backend. `app.json`'s `extra.apiBaseUrl` points at
production; override with `EXPO_PUBLIC_API_BASE_URL` in `.env.local` to point somewhere else.

## Things that will bite you

These are all real, all found the hard way, and none of them are obvious from the code.

**Every route is behind the approval gate.** Including the ones called `public`. For the app, a
valid login IS the approval — `isApprovedRequest` accepts any request carrying a verified Bearer
token. Omit it and the feed returns 403, not an empty list. `lib/api.ts` attaches it to everything.

**`POST /api/mobile/favorites` needs `favorited` sent explicitly.** The route reads
`body?.favorited === true`, so a request carrying only a `productId` means *unfavourite*. A toggle
that omits it can never add anything.

**Follows are keyed on the DEVICE, not the account,** and the route replaces the whole list rather
than toggling one store. Posting a single slug silently unfollows everything else. See `lib/follows.ts`.

**Store and collection images are site-relative** (`/stores/x.jpg`) because the web app serves them
from its own `/public`. A native `<Image>` has no origin to resolve that against and renders
nothing. Everything goes through `lib/imageUrl.ts`.

**Product descriptions are Shopify rich-text HTML.** Rendered as plain text the markup *is* the
description. `lib/html.ts` turns it back into paragraphs.

**`runtimeVersion` follows `version` in app.json.** Bump `version` and existing installs stop
receiving OTA updates until they install a new binary. That is deliberate — a JS bundle expecting
new native code would crash on an old build — but it is the thing that makes people think updates
are broken.

## Shipping

**JS-only changes** (screens, styling, logic) go out over the air, no App Review:

```bash
npx eas-cli@latest update --branch production --message "what changed"
```

Testers get it on next launch.

**Native changes** (a new native module, an SDK bump, an icon or name change) need a real build:

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

Two things about builds:

- The repo root has a `.easignore` that **whitelists** `mobile/` and excludes everything else.
  Without it EAS archives the whole website — the first attempt uploaded 664 MB, the second 2.1 GB
  (over the limit) because a build cache slipped in. `.easignore` REPLACES `.gitignore` rather than
  adding to it, so anything generated has to be named there.
- Submissions sit on Expo's **free-tier queue** and can take hours. The build itself is quick.

Keep dependencies on what the SDK expects — `npx expo install --check`. Drift is not cosmetic:
`react-native-worklets` is a native module Reanimated links against, and a version the SDK was not
built for is a runtime crash rather than a warning.

## Where this code came from

The original source was lost — it existed on one machine, was never pushed, and no backup had it.
What is here was rebuilt from the last EAS update published to the production channel: Hermes
bytecode gives up its string table, which yielded the exact route tree, every API path and the app's
own copy. Screenshots of the live app supplied the visual design.

`~/dev/via-mobile-recovered-2026-06-30/` on Hana's machine holds the recovered bundle, the extracted
strings and a `RECOVERY.md` describing what was found. Worth reading if something here looks
arbitrary — it probably came from the shipped app rather than from taste.

Which is also the reason for the one rule that matters: **push.**
