# eBay sale notifications — a sale arrives in seconds

**Built:** 2026-09-07 (owner-audit item #4). **Status:** code complete and unit-tested; the live
subscription has not been made yet — it needs production env vars and the public URL (§3).

## 1. What was chosen, and why

eBay has two push mechanisms. We use the modern one and can also read the old one.

| | Commerce **Notification API** (chosen) | Trading API **Platform Notifications** (fallback, parse-only) |
|---|---|---|
| Sale event | Topic **`ORDER_CONFIRMATION`** — "sent to a seller when the buyer completes checkout and payment clears" (added in Notification API release 1.6.6, 2025-12-01) | `ItemSold` / `FixedPriceTransaction` / `AuctionCheckoutComplete` |
| Token | The **seller's user token** (authorization-code grant) with `sell.fulfillment` — the same scope our poll (`getOrders`) needs | Application-level `SetNotificationPreferences`; eBay must **whitelist** the app before it accepts OAuth tokens there |
| Transport | HTTPS POST, JSON, `x-ebay-signature` header (ECDSA over the body, public key from `getPublicKey`), up to 3 retries | SOAP POST, `NotificationSignature` = base64(md5(Timestamp + DevId + AppId + CertId)) |
| Future | The current platform | On the retirement path with the rest of the Trading API |

So `/api/webhooks/ebay` **subscribes through the Notification API** and verifies its ECDSA
signature; it will also accept and verify a Trading-style SOAP delivery if the app is ever
registered there (`EBAY_DEV_ID` needed for that). Either way the only thing a notification does is
call `syncMarketplaceSalesForStore(slug, now − 2h, ["ebay"])` — the same function the hourly cron
runs, which marks sold, delists elsewhere, credits the consignor and pushes her phone. Idempotency
is that function's; a replayed notification (same `notificationId`) is a no-op before it.

Sources read: eBay Notification API overview + release notes (`edp.ebay.com/api-docs/commerce/notification/…`),
createDestination / createSubscription / getPublicKey method pages, the
`eBay/event-notification-nodejs-sdk` source (`lib/validator.js`, `client.js`, `constants.js`),
KB 1201 (Trading signature), the OAuth refresh-token page (scope optional; defaults to the original
consent), and community threads on the 195020 challenge failure and destination `MARKED_DOWN`.

### A finding on the way
`app/lib/ebay.ts` asked eBay for `sell.inventory` + `sell.account` only. `getOrders`
(`/sell/fulfillment/v1/order`, which `getRecentEbaySoldSkus` calls) needs `sell.fulfillment`, so
for a store connected before today the hourly poll has been getting 403 and returning `[]`. The
scope is now in the consent list. **Stores connected before 2026-09-07 must reconnect eBay once**
(Settings › Marketplaces › Disconnect, then Connect eBay) to grant it. Their existing tokens keep
refreshing — the refresh call no longer names scopes, so eBay re-issues the original consent.

## 2. Files

- `app/lib/ebay-notify-core.ts` (+ test, 19) — challenge hash, signature verification (both schemes), payload parsing (both shapes), store-choice rule, the admin's one-line status.
- `app/lib/ebay-notify-receive.ts` (+ test, 16) — the request handling against an interface: authenticate → dedupe → resolve store → sync with a 20s cap → record. Never 5xx once authenticated.
- `app/lib/ebay-notify-setup.ts` (+ test, 14) — the idempotent subscribe flow against an interface.
- `app/lib/ebay-notify-db.ts` — real IO: `ebay_notifications` table, `notify_*` columns on `ebay_tokens`, sku / listing-id / eBay-user lookups, public-key cache, eBay API client, status, and the wiring of the two interfaces above.
- `app/api/webhooks/ebay/route.ts` — GET challenge, POST delivery. Public via the existing `/api/webhooks` entry in `proxy.ts`.
- `app/api/admin/ebay-notifications/setup/route.ts` — POST (or GET) `?store=` optional, admin cookie.
- `app/api/admin/ebay-notifications/status/route.ts` — GET, admin cookie.
- `app/api/cron/sync-ebay-sales/route.ts` — unchanged schedule (hourly, backstop); its JSON now carries `notifications: { summary, subscribed, of, lastReceivedAt }`.
- `app/infrastructure/admin/cross-listing/settings/page.tsx` — admin-only block "Instant eBay sale notifications": summary line, per-store errors, last 10 deliveries.
- `app/lib/ebay.ts` — `sell.fulfillment` added to consent scopes; refresh without `scope`; `ebayAppToken` / `ebayUserAccessToken` exported.

## 3. Env vars (Vercel › production)

| Var | Required | Notes |
|---|---|---|
| `EBAY_NOTIFY_VERIFICATION_TOKEN` | yes | 32–80 chars of `[A-Za-z0-9_-]`. Generate: `openssl rand -hex 24`. Falls back to `EBAY_VERIFICATION_TOKEN` (the account-deletion endpoint's) if unset — fine to reuse one value. |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | already set | App token for destinations and public keys. |
| `NEXT_PUBLIC_BASE_URL` | already set | The endpoint is `${BASE_URL}/api/webhooks/ebay`. Override with `EBAY_NOTIFY_ENDPOINT` only if the public URL differs. |
| `EBAY_NOTIFY_ALERT_EMAIL` | optional | eBay emails it when it marks the destination down. |
| `EBAY_DEV_ID` | optional | Only for verifying legacy Trading SOAP notifications. |

## 4. After deploy — by hand

```bash
# 0. sha256 of ADMIN_PASSWORD, as the proxy expects it
TOK=$(printf '%s' "$ADMIN_PASSWORD" | shasum -a 256 | cut -d' ' -f1)

# 1. Prove the challenge answers (any code; eBay's real one is random)
curl -s 'https://vyaplatform.com/api/webhooks/ebay?challenge_code=test'
#   → {"challengeResponse":"<64 hex>"}  (a 500 here = verification token not set)

# 2. Subscribe every eBay-connected store (idempotent — run again any time)
curl -s -X POST -b via_admin_token=$TOK https://vyaplatform.com/api/admin/ebay-notifications/setup | jq
#   destination.action: created | reused | re-enabled
#   stores[].action:    subscribed | already | re-enabled | failed (+ error sentence)
#   A store "failed … reconnect eBay" has a grant without sell.fulfillment → she reconnects, run again.
#   One store only:  …/setup?store=sourcedbyscottie

# 3. Status (also on Settings › Marketplaces as the owner)
curl -s -b via_admin_token=$TOK https://vyaplatform.com/api/admin/ebay-notifications/status | jq
#   summary: "on since 7 Sep 2026 · last received 3m ago"  |  "off — run setup"
```

Then sell a piece on eBay (or have a store do so). Within seconds `ebay_notifications` shows a
row with outcome `synced` and the piece is sold on VYA. The first real delivery also records the
payload's top-level `data` keys (never values) so the parser can be tightened if eBay's
`ORDER_CONFIRMATION` shape differs from what was assumed (`seller.username`, `lineItems[].sku`,
`lineItems[].legacyItemId`). Until it is matched by sku / listing id / user, a sale on a fleet of
≤ 10 connected stores syncs all of them ("broadcast") — exactly the hourly cron, brought forward.

## 5. If eBay marks the endpoint unhealthy

eBay retries a failed delivery up to 3 times, and after enough consecutive failures sets the
destination to `MARKED_DOWN` (and emails `EBAY_NOTIFY_ALERT_EMAIL` if set). Nothing is lost —
the hourly cron keeps syncing. To recover:

1. Check the endpoint answers: step 1 above, and `status` for `unknown-store` / `sync-error` rows.
2. Run setup again — it sees `MARKED_DOWN` and re-enables the destination in place
   (`updateDestination`), then re-checks every subscription.
3. If setup reports the destination still failing, the endpoint URL or verification token has
   changed: fix the env var, redeploy, run setup (a changed endpoint is updated on the same id).
4. If eBay has stopped delivering for the AppId entirely, that is a Developer Technical Support
   ticket — eBay's docs say so explicitly.

Outcomes in the log: `synced`, `replay` (never stored twice — the row keeps its first outcome),
`ignored` (a non-sale topic), `unknown-store`, `malformed`, `timeout` (sync capped at 20s; cron
catches up), `sync-error`. Unsigned or badly signed POSTs are answered 401 and not stored.

## 6. Not verifiable here

- The live destination + subscription (needs production keys and the public URL).
- A real `ORDER_CONFIRMATION` body — its `data` shape is inferred; the parser is deliberately
  forgiving and the broadcast fallback covers a miss.
- Whether eBay wants `sell.fulfillment` or its `.readonly` twin on the token; both are listed on
  the topic, the full scope is requested.
