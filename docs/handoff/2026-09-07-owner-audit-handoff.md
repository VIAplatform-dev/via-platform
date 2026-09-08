# VYA — Owner-audit handoff (Tiers 1–3 built, Tiers 4–8 queued)

**Written:** 2026-09-07, end of a multi-day session. **For:** whoever picks this up in another CLI/agent session.
**Read this first, then `CLAUDE.md`, then `docs/handoff/2026-09-03-mobile-app-handoff.md` (the phone app) and `docs/handoff/2026-08-29-hosted-stores-handoff.md` (Plan B / hosted stores).**

Lives in `docs/handoff/`; the Tier-by-tier detail below is complete through the 2026-09-08 addendum at the end.

---

## 0. Where everything is

| Thing | Location |
|---|---|
| Main repo | `~/Documents/via-platform` (branch `app-changes` checked out; `main` is what deploys) |
| **Working worktree — all audit work lives here, UNCOMMITTED** | `~/Documents/via-platform-build`, branch **`owner-audit`** (= main + the `app-changes` capture/Plan-B work + Tiers 1–3) |
| Web dev server used for Playwright | `npx next dev --webpack -p 3001` from the worktree (Turbopack rejects this worktree) |
| Phone (Expo Go) | `cd ~/Documents/via-platform-build/mobile && npx expo start --go --offline --port 8082` |
| Audit + build list (38 items, 8 tiers) | https://claude.ai/code/artifact/72bb165f-dac4-4895-895c-c9508b3b879c |
| Twelve seller-Home layout options | https://claude.ai/code/artifact/6ae68e96-11a0-43df-a17a-5b04038bba11 |
| Production | vyaplatform.com / getvya.ai (deploy = `git push` to `main`, Vercel) |

**Nothing from the audit has been committed or pushed.** `git status` in the worktree shows ~80 changed/new files. The owner decides when to commit; see §9.

---

## 1. Hard rules (from the owner; still in force)

1. **Never `git commit` or `git push` unless the owner says so in that exact message.** "Commit and push" never carries forward.
2. **Never read `.env` / `.env.local` / secrets.** Never write to production (HTTP or DB) without explicit confirmation. Two standing authorisations exist: throwaway test rows on store `gfdgsgfsgdfs`, and *file-to-file copy* of env files (e.g. `cp` of `mobile/.env.local`) without reading them.
3. Web files: **1-space indentation**. `mobile/`: **2-space**. Match the file you're in.
4. **Market Mode: never add a parallel inventory or payment path.** Reserve via `reserveItemForMarket`, finalize via `finalizeMarketSale`.
5. **`proxy.ts` is Next 16's middleware.** Every new `/api/store/*` route must be added to `PUBLIC_ROUTES` there, and routes the phone calls must use `resolveStoreSlugAny` (web session + mobile JWT), never `resolveStoreSlug`.
6. Tests: Node-native (`node --test`, `*.test.ts`, imports need `.ts` extensions). Pure logic in `*-core.ts` (web) / `mobile/lib/seller/*.ts` (phone). **Write the failing test first.**
7. Phase-gated delivery: finish a tier, report how to test it, stop and wait for go-ahead.
8. The owner reports UI bugs by screenshot; don't use browser automation on this project.

---

## 2. Stack facts you'll trip on

- Next.js 16 App Router. `proxy.ts` = middleware. Pages need an Auth.js session + `via_access` cookie; API uses `isApprovedRequest`. Admin cookie: `via_admin_token = sha256(ADMIN_PASSWORD)`. Local admin sign-in: `http://localhost:3001/api/admin/dev-login?to=/admin` (dev only, loopback only).
- Neon Postgres via tagged SQL and drizzle. Node 24/25 native TS.
- Expo SDK 54, expo-router 6. `<Redirect>` must be guarded with `useIsFocused`. Files in `mobile/app/(seller)/` become tabs unless `href: null`. Root-level route names collide with group routes (that's why the seller settings page is `/menu`).
- **Phone in a worktree:** `mobile/node_modules` must be a *real* install (`npm ci && npm dedupe`), never a symlink. A symlink makes Metro resolve the entry outside the project → `[runtime not ready] ReferenceError: Property 'MessageQueue' doesn't exist`. `npm ci` alone nests two Metro versions (`metro-runtime` not hoisted → Expo CLI "Cannot find module 'metro-runtime/package.json'"); `npm dedupe` fixes it. `expo run:ios` embeds an eager bundle in the app, so a dev-client build keeps failing until rebuilt. **Use Expo Go** for quick looks (command in §0). `--offline` skips the Expo-login manifest-signing prompt; port 8082 because another project often holds 8081.
- Phone dev sign-in: `mobile/.env.local` (copy from main repo, don't read) has `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_DEV_LOGIN_EMAIL`, `EXPO_PUBLIC_DEV_ADMIN_PASSWORD`; `lib/devAuth.ts` mints a session via `POST /api/mobile/auth/dev-login`. The phone talks to the **deployed** API, so server-side changes on `owner-audit` won't show on the phone until merged.
- macOS TCC: this session lost read access to `~/Documents` twice. Fix = Full Disk Access **and** Files and Folders › Documents for Terminal/claude, then fully restart the process (`ps -o lstart= -p <claude pid>` proves whether it restarted).

---

## 3. What was built before the audit (already on `main`)

### 3a. Seller mobile app (Expo, `mobile/app/(seller)/`)
Screens: `_layout` (tabs), `index` (Home), `inventory`, `inbox`, `store` (owner's real storefront in a WebView — "option A"), `menu` (three-lines menu), `orders`, `analytics`, `customers`, `discounts`, `payouts`, `billing`, `notifications`, `help`, `consignment`, `list` (capture), `piece/[id]`, `message/[id]`, `new/{details,loading,review,bulk}`; `mobile/app/market/index.tsx` (Market Mode, ported from the web). Helpers in `mobile/lib/seller/*` (tested), `mobile/components/seller/Screen.tsx`. Listing flow Capture → Details → Loading (~40 s, measured) → Review → "Add many" (bulk). `intake-shape.ts` normalises the intake API shapes (`draft` with `{value,confidence}` fields, `estimate.suggestedCents`, publish takes major units, returns `itemId`). Store auth switched to `resolveStoreSlugAny` on `/api/store/me` and `scan-item`; several store routes allowlisted in `proxy.ts`.

### 3b. Flyer QR campaign (live)
Six routes `/vintage`, `/emma-stolen-bag` (→ `/brands/fendi`), `/trendsetter`, `/not-shein`, `/fashion-clone`, `/postcard`. Landing = real homepage glimpse + undismissable email gate → instant approval + session (magic sign-in link minted by `/api/flyer-join`) → browse; next-day thank-you email cron (`/api/cron/flyer-welcome`); per-flyer scan counts in Neon `qr_scans`, admin at `getvya.ai/admin/flyers`. Files: `app/lib/flyers.ts`, `flyer-stats.ts`, `flyer-welcome-db.ts`, `flyer-bot.ts`, `app/components/Flyer{Gate,Landing}.tsx`, `public/flyer-qr/*`.

---

## 4. Tier 1 — "Tell her the truth" (BUILT, on `owner-audit`)

| # | What | Where |
|---|---|---|
| 1 | One profit definition: revenue − VYA fee − card fee (est.) − labels − cost of goods − consignor cut − expenses; may be negative; "Cost missing on N sold pieces" instead of free | `app/lib/analytics/profit-core.ts` (+9 tests), `margin.ts` (`MarginTotals` gained `feeCents, cardFeeCents, labelCostCents, consignorCutCents, orderSales`; `profit: {lines, missingCostNote}`), Home `admin/home/page.tsx`, P&L `admin/dashboard/page.tsx` ("Selling costs" block) |
| 2 | Rename Net profit | moot — #1 shipped |
| 3 | Re-check eBay/Depop at checkout before charging | `app/lib/market-sync{,-core}.ts` (`syncMarketplaceSalesForStore`, `syncAllStores`, `settleCrossListedBeforeCharge`), used by `app/api/checkout/route.ts` (409 "This piece just sold on another marketplace") and `app/api/storefront/cart-intent/route.ts`; both sync crons refactored to `syncAllStores` |
| 4 | eBay platform notifications (push instead of hourly poll) | **NOT built.** Needs eBay notification subscription per store + a receiving route that calls `syncMarketplaceSalesForStore(slug, since, "ebay")`. Depop has no equivalent (stays on 20-min poll + the checkout guard). |

**Test:** `e2e/profit.e2e.ts` (5 tests, fixtures via route interception) + `node --test app/lib/analytics/profit-core.test.ts app/lib/market-sync.test.ts`.

---

## 5. Tier 2 — "The five-second moments on the phone" (BUILT)

| # | What | Where |
|---|---|---|
| 5 | Search on phone Home + Inventory, status inline | `mobile/components/seller/Search.tsx`, `mobile/lib/seller/search.ts` (+test), uses `/api/store/search` (allowlisted) |
| 6 | Holds: a reservation tagged `hold:<name>`; every path that respects reservations refuses a held piece; the existing `release-expired-reservations` cron releases it | `app/lib/holds-core.ts` (+9 tests: `holdRef/parseHoldRef/holdUntil` (≤30 days, future only)/`holdsDueSoon`/`describeHold`), `app/lib/holds-db.ts` (`placeHold/releaseHold/listHolds`), `GET /api/store/holds`, `POST /api/store/items/[id]` actions `hold {name?, days?|until?}` and `release` (refuses a buyer's checkout/offer reservation), storefront product page shows **"On hold"** (schema.org LimitedAvailability). Phone Piece: Hold for someone (Tonight/3 days/A week/2 weeks), Release hold; web+phone Home tile/row "Hold lapses today · Ana" |
| 7 | Dead buttons wired | Phone Piece: inline Edit (title/price/brand/size/condition → PATCH), Mark sold via `sold` action (delists cross-listings). Market Mode phone: `mobile/app/market/{find,quick,sales}.tsx`, `checkout/[id].tsx` (cash only; QR/keyed stay on desktop), registered in root `_layout.tsx`, Resume opens the checkout |
| 8 | Loading keeps its promise | `new/loading.tsx` publishes the draft server-side when pricing returns and stores `itemId` in `lib/seller/draft.tsx`; Review PATCHes that row and publishes via the `publish` action (no duplicates) |
| 9 | Days listed | `app/lib/aging-core.ts` + `mobile/lib/seller/aging.ts` (tested, same numbers, 60/90 thresholds); web Inventory sortable **Days** column (only live pieces age; amber ≥60, rose ≥90) + `?sort=oldest`; phone rows "120d"; Home tile "Listed over 90 days" both sides |

Also: `/api/store/holds`, `/api/store/search` allowlisted in `proxy.ts`. The `?store=` admin switch now works throughout the storefront builder (`app/store/storefront/page.tsx`, `studio/page.tsx`, `admin/storefront/page.tsx` fetch via `withStore`) — the in-iframe save script in `app/lib/site-capture.ts` (`fetch("/api/store/capture/edit")`, `/api/store/assets`) still lacks the store param; an admin's iframe save could land on the wrong store. Seller onboarding (`app/store/onboarding/page.tsx`) now ends with "Open it in the storefront builder" → `/admin/storefront?welcome=import`.

**Test:** `e2e/tier2.e2e.ts` (6 tests incl. a real hold round-trip on `gfdgsgfsgdfs`, released in `finally`); units above; phone `cd mobile && npm test`.

---

## 6. Tier 3 — "A new store reaches its first sale" (BUILT; #11 billing EXCLUDED by owner)

| # | What | Where |
|---|---|---|
| 10 | "Set up your store" on Home until done: ship-from · Stripe (cached `sellers_payments` flags, no live call) · shipping on · first listing · returns policy · domain (**optional**, never blocks) | `app/lib/setup-core.ts` (+test), `GET /api/store/onboarding-status` now returns `setup[]`, `setupComplete`, `setupDone/Total/Next`; new `hasRefundPolicy` (`store-policy-db.ts`), `hasShippingRow` (`store-shipping-db.ts`); web Home card (`data-testid="setup-card"`); phone Home block (`mobile/lib/seller/setup.ts`, tolerant of a server without `setup` — a real crash was fixed here) |
| 12 | Push: registration, prefs, sold + buyer-message events | `app/lib/notification-prefs-core.ts` (+test) / `-db.ts` (table `store_notification_prefs`), `GET/PUT /api/store/notification-prefs`; `app/lib/seller-push-core.ts` (+test; copy), `seller-push.ts` (+test; injectable deps; prefs gate → `getStorePushTokens` → `sendExpoPush`); hooks in `stripe-connect` webhook (after `createPaidOrder`), `market-sync.ts` (after `markSold`), `message-notify.ts` (+`conversationId`), `api/mobile/messages`; **bug fixed** in `api/mobile/push-token` (self-onboarded stores resolved via `storeSlugForEmail`); phone `mobile/lib/push.ts` (`registerForPush` → registered/denied/unavailable), `lib/auth.tsx` registers after sign-in, `_layout.tsx` handler + tap routing (sold → orders, store_message → inbox), Notifications screen persists prefs (`apiPut` added to `lib/api.ts`). By design **no push for Market Mode cash sales** or the manual cross-listing mark-sold. Push cannot be exercised in Expo Go. |
| 13 | Nav cleanup | `app/infrastructure/admin/nav.ts` (+`nav.test.ts` enforcing: one Payments, one Analytics, "Site versions", "Import your site", "Abandoned carts", "Add a piece" top-level, Platform hidden for sellers, Settings children = non-`vyaOnly` `SETTINGS_SECTIONS`); `layout.tsx` consumes it; `CrossListingView.tsx` gets a "Marketplace overview" tab (old `/cross-listing/analytics` still works); Customers page chips All · Buyers · Imported + `?filter=buyers`; recovery page titled "Abandoned carts"; Apps moved under Settings › Channels |
| 14 | Needs-attention, complete | `app/lib/attention-core.ts` (+test), `attention-db.ts`, `GET /api/store/attention` → `{counts, rows, lowConfidenceIds}`; new counters: `countPickupsWaiting` (orders), `countUnansweredConversations` (storefront inbox) + `countUnansweredStoreConversations` (marketplace inbox), `countCrossListingErrors`, `listLowConfidenceItemIds` (new `intake_memory_items.item_id` column written on publish; falls back to `images[0]=image_url` for old rows). Web Home tiles + phone "Needs you" rows. Inventory accepts `?missing=photo|price|cost|confidence`; Orders accepts `?delivery=pickup` |

**Test:** `e2e/tier3.e2e.ts` (7 tests incl. real notification-prefs round-trip); `node --test app/lib/setup-core.test.ts app/lib/attention-core.test.ts app/lib/notification-prefs-core.test.ts app/lib/seller-push-core.test.ts app/lib/seller-push.test.ts app/infrastructure/admin/nav.test.ts`.

---

## 7. How to verify everything (last run 2026-09-07 evening, all green)

```bash
cd ~/Documents/via-platform-build

# Web unit tests (expect 1921 pass / 4 pre-existing failures: comps, contact-fields,
# data-layer/unbranded-benchmark, storefront-from-brand — same 4 fail on main)
npm test

# Phone unit tests (76/76)
cd mobile && npm test && cd ..

# Typecheck (web: ignore .next/types and the pre-existing StorefrontTheme productPage/effects/customJs
# errors in app/s/[handle]/p/[id]/page.tsx and app/api/store/storefront/design/route.ts)
npx tsc --noEmit
(cd mobile && npx tsc --noEmit)

# Playwright (18/18). Needs the dev server on :3001; the config loads ADMIN_PASSWORD from .env.local itself.
npx next dev --webpack -p 3001          # separate terminal
npx playwright test -c e2e/playwright.config.ts
```

By hand on the web (sign in first via `http://localhost:3001/api/admin/dev-login?to=/admin`):
- Home: `http://localhost:3001/admin/home?store=gfdgsgfsgdfs` — setup card, attention tiles, profit card.
- Inventory: `…/admin/inventory?store=gfdgsgfsgdfs&sort=oldest` (Days column), `&missing=confidence`.
- Orders: `…/admin/orders?delivery=pickup&store=…`. Customers: `…/admin/customers?filter=buyers&store=…`.
- Storefront builder in captured mode: `…/admin/storefront?store=sourcedbyscottie` (127 captured pages; the only store with a capture as of today).
- Routes: `curl -b via_admin_token=<sha256 of ADMIN_PASSWORD> 'http://localhost:3001/api/store/attention?store=gfdgsgfsgdfs'`, same for `holds`, `onboarding-status`, `notification-prefs`.

By hand on the phone (Expo Go, §0; signed in automatically as Sourced by Scottie): search box on Home/Inventory; open a live piece → Edit / Hold for someone / Mark sold; Menu → Market Mode → Find item / Quick list / Sales today. Setup block, attention rows and push only appear once the server side is deployed.

---

## 8. Small open items (not tiers)

- **Consignment page button spacing** (`app/infrastructure/admin/consignment/page.tsx`): the header actions (Settings, Consignors) wrap into a lopsided stack at ~1500px; the empty-state pair (Add a consignor / Import from another tool) sits too tight. Put the actions on one `flex items-center gap-2` row that drops under the title on narrow widths; give both pairs the same gap. Owner asked for this; blocked only by the TCC issue.
- In-iframe capture editor saves lack `?store=` (see §5). Add the slug (derive from `location.pathname` `/site/<slug>/…`) to the two fetches in the injected script in `app/lib/site-capture.ts`.
- Holds compute "today" in UTC; a held piece stays live on eBay/Depop (the checkout settle guard catches an elsewhere-sale, but a hold doesn't delist).
- `e2e/profit.e2e.ts` / `tier2` / `tier3` share a `signIn` helper that reads `page.context()["_options"]` — a typing wart, works.
- ESLint warning at `app/store/orders/page.tsx:91` is present at HEAD.

---

## 9. Committing (only when the owner says so)

Suggested shape, from the worktree:
```bash
git add -A
git commit -m "Owner audit tiers 1–3: profit truth, cross-list settle guard, phone search/holds/market, setup checklist, attention, push, nav"  # + attribution trailer per CLAUDE.md
git push -u origin owner-audit   # then merge to main to deploy
```
After deploy: the phone (pointing at production) will start showing the setup block, attention rows, and register for push (dev build needed on Android; Expo Go can't).

---

## 10. Next tiers (from the audit list; not started)

### Tier 4 — The seller's memory
- **#15 Customer notes and tags** in profile and list; tags as a filter and campaign audience; spent-over / bought-in-category. `store_customers.notes/.tags` columns exist, unused. (M)
- **#16 Wants list.** "Looking for" per customer; on a matching listing Home says so with one-tap message; storefront "tell me when something like this comes in" on sold pieces. Reuse embeddings, customer record, Inbox. (M)
- **#17 Flaws as a list**: column, listing form, section under Condition on the product page. The AI already returns `draft.flaws[]`; schema has no column. (M)
- **#18 Source + acquired date per piece**, lot cost split across a batch, P&L by source. Reuse `costCents`, Expenses. (M)
- **#19 Similar pieces** on Piece (hers) and product pages (buyers); duplicate warning on Review. Reuse embeddings, Market Mode match. (M)
- **#20 Cost bulk fill** "these 20 cost £340" on Add many; missing cost is now a Home item (#14 done). (S)

### Tier 5 — Selling in person
- **#21 Cash receipt**: optional email on the cash screen; adds them to Customers tagged with the market. Reuse `receiptEmail` column, order-confirmation template. (S)
- **#22 Void at the stall**: cash reverses the tin, card refunds, piece back to active. (M)
- **#23 Opening float + count the tin at close**, difference shown. (S)
- **#24 Quick list: price first**, rest optional — phone `market/quick.tsx` already does price-first; check the web. (XS)
- **#25 Printable price tags with QR** to the listing (`/q/{code}`, scan recording). (M)

### Tier 6 — Online selling and shipping
- **#26 Her own shipping tier prices**, in her currency. (S) · **#27 Weight default by category** from `draft.parcel`; tier shown on Review. (S) · **#28 Parcels, not pieces** in counts; one Mark posted per bag. (S) · **#29 Share + Copy link / Copy caption** on product pages and Piece. (S) · **#30 Relist on refund; buyer "request a return"** landing in Inbox with policy applied. (S) · **#31 Sizing and condition as structure** (vintage→modern via `deriveSize`, measurement templates by category, condition chips). (M) · **#32 Ships-to on the product page** from her zones. (XS)

### Tier 7 — Consignment and marketing
- **#33 Consignor emails**: sold (with her cut), paid, ending soon. (S) · **#34 Renew / Return on ended consignments.** (S) · **#35 Automations**: price drop on viewed, wants match, last chance before consignment ends, similar to what you bought. (M) · **#36 Instagram: post any piece any time; feed post option.** (S) · **#37 "Price all N": cost line + Stop.** (S)

### Tier 8 — Later
- **#38 One inbox**: eBay messages via API; Depop when the extension clears review. (L)
- Plus Tier 1 **#4 eBay platform notifications** (see §4).

Audit's own ordering advice: after Tiers 1–3, the next highest-leverage work is #15–#20 (memory), then #21–#25 (the stall).

---

## 11. Decisions made along the way (so you don't relitigate)
- Store tab on the phone = the owner's real storefront in a WebView (option A). Market Mode on the phone is a port of the web code, same endpoints.
- Flyer scans invite instantly (not next day); thank-you email next day. Fendi flyer lands on `/brands/fendi`.
- Seller onboarding is on Plan B (page-for-page capture) — Plan A survives only as the products step inside Plan B and the public landing demo.
- Profit may be negative; card fee is an estimate; cost-missing pieces are excluded and named.
- Holds ≤ 30 days, name optional, domain setup optional, payments checklist uses cached flags, no push at the stall.
- Tier 3 #11 (billing) deliberately skipped.

---

## 12. Addendum — later on 2026-09-07 (Tiers 4–6, parity pass, eBay notifications, phone test)

**Everything below is also on `owner-audit`, uncommitted.** Final numbers at time of writing: web unit 2071 pass / 4 pre-existing failures, phone 107/107, Playwright 33/33 (`--workers=2`; the default worker count can time out on webpack cold compile), 235+ changed files.

### Tier 4–5 items built (#15, #17, #18, #20, #21, #22)
- **#17 Flaws**: `items.flaws` (jsonb), `app/lib/flaws-core.ts`; intake publish writes `draft.flaws`; web Add a piece + edit modal list editors; phone Review row + Piece; product page "Flaws" under Condition.
- **#18 Source/lot**: `items.source_name`, `acquired_at`, `lot_id`; `app/lib/lot-core.ts` (`splitLotCost` by price, remainder to first); bulk `POST /api/store/items {action:"lot"}`; P&L "Profit by source" (`margin.ts bySource`); phone Add many batch fields.
- **#20 Cost fill**: bulk `{action:"cost", eachCents|totalCents}`; "Select all without cost" bar on `?missing=cost`; phone Piece Cost.
- **#15 Customers**: `store_customers.notes/.tags` live; list filters `?tag=&spentOver=&category=`; `app/lib/customer-audience-core.ts` shared by list + campaign sender; `PATCH /api/store/customers/profile {email, notes?, tags?}`; phone chips + editable detail.
- **#21 Cash receipt**: `receiptEmail` on `POST /api/store/market/checkout/[id]/cash`; `app/lib/market/receipt{-core,}.ts`; customer tagged `market:<session>`.
- **#22 Void**: `POST /api/store/market/sales/[orderId]/void`; `void-core.ts`; refund via the shared `app/lib/order-refund.ts`; atomic paid→refunded claim; web + phone Sales today "Void".
- Also: `DELETE /api/store/items/[id]` (draft/removed, never ordered) for e2e cleanup.

### Tier 6 built (#26, #27, #28, #31, #32)
- **#26** per-zone tier price overrides in the store's currency (`shipping-prices-core.ts`, one `quoteShipping` resolver; storefront quote routes now respect zones and refuse unserved destinations with 400).
- **#27** `items.parcel_estimate`; `parcel-core.ts` (typed > AI > category default); the old "every unweighed piece = small" fallback is gone; "Ships as" rows + mismatch warning on web forms and phone Review.
- **#28** parcels: `parcels-core.ts` (`groupIntoParcels` by paymentIntent, fallback buyer+2min), `POST /api/store/orders/parcel`, one tracking email per bag (`parcel-notify.ts`); Orders (web+phone) one row per parcel; Home "Parcels to post".
- **#31** condition grade scale (`condition-core.ts`) + `condition_note`; `measurements_json` with per-category templates (`measurements-core.ts`, in for US else cm); size line via `size-display-core.ts` (no vintage→modern table exists; it's the country→US conversion + fit note). Shared UI `app/infrastructure/admin/ListingStructure.tsx`.
- **#32** "Ships to …" line on the product page from zones (`ships-to-core.ts`) — only proven by unit test; no test store has a shipping row.

### Parity pass (audit of "same field, every surface") — built
Holds on web Inventory (`holdPill`: "On hold · Ana · 3 days left" vs "Reserved" for a buyer), held pieces stay in storefront grids + hosted stores as "On hold" (unbuyable), phone Cost row, phone Piece edits flaws/source/date, profit on phone Analytics + Home line, web Settings › Notifications, bulk-upload lot fields, `lotId` from phone batches, phone Customers editable + tag filter, phone Orders "Collections" tab, phone Inventory `?missing=` chip, flaws+measurements in cross-listing descriptions (`cross-listing-core.ts`), CSV columns, search haystack, naming unified ("Cost · what you paid", "Where it came from", "Acquired on"). New `e2e/parity.e2e.ts`. **Rule now in memory:** every item ends with a field × surface table.

### #4 eBay sale notifications — built, needs credentials to go live
Commerce Notification API topic `ORDER_CONFIRMATION`; receiver `POST /api/webhooks/ebay` (challenge GET, signature check against eBay's public key, replay-safe, then `syncMarketplaceSalesForStore`); admin `POST /api/admin/ebay-notifications/setup` + `status`; block on Settings › Marketplaces; `docs/handoff/ebay-notifications.md`. **Side finding:** the eBay connection never asked for `sell.fulfillment`, so the hourly poll was likely 403-ing; scope added, stores connected before today must reconnect eBay once. After deploy: set `EBAY_NOTIFY_VERIFICATION_TOKEN`, run the setup curl.

### Phone test (real, on the simulator against the branch)
- **Two traps that cost an hour:** (1) `mobile/.env.local` pointed at `http://localhost:3000`, where a `next dev` from the MAIN repo (started Sep 2) still runs old code — kill it (`lsof -tiTCP:3000 | xargs kill`); the worktree's file now says `:3001`. (2) The phone signed in as the marketplace slug `sourced-by-scottie` (hardcoded email map) instead of the hosted store `sourcedbyscottie`: mobile auth checked the map before `store_users`, the reverse of the web rule. Fixed via `storeSlugForMobileEmail` (`app/lib/storeAuth.ts`, `store-slug-core.ts`) in all six mobile auth paths; plus a `store_users` row now links the dev email to `sourcedbyscottie` (reversible via `DELETE /api/store/users`).
- Metro must be restarted with `--clear` after any `EXPO_PUBLIC_*` change (the transform cache keeps the old inlined value).
- Fixed from the walkthrough: Piece screen spinner while the inventory loads; dark status bar on the four Market Mode sub-screens.
- Not tap-tested (no tap driver installed; deep links + screenshots only): Hold, Edit, Add a piece, Quick list, cash checkout, Void.

### Still open after this
- Last four parity cells (in progress when this was written): Add a piece source/acquired; bulk-upload edit modal flaws/condition/measurements; phone Piece condition note + measurements; `?store=` on the in-page storefront editor saves.
- Not built: #16, #19, #23, #24 (web), #25, #29, #30, #33–#37, #38, #11 (excluded).

### Later that night (2026-09-08 early): last gaps + shopper-facing parity
- **Four seller-side gaps closed:** Add a piece has "Where it came from" + "Acquired on"; bulk-upload edit modal has flaws, condition chips + note, measurements (and the page now honours `?store=`); phone Piece edits condition note + measurements; the in-page storefront editor's saves carry `?store=<slug>` (`capture-edit-url-core.ts`, injected script in `site-capture.ts`). `e2e/gaps.e2e.ts`.
- **Two real holes in the shopper bag fixed:** `POST /api/storefront/cart` refused non-live pieces (`bag-reclaim-core.ts` `bagRefusal`), and `cart-intent` now only reclaims the bag's OWN reservation (`mayReclaimReservation`) — before, it released a seller's `hold:<name>` and sold the piece. Proven in `e2e/parity.e2e.ts` (hold → bag 409 "on hold" → release).
- **Storefront kinds parity (rule now in memory):** Studio/blocks homepage tiles carry sold/held badges (`app/s/blocks/kit.tsx`, `featured.tsx`, `StorefrontView.tsx`); imported/hosted product pages get a `<section data-vya-details>` block (size line, measurements, condition + definition + note, flaws, ships-to) injected at serve time in BOTH the synthetic and captured-theme branches (`hosted-product-details-core.ts`, `hosted-product-details.ts`, `app/site/[slug]/products/[handle]/route.ts`), idempotent; hosted cart says "is on hold." (`plan-b/cart-refusal-core.ts`). **Marketplace phone product page deliberately skipped:** `products` (marketplace) and `items` (seller inventory) share no key — do not invent a join. `e2e/storefront-parity.e2e.ts`.
- **Test infra:** `e2e/playwright.config.ts` `expect.timeout` 15s (Home makes ~10 requests on load). Full-suite flakiness under `--workers=2` traced to a dev server that had run for hours through hundreds of edits — restart `next dev` before a full run. 39 e2e tests total.
