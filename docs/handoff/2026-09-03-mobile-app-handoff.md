# VYA mobile — handoff, 3 September 2026

Branch `app-changes`. **Nothing from this session is committed.** Run `git status` before anything
destructive.

Full version with the seller design written out screen by screen:
https://claude.ai/code/artifact/eacd3a56-d59c-404e-af1a-f53bc5bb6805

---

## 1. What is built

| Thing | State | Where |
|---|---|---|
| Launch / sign-in screen | done | `mobile/app/auth/login.ios.tsx` |
| Photo collage (7 images) | done | `mobile/assets/collage/01–07.jpg` |
| Seller gate screen | written, **not wired** | `mobile/app/become-a-store.tsx` |
| Babel config | done — critical | `mobile/babel.config.js` |
| Native iOS build | installed | `com.vyaplatform.app` |
| Seller tabs / Home / Inventory | not started | — |

### The launch screen
Two columns of photographs drifting in opposite directions behind the wordmark, headline, email
field and two buttons (*Join as a customer*, *Get started as a store*). Reanimated, 48s linear, no
easing — an eased loop pulses.

Three decisions to preserve:

- **The columns share no photographs.** Left draws 01/04/05/07, right 02/03/06. The only arrangement
  that guarantees the same piece never appears on both sides; an offset into one shared list cannot
  work, because the columns move in opposite directions and every photo eventually meets itself.
- **The fade is measured, not guessed.** `onLayout` on the wordmark gives its real y; wall and
  gradient end at `y - CLEARANCE` (5pt). A screen-height fraction is wrong on every other device.
- **The images are bundled, not fetched.** This screen renders before anyone has a token and every
  route — `/api/public/*` included — returns 403 without one.

Tuning surface: `CLEARANCE = 5`, `FADE_SPAN = 0.42`.

> **Two login files exist.** `login.ios.tsx` (correct) and `login.tsx` (stale). Metro resolves
> `.ios.tsx` first on iOS. **First cleanup task:** delete `login.tsx`, rename `login.ios.tsx` over
> it. This only exists because of the permission problem in §4.

### The seller gate
`mobile/app/become-a-store.tsx` is written but unreachable — the button still opens
`/store/signup` in a web sheet. To wire it, in `login.ios.tsx`:

```tsx
onPress={() => router.push("/become-a-store")}
```

---

## 2. The babel fix — why the app runs at all

`ReferenceError: Property 'MessageQueue' doesn't exist` on launch, in Expo Go and native builds.
Not a stale cache, not the worklets version — both were tested and ruled out.

Cause: **no `babel.config.js` and `babel-preset-expo` not installed.** Metro transformed React
Native's Flow-typed core with no Expo preset.

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"], plugins: ["react-native-worklets/plugin"] }; // plugin last
};
```

**Tell the founder:** `MOBILE-SETUP.md` lists six gotchas; this is a seventh and the worst — its own
quickstart fails on a fresh clone. The doc also says to copy `.env.local.example`, which does not
exist in the repo.

---

## 3. Running the app

```bash
cd ~/Documents/via-platform/mobile
npx expo start          # NO --port flag
# tap the VYA icon on the simulator
```

- **Never `--port 8082`.** The native binary has 8081 compiled in; moving Metro leaves the app
  looking at an empty port (`unsanitizedScriptURLString = (null)`).
- **`--offline`** suppresses the LAN broadcast so the server never appears in Expo Go's list.
- GutBliss is SDK 57, this is SDK 54, only one Expo Go can be installed — the native build sidesteps
  it. If both need to run, give *GutBliss* the non-default port.

Dev sign-in is currently **off** (`mobile/.env.local`, backup at `.env.local.bak`) so the sign-in
screen is visible. Restore `EXPO_PUBLIC_DEV_LOGIN_EMAIL` + `EXPO_PUBLIC_DEV_ADMIN_PASSWORD` and
restart Metro with `--clear`.

---

## 4. The permission problem

Claude Code could not read any pre-existing file under `~/Documents` — it could create files and
read those back, but not list directories or run `git`. Ruled out: config (no deny rules), session
state (restart changed nothing), file flags/ACLs (clean), the sandbox
(`dangerouslyDisableSandbox` made no difference).

Claude Code runs under `launchd` and appears nowhere in Privacy & Security → Files and Folders.
Terminal, Cursor and VS Code all have Full Disk Access; Claude has none.

```bash
# A — inherit Terminal's grant (Cmd-Q Claude first)
cd ~/Documents/via-platform && claude --continue

# B — give Claude its own grant
# Full Disk Access → + → Shift-Cmd-G →
/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe
```

> `! command` inside Claude Code runs in Claude's own process and hits the same restriction.
> Commands must be typed at a real Terminal prompt.

---

## 5. The seller app

**This is a different app from what's in `mobile/`.** That is the *shopper* app. The design is the
*seller* app. Same palette, nothing else shared.

Five tabs, no labels: **Home · Inventory · List (+) · Inbox · Store**. The centre **+** is the only
filled control in the app — listing is the one action that makes money. The bag lives in the header,
which is what makes five tabs possible.

Screens: Home (hub), Inventory, Inbox, Listing flow (Capture → Details → Loading → Review → Add
many), Orders, Settings drawer, Analytics, Consignment, Payouts, Plan & billing, Customers,
Discounts, Notifications, Help, Piece, Message, Market Mode (takes over the whole screen, no tab
bar), Store tab (A vs B — unresolved). The artifact link at the top has each one written out.

**Deliberately desktop-only:** shipping zones/duties/carriers, sales tax, policies/domains/storefront
editing, full P&L/cost imports/bulk editing, people and seats.

### Building it
Put it at `mobile/app/(seller)/` alongside `(tabs)/` and route on `storeSlug` — sign-in already
returns it (null for shoppers). Not a second Expo app: that means a second bundle id, listing and
review cycle, and sellers are shoppers too.

`app/api/store/` already has analytics, orders, inventory, listings, consignment, market, payments,
billing, customers, discounts, messages, inbox, offers, price-check, me, profile, storefront, domain.
**Read each route before binding a screen to it — do not guess response shapes.**

Every route including `/api/public/*` is behind the pilot approval gate; for the app a valid bearer
token *is* approval. Omit it and you get 403, not an empty list.

---

## 6. Next steps

1. Fix the file permission (§4).
2. Collapse the two login files.
3. Commit: babel config, collage, login screen, gate. **Leave the capture/plan-b work alone** —
   it is someone else's in-flight work sitting uncommitted in the same tree.
4. Wire the gate to `/become-a-store`.
5. Re-share the 21 mockups (they are gone from cache) and confirm scope.
6. Settle the Store tab, A or B.
7. Build `(seller)/` — tab shell, then Home.
8. Tell the founder about the babel config and the missing `.env.local.example`.

Smaller: only 7 collage photos means each column repeats (every 4th left, 3rd right) — twelve
removes it. And "Look around first" is impossible today: browsing without a token 403s everywhere.
