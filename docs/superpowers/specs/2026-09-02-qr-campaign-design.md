# Printed QR codes + the New York campaign page

Design, 2026-09-02.

Two printed QR codes, managed as rows in Neon rather than in code, and an ungated Fendi
page for the New York event that converts scanners into accounts instead of turning them
away at the waitlist.

## Why

The pilot marketplace is gated: no session and no `via_access` cookie means the login wall,
and a fresh signup sits at `pending` for seven days ([app/api/pilot-check/route.ts](../../../app/api/pilot-check/route.ts)).
That is correct for cold traffic and wrong for someone standing in front of the rail holding
their phone. The QR is the one moment we have their attention, and the current wall spends it.

## What already exists

Built and verified before this design (scan tracking, phase 0):

- `qr_scans` table + `app/lib/qr-scans-db.ts` — one row per scan, with city/region/country and
  a lat/lon pin from Vercel's edge headers. Live in Neon.
- `app/q/[code]/route.ts` — logs the scan, redirects, never dead-ends on an unknown code.
- `app/lib/qr-codes.ts` — pure helpers: code normalisation, bot filtering, safe destinations.
- `scripts/make-qr.mts` (PNG + SVG) and `scripts/qr-scans.mts` (where scans happened).
- `/q` added to `PUBLIC_ROUTES` and to the `getvya.ai` passthrough list in `proxy.ts`.

Reused rather than rebuilt:

- [SignUpProvider](../../../app/components/SignUpProvider.tsx) is already mounted in the root
  layout and exposes `openModal(targetUrl, { required })`.
- [SignUpModal](../../../app/components/SignUpModal.tsx) already offers Google and the Resend
  magic link, and already takes a `callbackUrl`.

## Decisions

| Decision | Choice | Who |
|---|---|---|
| Codes live where | A `qr_codes` table in Neon, editable without a deploy | user |
| Signup methods | Google **and** magic link | user |
| Access after signup | Full marketplace access immediately, skipping the 7-day wait | user |
| Ungating reach | The campaign page and the products on it — not the whole site | user |
| Which actions gate | Favorite, Add to cart, **and** Buy now | user, after I argued for leaving Buy now open |
| Campaign expiry | Present — the campaign closes on a date | me, unopposed |

## Architecture

### 1. `qr_codes` in Neon

```
qr_codes (
  code         TEXT PRIMARY KEY,   -- 'getvya', 'fendi-ny'
  label        TEXT NOT NULL,      -- 'Business card', 'Fendi / New York'
  destination  TEXT NOT NULL,      -- full URL, allowlisted host
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

`app/lib/qr-codes-db.ts` reads it behind a short per-instance cache, using the same `once()`
and `isDuplicateObjectError` guards as `qr-scans-db.ts` — that concurrency bug is already
paid for, and repeating the boolean-flag pattern would reintroduce it.

`app/lib/qr-codes.ts` keeps the pure logic, with one change. Today it forces every
destination onto `https://getvya.ai`. The Fendi code points at `vyaplatform.com`, so the
single-origin rule becomes a **host allowlist** (`getvya.ai`, `www.getvya.ai`,
`vyaplatform.com`, `www.vyaplatform.com`). A destination outside it is rejected when written
and ignored when read.

Failure behaviour, in priority order — a printed code must never dead-end:

1. Row found, destination allowlisted → redirect there.
2. Row missing, inactive, or destination not allowlisted → getvya.ai homepage.
3. Database unreachable → getvya.ai homepage, scan unlogged.

Managed by `scripts/qr-codes.mts` (`list`, `set <code> <url> <label>`, `off <code>`). No admin
UI; the user chose scripts over a screen.

### 2. The two codes

| Code | Destination |
|---|---|
| `getvya` | `https://getvya.ai/` |
| `fendi-ny` | `https://vyaplatform.com/brands/fendi/newyork` |

Both get a PNG and an SVG from `scripts/make-qr.mts`.

### 3. The public campaign page

New route `app/brands/[slug]/[campaign]/page.tsx`, rendering the existing Fendi grid with a
campaign flag. Campaigns are a small config (`app/lib/campaigns.ts`): slug, brand, label, and
an **expiry date**.

Gating needs a dedicated predicate, not a `PUBLIC_ROUTES` entry. `isPublicRoute` matches by
prefix, so adding `/brands` would make every brand page on the marketplace public. Instead:

```
isCampaignRoute(pathname) → /^\/brands\/[^/]+\/([a-z0-9-]+)$/ AND campaign is configured AND not expired
```

Landing on it sets a `via_campaign` cookie (signed, expiring with the campaign).

### 4. Products reached from that page

Middleware lets `/products/*` through when `via_campaign` is valid. The product page then
checks the piece's inferred brand against the campaign's brand (`inferBrandFromTitle`, the
canonical helper) and shows the signup wall if it does not match.

The brand check cannot live in middleware — it needs a database read per request. Splitting it
this way keeps middleware cheap while keeping the restriction real: without the page-level
check, a campaign cookie would silently open every product on the marketplace, which is the
"follows them while they browse" option the user explicitly did not choose.

### 5. The three gated actions

| Action | Today | After |
|---|---|---|
| Favorite | `router.push("/login")` ([FavoriteButton.tsx:105](../../../app/components/FavoriteButton.tsx#L105)) | `openModal()` with the intent in the callback URL |
| Buy now | Leaves the site to the seller via `/api/track` | Modal first, then continues to the seller |
| Add to cart | **No auth check at all** | Modal first, then adds |

Add to cart is a genuinely new restriction, not a redirected one. Flagging it because it will
read as a regression to anyone testing the normal marketplace: the gate must be scoped to
campaign pages, never applied site-wide.

Intent rides in the URL — `/products/123?do=favorite` — and replays client-side once after
sign-in. Auth.js carries `callbackUrl` through both providers, so this works for Google and
for a magic link opened in a different browser, with no server-side pending-action table.

### 6. Immediate approval

`pilot-check` sees a valid `via_campaign` cookie and creates the entry as `approved` rather
than `pending`, setting `via_access`.

## Security

**This is a deliberate hole in the pilot gate.** The QR resolves to a plain URL that anyone
can read off the printed code, photograph, or post online. Nothing binds it to New York or to
the event weekend. Once out, anyone who visits it can create an account and get permanent full
marketplace access, bypassing the approval everyone else waits seven days for. The user chose
this knowingly.

Two things bound the damage:

- **Expiry.** The campaign carries a date. Past it, `isCampaignRoute` returns false, the page
  gates itself again, and `pilot-check` stops auto-approving. The hole closes without anyone
  remembering to close it.
- **Flagging.** Accounts created through the flow are tagged campaign-sourced, so they can be
  reviewed or revoked in bulk.

Carried over from phase 0 and not to be regressed: destinations are host-allowlisted (a bad
row cannot make a printed card an open redirect), the code segment is stripped to a plain slug
before it reaches a query string or a DB row, and `safeNext` in `pilot-check` already rejects
protocol-relative redirects.

## Phases

Each phase ships and is testable on its own. Stop after each; do not start the next without
a go-ahead.

**Phase 1 — codes in Neon.** `qr_codes` table, `qr-codes-db.ts`, host allowlist, the two rows,
`scripts/qr-codes.mts`, regenerated images.
*Test:* `scripts/qr-codes.mts list` shows both. Scanning `getvya` lands on getvya.ai; scanning
`fendi-ny` lands on the Fendi page (still gated — that is phase 2). `scripts/qr-scans.mts`
shows both scans with a city. Repointing a row changes where the same printed code goes,
with no deploy.

**Phase 2 — the public page.** `app/lib/campaigns.ts`, the campaign route, `isCampaignRoute`,
the `via_campaign` cookie, product access with the brand check.
*Test:* In a private window with no session, `vyaplatform.com/brands/fendi/newyork` renders the
grid. A Fendi piece from it opens. A non-Fendi product does not. `/brands/prada` still gates.
After the expiry date, the campaign page gates again.

**Phase 3 — signup and approval.** The three buttons, intent replay, campaign-sourced approval.
*Test:* Logged out on the campaign page, each of the three actions opens the modal instead of
the login wall. Google returns signed in and the action completes. A magic link opened in a
different browser also completes it. The new account has full marketplace access with no
pending wait, and is tagged campaign-sourced. On a normal (non-campaign) product page, all
three behave exactly as they do today.

## Settled after review

**Intent replay via `callbackUrl`** — approved by the user, 2026-09-02. No pending-action
table. The note rides in the return address (`/products/123?do=favorite`), which both Google
and the magic link already carry. The replayed action is still authorised server-side: `?do=`
is a reminder, never a permission slip.

**Campaign expiry: 90 days from launch.** There is no event end date yet. Defaulting to a date
rather than to "open forever" means the pilot-gate hole closes on its own if nobody revisits
it. One line in `app/lib/campaigns.ts` — set the real date when known, extend it, or set it to
`null` for a deliberately permanent campaign.

## Out of scope

- An admin screen for codes or scans — scripts only, by choice.
- Backfilling the existing `QR_CODES` config into the table beyond the two codes above.
- Sweeping the boolean-flag `ensureTable` race in the other `*-db.ts` modules. The same latent
  bug exists there; fixing it was offered and not taken up, and it is not this feature's job.
- GPS-precise scan location. Scan location stays IP-derived and city-level.

## Risks

- **Magic link in a webview.** Opening the email in a mail-app browser creates the session
  there. The action replays correctly, but the person may not realise they are signed in back
  in Safari. Acceptable; worth watching at the event.
- **Bot traffic on a public page.** The campaign page is crawlable and unauthenticated. Scan
  logging already filters bots; the page itself does not need to.
- **Buy now friction.** Gating an action that completes off-site will cost some conversions at
  the event. Raised, and the user chose to gate it anyway.
