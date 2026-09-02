> ## ⚠️ STOP — do not run `eas update` from this folder yet
>
> `via/mobile` is **not** the code behind the TestFlight build. A live EAS pipeline already exists
> and has been shipping OTA updates to testers; the last one landed 2026-06-29 with the message
> *"cart: resolve all items (fix dropped 2nd item) + robust auto-advance to checkout"*.
>
> This folder has no cart and no checkout. Publishing from here would push an older, smaller app
> over the working `production` branch, and every TestFlight tester would get a downgrade on next
> launch. Find the real source first — see "Where the real source is" below.

# Connecting the TestFlight build to this code

## What is actually going on

The TestFlight build came from **EAS, not Xcode** — I got this wrong at first. The Expo project
`@vyaplatform/vya` (ID `18c737a7-630a-43d4-90c8-b0f60b2277da`) has:

- iOS production builds from 2026-06-29 (build numbers 1 and 2, store distribution)
- An active `production` channel with a `production` branch at runtime version 1.0.0
- An OTA update published 2026-06-29: *"cart: resolve all items (fix dropped 2nd item) +
  robust auto-advance to checkout"*

So updates already reach TestFlight. The pipeline is not broken.

What is broken is that **the code in this repo is not that code.** Build 2 was made from commit
`735684a9c93df8c2f05fd0e08a2bd5a4dcbe07e5`, which exists in no local repo and not in
`VIAplatform-dev/via-platform` on GitHub. The update message describes a cart and an
auto-advancing checkout; nothing of the sort exists here.

## Where the real source is

Three copies of the mobile app exist locally, and none of them is it:

| copy | screens | expo-updates | eas.json | assets |
|---|---|---|---|---|
| `via/mobile` (this one) | tabs, product | added by me | added by me | copied in by me |
| `~/dev/via-app` | tabs, product | no | no | yes |
| iCloud `.../VIA/via-app` | tabs, product, auth, favorites, account, browse | no | no | yes |

None has a cart. The real source is most likely on the engineer's machine or in a separate
repository. That is the thing to find before anything is published.

EAS records the commit hash but not the repository URL, so it cannot be traced from the Expo side.

## What is already done

- `mobile/assets/` — the five icon files, so the app builds from a fresh clone
- `expo-updates ~29.0.20` in `package.json` (the version SDK 54 bundles)
- `runtimeVersion: { policy: "appVersion" }` in `app.json`
- `eas.json` with development / preview / production profiles
- `npm install` has been run, so `expo-updates@29.0.20` is in `node_modules`

Note that this repo lives at `~/dev/via` — not the iCloud folder a shell may open in. Use absolute
paths or the `cd` above.

## What has to be run with your account

These need an Expo login and the Apple account that owns the TestFlight build, so they are yours
to run, not mine.

`npm install` is already done. Use `npx eas-cli@latest` rather than a global install — a global
install writes to /usr/local and wants sudo, which is not worth granting for a CLI you run
occasionally.

```bash
cd ~/dev/via/mobile
npx eas-cli@latest login             # a VYA-owned Expo account, not a personal one
npx eas-cli@latest init              # creates the Expo project, writes extra.eas.projectId
npx eas-cli@latest update:configure  # writes updates.url
```

A new build is **not** required — the binary on TestFlight already has the updates runtime and is
listening on the `production` channel. Build only when native code changes.

```bash
cd ~/dev/via/mobile
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

From then on, shipping a JS change is:

```bash
npx eas-cli@latest update --branch production --message "what changed"
```

**Only once this folder is confirmed to be the real source.** Testers get it on next launch, no
App Review — which is exactly why publishing the wrong bundle is costly: it lands automatically on
everyone, and the only way back is to publish again or roll the branch back.

## Two things to know

**`runtimeVersion` is a safety catch, not red tape.** It is tied to `version` in `app.json` (1.0.0).
Bump that version and existing installs stop receiving updates until they install the new binary —
which is what you want, because a JS bundle expecting new native code would otherwise crash on
launch on an old build.

**Expo Go stays usable for day-to-day dev.** `expo-updates` is inert there, which is fine. Once the
app grows a native module Expo Go doesn't bundle, switch the team to a development build
(`npx eas-cli@latest build --profile development` + `expo-dev-client`) — same workflow, own binary.

## Housekeeping

`~/dev/via-app` and `via/mobile` are now two copies with the same slug (`vya`) and the same bundle
id (`com.vyaplatform.app`). That is exactly how this got confusing the first time. Once the build
above succeeds from `via/mobile`, `via-app` should be archived, not kept in sync.
