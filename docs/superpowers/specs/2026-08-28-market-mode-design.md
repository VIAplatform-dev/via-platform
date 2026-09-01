# Market Mode — design, edge-case audit, and implementation plan

Status: **Implemented (Phases 1–5) on branch `import/m0-capture-shim`, uncommitted.** Date: 2026-08-28.
Implementation notes vs. this design: Quick List opens with two entry points (manual name+price first, AI from a photo second); the readiness block is a checklist that hides itself when complete; Home is the "wine band + sheet" layout; a per-seller rate limit (40 checkout starts/min) and ops alerts on `paid_conflict` / failed duplicate-refund were added in hardening.

Market Mode is a temporary operating mode of the seller Store OS that turns the web app into a
purpose-built POS for selling one-of-one vintage in person. Core loop:

**Prepare → Find item (photo/search) → Confirm → Checkout in person → Stripe payment → SOLD everywhere.**

This document is the output of Phases 1–5 (discover, audit, design, challenge, plan). Phase 6
(implement) starts only after the decisions in §0 are confirmed.

---

## 0. Decisions needed before implementation

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Where Market Mode lives** | The Store OS (`app/infrastructure/admin/*`, served at `/admin/*` on getvya.ai). It already owns Inventory, Add listing (AI intake), Payments, and a real sidebar with a mobile drawer. The legacy `/store/*` portal has no shell and is on the deprecated side of the pivot. |
| D2 | **Payment rail** | **Stripe, on the seller's existing Connect Express account** (direct charge + application fee — the same rail as `/api/checkout` today). MVP: a **Stripe Checkout Session shown as a QR code** on the seller's phone (customer scans, pays with Apple Pay / Google Pay / card on their own phone) plus a **keyed-card fallback** (seller types the card into an embedded Payment Element). V2: **server-driven Stripe Terminal** with a Stripe Reader S710 ($299, LTE) for card-present pricing. V3: **Tap to Pay** in the Expo app. Square is dropped — money must land in the Connect account. Full reasoning in §D. |
| D3 | **Cash tender in MVP** | Yes. "Paid in cash" is the same finalize path with `tender = cash` and no Stripe call. Markets are cash-heavy; without it sellers will mark items sold by hand and bypass the whole system. |
| D4 | **Quick-listed items without a ship-from address** | Allow in-person sale from `draft`. Today a live (`active`) listing requires a ship-from address (label floor). A Quick List item that doesn't sell stays a draft the seller finishes later; one that sells goes `draft → reserved → sold` via a market-only transition. Alternative: force the ship-from during market prep readiness. |
| D5 | **Stripe setup (you)** | Nothing new for MVP — the existing Connect webhook endpoint (`/api/webhooks/stripe-connect`, `STRIPE_CONNECT_WEBHOOK_SECRET`) already receives `checkout.session.completed` / `payment_intent.succeeded` / `charge.refunded` from connected accounts. For V2 (Terminal) add `terminal.reader.action_succeeded/failed` to that endpoint's event list. |
| D6 | **Tier gating** | Not gated in MVP (no tier gate is enforced anywhere today). Add `market_mode` to `FEATURE_MIN_TIER` as a label only. |
| D7 | **VYA fee on market sales** | Reuse `applicationFeeCents()` (the same 1% the online checkout takes) so the money model stays uniform; set to 0 for `channel = market` if you'd rather not take a cut in person. One-line config in `payments-config.ts`. |

---

## 1. What exists (audit) and what we reuse

**Reused as-is — the load-bearing pieces**

| Need | Existing | Notes |
|---|---|---|
| Inventory source of truth | `items` table + `app/lib/db/inventory.ts` | One-of-one; `status` enum `draft/active/reserved/sold/removed`; every availability change is a single status-guarded `UPDATE`. |
| Locking against double-sell | `reserveItem()` (`active→reserved` atomic) + `reservations` partial-unique "one live lock per item" + `releaseExpiredReservations` cron (*/10 min) | Market checkout **reserves the item** the same way online checkout does. An online buyer and an in-person buyer contend on the same row; exactly one wins. |
| Mark sold | `markSold()` (`reserved|active → sold`) | Idempotent-safe: returns null if already sold. |
| Orders | `orders` + `createPaidOrder()`; refund unwind `relistItem` + `markOrderRefunded` | Add `channel`, `tender`, `market_session_id`, `market_checkout_id` columns + a unique index on `stripe_payment_intent`. |
| Post-sale fan-out | `delistEverywhere`, `creditConsignedSale`, `recordEvent("purchase")`, `markCheckoutRecovered` | Called from the Stripe `fulfill()`; the market finalize calls the same set. |
| Seller auth | `resolveStoreSlugAny()` → slug; `getSellerBySlug()`; ownership check `item.sellerId === seller.id` | Every market endpoint uses this. Middleware does no store authorization — routes are the boundary. |
| Item creation | `createItem()`; field sanitation in `/api/store/intake/publish` | Quick List reuses the sanitizer + `createItem`. |
| AI vision | `draftListing()` (Claude Sonnet) in `ai-intake.ts` | Quick List calls it with a "fast/brief" hint; skips pricing phase, PhotoRoom, comps. |
| Image embeddings | `embedImage/embedImages/cosine` (Voyage multimodal-3, 1024-d) | Photo→listing matching. Gated on `VOYAGE_API_KEY`; degrades to manual search. |
| Image upload | `/api/store/assets` (sharp, HEIC→JPEG, Blob) | Quick List photos. Find-Item photos are **not** uploaded — sent downscaled as base64 straight to the match endpoint. |
| Payment rail | `/api/checkout` (reserve → Checkout Session on the connected account with `application_fee_amount` → `fulfill()` in `/api/webhooks/stripe-connect`) + embedded Payment Element flow (`/api/storefront/checkout`) | Market checkout is a variant of this: no address, no shipping, `channel = market`, and the session URL is rendered as a QR. The **existing webhook `fulfill()`** completes the sale. |
| Stripe client + idempotency | `app/lib/stripe.ts` (`stripePost` with `Idempotency-Key`), `getSellerPayments()` (`chargesEnabled`) | Every create call carries the checkout id as idempotency key. |
| Store OS shell | `app/infrastructure/admin/layout.tsx` (`GROUPS`, mobile drawer), `ui.tsx` primitives (`TechButton`, `TechCard`, `StatusPill`, `Toggle`) | Toggle + nav swap live here. |
| Idempotency helpers | `claimSetting`, `claimOrdersForConfirmation` pattern | Same "atomic claim then act" pattern for finalize. |

**Not reused / must not be reused**
- Legacy `products` table (marketplace scrape data, keyed by title, no status). Market Mode never touches it. Sellers whose catalog is still only in `products` must run the existing **Inventory → Convert** (`/api/store/inventory/convert`) first; Market Setup surfaces this as a readiness check.
- Anything Square. The existing `squareClient.ts` catalog sync and `/api/webhooks/square` affiliate webhook are unrelated and untouched. (Square was evaluated and rejected: its funds would settle to a Square account, not the seller's Connect account; see §D.)

**Conflicts / pre-work found**
1. `fulfill()` (Stripe) uses check-then-act (`orderExistsForPaymentIntent`) rather than a unique index. Add a **partial unique index on `orders.stripe_payment_intent`** (benefits the online path too) and an atomic claim on the checkout row so a webhook + poll + cron racing each other can never create two orders.
2. `ITEM_TRANSITIONS` has no `draft → reserved`. Needed for D4. Add `reserveItemForMarket()` guarding `status IN ('active','draft')` and extend `inventory-core.ts` transitions (`draft: [..., "reserved"]`) with a test.
3. `fulfill()` today assumes shipping/address metadata and fires buyer emails + auto-label. It needs a `channel` branch: market orders skip shipping, labels, and the abandoned-cart hooks, and send a receipt only if a customer email was captured.
4. The 10-minute reservation TTL is right for online checkout; a market checkout is shorter still (customer is standing there). Market reservations use a **15-minute TTL** matching the checkout's own `expires_at` and the Checkout Session's minimum `expires_at` (30 min) is irrelevant because we cancel/expire the session ourselves.
5. `items.variants` is ignored by `reserveItem/markSold` today (whole item sells). Market Mode inherits this: a multi-variant listing is treated as one-of-one. Readiness check flags variant items as "sells whole listing" (documented limitation; V2 picks a variant).

---

## A. Product architecture

- **Mode is per store, server-persisted** (`store_market_mode.enabled`), not per device. Turning it on from a phone changes the nav on the seller's iPad too. A market checkout in flight is server state and is unaffected by the toggle (D-edge "seller turns Market Mode off mid-sale": the checkout page stays reachable at `/admin/market/checkout/[id]` and finishes normally).
- **A "market session"** (`market_sessions`) is the unit of a day at a market: name, optional start/end, `status open|closed`. Turning Market Mode on with no open session auto-creates "Today's market" — prep is optional. Sales, "at this market" inventory, and today's totals hang off the open session.
- **Market inventory is a hybrid (Option C).** A session has an optional "bringing" set (`market_session_items`). If empty → the whole `active` (+ `draft` quick-listed) inventory is "at this market." If populated → Find Item and Inventory prefer the set but the seller can still sell any active item ("Not on your list — sell anyway?"). This avoids blocking a sale because prep was skipped, while still answering "what's physically here."
- **One source of truth.** Availability is `items.status`. Market Mode reads and writes it through the existing engine. There is no market-side copy of inventory.

## B. UX architecture

Routes (all under the Store OS, `B = /admin`):

| Route | Screen |
|---|---|
| `B/market` | **Home** — status strip (Stripe ● payments enabled / session name), two giant buttons **📷 Find item** and **＋ Quick list**, then "Today: N items · $X" and "Inventory: N available · N brought". If the seller's Connect account can't take charges: a yellow card "Card payments off — cash only" with **Finish Stripe setup** (existing `/admin/payments`). |
| `B/market/find` | **Find item** — full-bleed camera/file input (`accept="image/*" capture="environment"`), a manual search bar always visible above the fold. Results states: *We found it* (single card, big **Checkout in person**), *Which one is this?* (2–5 cards), *No confident match* (search + Quick list). Photos never leave memory except to the match endpoint. |
| `B/market/item/[id]` | **Confirm** — photo, title, price (editable inline, saved before checkout), size, status badge. Primary **Checkout in person**. Secondary: **Paid in cash**, **Not this item**. Disabled with reason if not sellable (sold / reserved online / removed). |
| `B/market/checkout/[id]` | **Checkout** — one screen driven by server state (polls every 2 s while awaiting): `awaiting_payment` → a full-screen **QR code** ("Customer scans to pay $85 — Apple Pay / Google Pay / card"), a **Type card instead** button (embedded Payment Element for keyed entry), **Paid in cash**, and **Cancel**; `paid` → ✓ SOLD, price, "Hand item to customer", **Done** → home; `failed/canceled/expired` → "No inventory changes were made" + **Try again** / **Back**; `paid_conflict` → red "Payment received but item was already sold — refund from Sales today." |
| `B/market/quick` | **Quick list** — photo(s) → spinner "Reading the piece…" → 3-field confirm (Brand / Title-description / **Price**) with everything else collapsed under "More" → **List & checkout** (creates item, jumps to Confirm with checkout auto-started) or **Just list**. |
| `B/market/sales` | **Sales today** — list of this session's orders (time, item, amount, tender, Stripe ✓), session totals. Tap → detail with a **Refund** button (reuses the existing order refund endpoint, which reverses the fee and relists). |
| `B/market/inventory` | **At this market** — tabs Available / Sold; search; tap → Confirm screen. Shows "Not brought" section when a bringing set exists. |
| `B/market/setup` | **Market setup** — session name/date, **Bring list** builder (select items, count, total value), **Readiness**: Stripe charges enabled · N items missing photos · N without price · N still in legacy catalog (convert) · N multi-variant. **Test payment** (creates and immediately expires a $1 test-mode session to prove the account works). |

Navigation when ON (replaces `GROUPS`): header "MARKET MODE" pill + store name; **Sell**: Find item, Quick list, Sales today; **Inventory**: At this market; **Market**: Setup; footer **Exit Market Mode**. On phones a **bottom tab bar** (Find · Quick · Sales · Inventory) replaces the hamburger drawer — the drawer stays for Setup/Exit.

Toggle when OFF: a `Toggle` row "Market Mode" at the top of the sidebar (and on `/admin/home`). Flipping it: `POST /api/store/market/mode {enabled:true}` → router to `B/market`. Flipping off: returns to `B/home`. Instant, no confirmation (there's nothing destructive).

Device behaviors: minimum 56 px touch targets; sticky primary CTA at the bottom; `visibilitychange` re-fetches checkout state when the screen wakes; `beforeunload` is not used (server state makes refresh safe); back button from Checkout goes to Confirm (the checkout remains awaiting until canceled/expired — Confirm shows "Checkout in progress → Resume"); all state lives in the URL + server so multiple tabs converge.

Loading states: skeleton cards; match endpoint shows a 3-step progress ("Reading photo → Comparing to your inventory → Ranking"); Quick List shows the photo immediately with fields streaming in from one response.

## C. Database architecture (all additive; lazy `ensure*` DDL in the file's own `*-db.ts`, matching repo convention)

```sql
CREATE TABLE IF NOT EXISTS store_market_mode (
 store_slug TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_sessions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), seller_id UUID NOT NULL,
 name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',        -- open | closed
 starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ DEFAULT now(), closed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS market_sessions_one_open ON market_sessions (seller_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS market_session_items (
 session_id UUID NOT NULL, item_id UUID NOT NULL, added_at TIMESTAMPTZ DEFAULT now(),
 PRIMARY KEY (session_id, item_id)
);

-- The checkout intent: the audit trail and the idempotency anchor
CREATE TABLE IF NOT EXISTS market_checkouts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_id UUID NOT NULL, item_id UUID NOT NULL, session_id UUID,
 client_key TEXT NOT NULL,                                        -- per-device idempotency
 amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
 tender TEXT NOT NULL,                                            -- qr | keyed | terminal | cash
 status TEXT NOT NULL DEFAULT 'awaiting_payment',                 -- see state machine
 stripe_checkout_session TEXT, stripe_payment_intent TEXT, stripe_reader_id TEXT,
 order_id UUID, device_label TEXT, failure_reason TEXT,
 created_at TIMESTAMPTZ DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ DEFAULT now(), paid_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS market_checkouts_client_key ON market_checkouts (seller_id, client_key);
CREATE UNIQUE INDEX IF NOT EXISTS market_checkouts_pi ON market_checkouts (stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS market_checkouts_open ON market_checkouts (seller_id, status) WHERE status = 'awaiting_payment';

CREATE TABLE IF NOT EXISTS market_checkout_events (                -- append-only audit
 id BIGSERIAL PRIMARY KEY, checkout_id UUID NOT NULL, at TIMESTAMPTZ DEFAULT now(),
 source TEXT NOT NULL,                                            -- ui | webhook | poll | cron | cash
 from_status TEXT, to_status TEXT, detail JSONB
);

CREATE TABLE IF NOT EXISTS item_embeddings (                       -- photo → listing index
 item_id UUID PRIMARY KEY, seller_id UUID NOT NULL, image_url TEXT NOT NULL,
 model TEXT NOT NULL, embedding TEXT NOT NULL,                     -- JSON array (pilot); pgvector later
 status TEXT NOT NULL DEFAULT 'ok',                                -- ok | bad_image
 created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS item_embeddings_seller_idx ON item_embeddings (seller_id);

-- orders: additive columns (also add to Drizzle schema.ts + ensure in orders.ts)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'online';   -- online | market
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tender TEXT;                               -- card | cash | ...
ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_session_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_checkout_id UUID;
-- closes the check-then-act gap in fulfill(): one order per PaymentIntent, enforced by the DB
CREATE UNIQUE INDEX IF NOT EXISTS orders_pi_uniq ON orders (stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL;
```

Checkout state machine (`app/lib/market/checkout-core.ts`, pure, unit-tested):

```
awaiting_payment ─(payment verified)──────────▶ paid
awaiting_payment ─(seller cancels)────────────▶ canceled
awaiting_payment ─(deadline)──────────────────▶ expired
awaiting_payment ─(Stripe reports payment_failed / session expired)▶ failed
canceled|expired ─(late succeeded payment arrives)▶ paid_late     (item may still be sellable → paid if markSold wins, else paid_conflict)
paid_conflict  = payment succeeded but item no longer sellable (sold elsewhere) → auto-refund + alert
```
Every transition is `UPDATE market_checkouts SET status=$to WHERE id=$id AND status = ANY($allowedFrom) RETURNING *` — the returned row (or none) is the winner signal.

## D. Payment architecture (Stripe Connect)

**Constraint that decides everything: funds must settle to the seller's existing Stripe Connect Express account.** That rules Square out entirely (Square settles to a Square account). Verified from current Stripe docs (Aug 2026):

| Path | Card-present? | From a website? | Works with Express direct charge + app fee? | Fee (US) | Blockers |
|---|---|---|---|---|---|
| **Checkout Session as QR** (customer scans, pays on their phone) | no (online) | **yes** | yes | 2.9% + 30¢ | none — it's the rail `/api/checkout` already uses |
| **Embedded Payment Element, keyed** (seller types card) | no (keyed) | yes | yes | 2.9% + 30¢ | none — `/api/storefront/checkout` already does this |
| **Server-driven Terminal** + Stripe Reader S710 | yes | yes (backend only) | yes (`Stripe-Account` header; reader registered on the seller's account) | 2.7% + 5¢ | $299 reader (+$10/mo LTE); Express has no Terminal UI so we register readers via API |
| Terminal **JS SDK** in the browser | yes | technically | yes | 2.7% + 5¢ | needs reader on the same LAN + Chrome 142 local-network prompt; Stripe now recommends server-driven instead |
| **Tap to Pay** (iPhone/Android) | yes | **no** — native SDK only (iOS/Android/React Native, RN SDK still beta) | yes | 2.7% + 5¢ + 10¢ | Apple entitlement + App Store review + Expo prebuild; each seller accepts Apple ToS |
| Bluetooth Reader M2 | yes | **no** — native only | yes | 2.7% + 5¢ + $59 | same native app requirement |

**MVP rail — "QR pay" + keyed fallback + cash.** The customer scans a QR on the seller's phone and pays with Apple Pay / Google Pay / card in a Stripe-hosted page branded as the seller's store; or the seller keys the card in; or takes cash. Zero hardware, zero entitlements, sandbox-testable, and it reuses the exact reservation → Checkout Session → `fulfill()` chain that already sells items online. The price is the online fee rate (≈+0.2% +25¢ vs card-present) — a fair trade for shipping this in weeks, not quarters.

**V2 rail — server-driven Terminal (S710).** Sellers who want card-present pricing or a tap-the-card experience buy an S710; we register it on their Connect account, and "Checkout in person" pushes the PaymentIntent to the reader (`POST /v1/terminal/readers/{id}/process_payment_intent` with `Stripe-Account`). Confirmation via `terminal.reader.action_succeeded` + `payment_intent.succeeded` on the Connect webhook. Fully testable with Stripe's simulated reader + `present_payment_method` test helper.

**V3 rail — Tap to Pay in the Expo app** (`@stripe/stripe-terminal-react-native`, prebuild, Apple entitlement). Start the Apple entitlement request early if this is wanted; it gates everything.

**Take a payment (MVP, QR).**
1. `POST /api/store/market/checkout {itemId, clientKey, tender:"qr"}` → verify ownership + sellable + `getSellerPayments(slug).chargesEnabled`; `reserveItemForMarket(itemId, "market-<checkoutId>", 900s)` (atomic, 409 if lost); insert `market_checkouts` (`awaiting_payment`, `amount_cents` = current price, `expires_at = now()+15m`); create the Checkout Session on the connected account with `Idempotency-Key = "market-cs-<checkoutId>"`:
   `mode=payment`, `line_items=[{price_data:{unit_amount, currency, product_data:{name:title, images:[img]}}, quantity:1}]`, `payment_method_types` from `getCheckoutMethods(slug)` (card → Apple/Google Pay automatically), `payment_intent_data:{application_fee_amount, metadata:{channel:"market", market_checkout_id, item_id, seller_id}}`, `metadata` same, **no** shipping/address collection, `customer_creation:"if_required"`, `expires_at = now()+30m` (Stripe minimum), `success_url = https://getvya.ai/pay/done`, `cancel_url = https://getvya.ai/pay/cancel`. Store `stripe_checkout_session`. Return `{checkout, payUrl}`.
   If the same `clientKey` exists → return the existing row (idempotent double-tap). If an `awaiting_payment` checkout already exists for the item → 409 "resume it".
2. The Checkout screen renders `payUrl` as a QR (`qrcode` is already a dependency) with a **Share link** button (Web Share API → AirDrop/iMessage) for customers who can't scan.
3. **Confirmation — independent, idempotent paths converging on `finalizeMarketSale(checkoutId, paymentIntentId, source)`:**
   - **Webhook** (`/api/webhooks/stripe-connect`, already receives connected-account events, signature-verified by the SDK): on `checkout.session.completed` / `payment_intent.succeeded` with `metadata.channel = "market"` → `finalizeMarketSale`. The existing generic `fulfill()` is *not* run for market intents — the market finalize calls the same post-sale helpers minus shipping.
   - **Poll**: the Checkout screen polls `GET /api/store/market/checkout/[id]` every 2 s. If still awaiting after 10 s the server retrieves the Session (`payment_status`) directly — so a delayed webhook never stalls the seller.
   - **Cron** `reconcile-market-checkouts` (every minute): for open checkouts past `expires_at` → retrieve the Session; if paid → finalize; else expire the Session (`POST /v1/checkout/sessions/{id}/expire`) + release the reservation. Also re-runs finalize for `paid` checkouts lacking `order_id` (crash repair).
4. `finalizeMarketSale`: atomic claim `awaiting_payment|canceled|expired → paid` setting `stripe_payment_intent` (unique) → `markSold(itemId)` → if won: `createPaidOrder({channel:"market", tender, stripePaymentIntent, marketSessionId, marketCheckoutId, amountCents, feeCents})` (unique on `stripe_payment_intent`, so a retry after a crash conflicts → fetch existing), `recordPayout`, `recordEvent("purchase", surface:"market")`, `delistEverywhere`, `creditConsignedSale`; if `markSold` returned null (sold elsewhere while our reservation had expired) → `paid_conflict`, **auto-refund the PaymentIntent** (reuse the order refund helper, idempotent), ops alert, red UI. The payment claim happens first because the money is the fact; the item transition second; the cron repairs a crash between them.

**Keyed fallback** (`tender:"keyed"`): same checkout row; instead of a Session, create a PaymentIntent on the connected account (`Idempotency-Key = "market-pi-<checkoutId>"`, `application_fee_amount`, metadata as above) and render the existing embedded `PaymentElement` on the seller's phone; confirm client-side; the same webhook/poll paths finalize. Use only when the customer can't scan.

**Cancel**: `POST .../cancel` → `awaiting_payment → canceled`, expire the Session (or cancel the PI), `releaseReservation`. A payment that still lands (customer paid in the same second) → `paid_late` → same finalize; if the item is gone → `paid_conflict` + auto-refund.

**Refunds (MVP)**: the existing order refund endpoint (`/api/store/orders/[id]`) already refunds on the connected account, reverses the application fee, and relists — exposed as a **Refund** button in Sales today. `charge.refunded` arriving from an out-of-band Stripe-dashboard refund already unwinds via `unwindByPaymentIntent`.

**Receipts**: Stripe emails a receipt automatically if the customer entered an email on the Checkout page (Apple Pay supplies it). Seller-facing copy: "Receipt sent to their email." V2: VYA-branded receipt / SMS.

**Payments disabled / Stripe down**: `chargesEnabled=false` → Home banner + cash-only; Session creation failure → checkout row `failed` with reason, reservation released, UI "Couldn't start card payment — try again or take cash."

## E. Inventory architecture

- Sell path uses the existing lock: `reserveItemForMarket` (`active|draft → reserved`, buyerRef `market-<checkoutId>`, 15-min TTL). While reserved, the storefront, marketplace `/checkout`, offers, and a second market device all get 409 — "Reserved for an in-person checkout on <device label> — cancel it there to sell here."
- Online sale first → item is `reserved/sold` → market Confirm screen shows "Sold online 3 min ago" and disables checkout (it re-fetches status on open and every 5 s while visible).
- Two devices same item → second `reserveItemForMarket` returns null → 409 with the holder's device label; the first device's checkout is unaffected.
- Expiry: `reconcile-market-checkouts` cron expires checkouts (`awaiting_payment → expired`) and releases the reservation; the existing `release-expired-reservations` cron is a backstop.
- Price edit on Confirm → `PATCH /api/store/items/[id]` (existing) **before** the checkout is created; the checkout snapshots `amount_cents` and the Stripe Session is created for exactly that amount. Changing the price after starting a checkout requires cancel → restart (UI enforces).
- Removed/archived items: not sellable (guards). Sold items: terminal. Items without price (0): Confirm blocks with inline price entry. Items without image: allowed (Find Item can't match them; search can).

## F. AI architecture (photo → listing)

1. **Index**: `item_embeddings` — one Voyage `voyage-multimodal-3` vector per item (first image). Built by a cron `embed-item-index` (batched via `embedImages`, respects `rate_limited` vs `bad_image`) and incrementally on item create/update-images (fire-and-forget). Market Setup shows "N items indexed / M with photos" and a **Index now** button that runs the seller's backlog inline (bounded).
2. **Query** `POST /api/store/market/match` `{image: dataURL (client-resized to ≤1024px JPEG ~150 KB), sessionId?}`: embed the query (one Voyage call, ~0.5–1 s), cosine against the seller's `active|draft` embeddings in JS (hundreds of vectors — fine; pgvector when a seller passes ~5k), prefer bring-list items with a small boost (+0.02), return top 5 with scores and the item cards.
3. **Thresholds** (constants in `app/lib/market/match-core.ts`, env-overridable, calibrated in Phase 3 against a labeled sample from `training_examples`/real seller photos): `HIGH = 0.88` with margin ≥ 0.06 over #2 → "We found it"; `MEDIUM = 0.72` → "Which one is this?" (up to 5); below → "No confident match". Sold items are excluded from the index query but shown greyed if they're the top hit ("This looks like X — sold 2h ago") to catch duplicates.
4. **Always a manual path**: `GET /api/store/market/search?q=` — server ILIKE/trigram over the seller's own items (title, brand, size, SKU number, category), returns in <100 ms; the search bar is on the Find screen from the start and the Confirm screen has "Not this item".
5. **Never auto-checkout on a match.** Even "We found it" requires the seller to tap Checkout on the Confirm screen (the confirmation *is* the seller's tap). V2: Claude vision re-rank of the top 5 when scores are close.
6. **Quick List extraction**: `draftListing([blobUrl], voice?, hint:"Be brief — market quick list; return title ≤ 60 chars")` → title, brand, category, size, condition, era, material (with confidences) → form; price is the seller's (prefill `priceHint` as a placeholder only). One Blob upload via the existing `/api/store/assets` (HEIC handled). Embedding for the new item is computed inline so it's findable immediately.

## G. API architecture (all under `app/api/store/market/*`, auth = `resolveStoreSlugAny` unless noted)

| Method + path | Purpose |
|---|---|
| `GET/POST /mode` | read/set `store_market_mode` |
| `GET /home` | status strip + today's totals + inventory counts (one round trip) |
| `GET /session` · `POST /session` · `POST /session/close` | current open session / create-rename-set-location / close |
| `GET/POST/DELETE /session/items` | bring list |
| `GET /readiness` | the Setup checklist |
| `GET /search?q=` | manual item search (own items) |
| `POST /match` | photo → candidates |
| `GET /inventory?view=available|sold` | at-this-market lists |
| `POST /checkout` | start (reserve + checkout row + Session/PI) — idempotent on `clientKey` |
| `GET /checkout/[id]` | state (+ lazy Session retrieve after 10 s) |
| `POST /checkout/[id]/cancel` | cancel + expire Session + release |
| `POST /checkout/[id]/cash` | finalize as cash |
| `POST /checkout/[id]/keyed` | create PI + client secret for the embedded Payment Element |
| `POST /quick-list` | photo(s) → AI draft (no item yet) |
| `POST /quick-list/create` | create item (+embedding); returns item; optional `startCheckout` |
| `GET /sales?session=` | today's orders + totals |
| `GET /payments-status` | `chargesEnabled` + checkout methods (reuses `getSellerPayments`) |
| **Public** `GET /pay/done` · `GET /pay/cancel` | customer-facing static "Paid — show this to the seller" / "Canceled" pages (in `PUBLIC_ROUTES`) |
| **Existing** `POST /api/webhooks/stripe-connect` | add the `metadata.channel = "market"` branch → `finalizeMarketSale` |
| Cron `GET /api/cron/reconcile-market-checkouts` (1 min) · `embed-item-index` (hourly) | `CRON_SECRET` header, fail closed |

Server libs: `app/lib/market/{mode-db,sessions-db,checkout-db,checkout-core,stripe-market,match-core,match-db,embeddings-db,sales-db,readiness}.ts`. Pure `-core` modules carry the tests.

## H. Security

- Store authorization on every route via `resolveStoreSlugAny` → seller; every item/checkout/session is checked for `seller_id` match; 404 (not 403) on foreign ids.
- No new credentials: all Stripe calls use the platform key + `Stripe-Account`; the seller's account id comes from `seller_payments`, never from the client.
- The QR/pay URL is a Stripe-hosted Checkout URL (unguessable, 30-min expiry, single use). The `/pay/done` page shows nothing sensitive; the seller's screen — not the customer's — is the source of truth for "paid."
- Webhooks: Stripe SDK signature verification (existing); no ordering assumptions (every handler is "observe payment state → try transition"); the unique index on `stripe_payment_intent` makes duplicate delivery harmless.
- Replay/duplicate requests: `client_key` unique per seller for checkout start; Stripe `Idempotency-Key` derived from the checkout id on every create; state-guarded transitions everywhere.
- Multi-session/multi-device: server state; device label recorded on the checkout for the "who holds it" message.
- Session expiry mid-sale: the checkout page's poll gets 401 → banner "Signed out — sign in to continue (your checkout is safe)"; the checkout keeps reconciling server-side regardless.
- Audit: `market_checkout_events` append-only; `orders` + `api_costs` (existing cost tracker) for AI spend.
- Admin preview (`?store=`) works read-only for Market Mode screens; checkout start is blocked in preview (same guard as add-listing's "wrong store" fix).

## I. Error handling (seller-visible copy in quotes)

| Situation | System behavior |
|---|---|
| Card declined on the customer's phone | Stripe Checkout lets them retry in place; nothing reaches us until success. If they give up, the seller taps **Cancel** → `canceled`, released. "No inventory changes were made." |
| Customer changes mind | **Cancel** → `canceled`, Session expired, reservation released; item available immediately. |
| Seller's network drops after the customer paid | Stripe still has the payment; the seller's page shows "Waiting for Stripe…"; on reconnect the poll or cron finalizes. Never marks sold on click. |
| Payment succeeded, webhook delayed | poll retrieves the Session directly after 10 s; page flips to SOLD. |
| Seller retries and starts a second checkout | refused while one is `awaiting_payment` for the item ("resume it"); a canceled checkout's Session is expired at Stripe, so the old QR can't be paid twice. |
| Inventory marked sold but payment failed | impossible by construction: sold only after a verified COMPLETED payment (or explicit cash). |
| Payment succeeded but inventory update failed | checkout is `paid` without `order_id`; reconcile cron re-runs finalize; if the item became unsellable → `paid_conflict` + alert. |
| Stripe charges disabled (onboarding incomplete, restricted) | Home banner; QR/keyed start returns 409 `payments_disabled`; cash still works. |
| Stripe API unavailable | Session creation fails → checkout `failed`, reservation released, "Try again or take cash"; verification retries with backoff. |
| Phone dies | server expires the checkout at 15 min if no payment; if the payment exists, reconcile marks it sold — the seller sees it in Sales today on any device. |
| Refresh during checkout | URL has the id; state reloads from the server. |
| No AI keys configured | Find item shows search-only; Quick list shows the manual 3-field form. |
| Blurry/dark/multiple items | Voyage still returns a vector; low scores → "No confident match — try a closer shot of the label or search". Tip strip shows "Fill the frame with one item". |

## J. Mobile/device behavior

iPhone Safari and Android Chrome are the primary targets; iPad works identically (QR is even easier to scan from a tablet). `capture="environment"` opens the rear camera directly; file input fallback for desktop. The QR is rendered at ≥ 240 px with max screen brightness hint ("Turn up brightness"); the customer's phone camera handles the rest — no app switching on the seller's side at all. Screen-wake: request `navigator.wakeLock` on the Checkout screen. Landscape is supported but not optimized.

## K. Testing

- **Unit (node --test, pure)**: `checkout-core` state machine (every transition, illegal transitions rejected, concurrent-claim simulation returns exactly one winner), Checkout Session/PI param builders (fee, metadata, no shipping), `match-core` thresholds and margin logic, `inventory-core` `draft→reserved`, readiness computation, sales totals.
- **Integration (DB, run manually against a scratch Neon branch — the repo has no DB test harness)**: two concurrent `reserveItemForMarket` → one 409; finalize called 3× (callback+webhook+poll) → one order; finalize after cancel → `paid_late`; expiry releases reservation; refund webhook relists.
- **Payment (Stripe test mode, fully automatable)**: test-mode connected account; `stripe trigger`/CLI-forwarded webhooks; cases: happy path (4242), decline (4000…0002) then success, cancel before pay, cancel-then-pay race (`paid_late`), webhook delivered twice, webhook + poll race, crash between claim and order (cron repair), refund → relist, expired Session. V2 Terminal: simulated reader + `present_payment_method`.
- **E2E (Playwright, already a devDependency)**: mode toggle + nav swap, search → confirm → cash → SOLD → inventory reflects; quick list → cash sale.
- **Failure recovery**: cron reconcile against a checkout whose finalize was interrupted (simulate by inserting `paid` without `order_id`).

## L. Migration / backward compatibility

All schema is additive with defaults; `orders.channel` defaults `'online'` so every existing order and query is unchanged. No change to `items` semantics except the new `draft→reserved` transition, which only `reserveItemForMarket` uses. Market Mode is invisible until toggled. The online Stripe checkout is untouched except for the `metadata.channel` branch in the Connect webhook and the new unique index on `orders.stripe_payment_intent` (which only makes an already-assumed invariant enforced). Drizzle `schema.ts` gains the new `orders` columns (and `db:push` remains optional thanks to the lazy `ensure*`).

---

## M. Edge-case audit (expected behavior)

| Case | Behavior |
|---|---|
| Item sold online while seller at market | item `sold`; Confirm shows "Sold online" and blocks; Find may still show it greyed as a duplicate hint. |
| Sold in person while an online buyer is mid-checkout | online buyer holds the reservation → market start gets 409 "Reserved by an online checkout (expires in N min)". If the online reservation expires unpaid, the market sale can proceed. |
| Two sellers/devices, same item | one reservation wins; loser sees who holds it. |
| Duplicate payment request | `clientKey` idempotency; a second checkout for an item with an open one is refused. |
| Payment succeeds, webhook delayed | callback or poll finalizes first; late webhook is a no-op (claim fails, `event_id` deduped). |
| Payment succeeds, app crashes | reconcile cron finalizes; visible in Sales today. |
| Crash after inventory update, before UI | UI reloads from server → SOLD. |
| Inventory update ok, payment response lost | not possible (payment first). |
| Stripe disabled / unavailable | cash-only mode / retry copy. |
| Seller's internet gone | customer's phone pays over *their* network; ours reconciles when back; offline banner, no optimistic SOLD. Cash sales queue is Future. |
| Battery dies | server-side expiry or reconcile. |
| Refresh during checkout | id in URL; state from server. |
| Checkout pressed twice | idempotent on `clientKey`; button disabled after first tap. |
| AI wrong / multiple / none | seller confirms; "Not this item"; candidates; search + Quick list fallback. |
| Product has no image / no price | searchable but not matchable; price must be entered on Confirm. |
| Missing required data | only `title` is DB-required; Quick List guarantees a non-empty title (`"<brand> <category>"` or `"Market item"`). |
| Already sold / archived / reserved | blocked with reason. |
| Variants / multiple quantities | sells the whole listing (documented; readiness warns). |
| Discount | seller edits the price on Confirm before checkout; the order records the charged amount. V2: quick "−10%" chips. |
| Price changed just before checkout | checkout snapshots the amount at start; a later edit requires cancel/restart. |
| Multiple markets | one open session at a time (unique index); Setup closes/opens. |
| Seller has multiple Stripe accounts | not possible — one Connect account per store slug. |
| Multiple devices logged in | shared server state; device label on checkouts. |
| Market Mode turned off mid-sale | checkout URL still works; nav returns to normal. |
| Browser exited | same as crash. |
| Refund | Refund button (existing endpoint: refund on connected account, fee reversed, item relisted); dashboard refunds unwind via `charge.refunded`. |
| Receipt | Stripe's email receipt when the customer supplies an email (Apple Pay does). |
| Partial payment | impossible — a Session is paid in full or not at all; keyed PI likewise. |
| Declined / canceled / timeout | `failed` / `failed` / `expired`; inventory released. |
| Webhook twice / out of order | dedupe + state-guarded transitions; only COMPLETED/FAILED/CANCELED matter and each is idempotent. |

## N. MVP / V2 / Future

**MVP**: D1–D7 as recommended; mode toggle + market nav + bottom bar; Home; Find item (photo match + search); Confirm (inline price); Checkout via Stripe Checkout QR (+ share link) with webhook + poll + cron reconcile + cancel/expiry; keyed-card fallback; cash tender; Refund button; Quick list (photo → AI fields → price → list & checkout); Sales today with totals; At-this-market inventory; Setup with session, bring list, readiness, index-now, test payment; reconcile + embedding crons.

**V2**: server-driven Stripe Terminal with S710 (reader registration on the seller's account, `process_payment_intent`, simulated-reader tests); discount chips; VYA-branded receipt / SMS; Claude re-rank on close matches; variant picker; multi-item cart (one payment, N items); per-session analytics (by brand/category, sell-through of the bring list); printable item QR codes for instant lookup.

**Future**: Tap to Pay in the Expo app (Apple entitlement); pgvector index; offline-first PWA queue for cash sales; consignor-aware market payouts; market calendar + prep reminders; multi-staff sessions with per-staff sales.

---

## O. Implementation plan (dependencies, deliver phase-by-phase; each phase ends with a test note and a stop)

**Phase 1 — Mode, shell, data model, cash sales.**
`store-market-mode`, `market_sessions(+items)`, `market_checkouts(+events)`, `orders` columns + unique PI index; `checkout-core` + `checkout-db` with `reserveItemForMarket` and `finalizeMarketSale` (cash path); layout toggle + market `GROUPS` + bottom bar; Home, Inventory, Confirm, Checkout (cash), Sales today (+ Refund via existing endpoint), Setup (session + bring list + readiness). Tests: state machine, transitions, totals. Manual: toggle, sell an item for cash, see it SOLD on the storefront and in Orders.
Depends on: nothing.

**Phase 2 — Stripe QR + keyed checkout.**
`stripe-market` (Session/PI builders with fee + metadata), `/checkout` qr/keyed paths, `/pay/done|cancel` pages, Connect-webhook `channel=market` branch, lazy Session retrieve on poll, `reconcile-market-checkouts` cron, cancel/expiry, `paid_conflict` auto-refund, readiness "test payment". Tests: builders, triple-finalize, cancel-then-pay, crash repair; Stripe test-mode end-to-end with CLI-forwarded webhooks.
Depends on: 1.

**Phase 3 — Photo matching.**
`item_embeddings` + `embed-item-index` cron + on-create hook, `/match`, `match-core` thresholds, Find screen with camera. Calibration pass on ~50 labeled photos; record precision at each threshold in the spec. Tests: thresholds/margins, matcher exclusions.
Depends on: 1.

**Phase 4 — Quick list.**
`/quick-list` (draft via `draftListing`, brief hint), `/quick-list/create` (sanitize → `createItem` → embed → optional checkout), Quick screen. Tests: title fallback, sanitizer reuse, draft-vs-active rule (D4).
Depends on: 1, 3 (embedding on create).

**Phase 5 — Hardening & final review.**
Concurrency drills on a Neon branch, device matrix (iPhone Safari, Android Chrome, iPad), wake-lock, session-expiry banner, rate limits, ops alerts for `paid_conflict`, "500 sellers tomorrow" review (cron durations, Voyage rate limits, webhook burst, Stripe rate limits on Session creation), docs update (`architecture.md` §9.4 + CLAUDE.md pointer).

Estimated new code: ~20 files, ~3–4k lines including tests; no changes to existing behavior outside the layout toggle, `inventory-core` transitions, the Connect-webhook market branch, and additive `orders` columns.
