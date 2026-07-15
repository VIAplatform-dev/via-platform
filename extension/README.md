# VYA Cross-Lister (browser extension)

Two jobs, both by automating the seller's own logged-in browser session — no marketplace API, no
stored passwords, the seller only ever acts as themselves:
1. **Cross-list** VYA inventory to **Depop** (fills the sell form; the seller publishes).
2. **Sync engagement** — reads the **like counts** off the seller's own Depop/Poshmark pages and
   reports them to VYA, so the cross-listing dashboard's roll-up shows likes per item alongside
   eBay (API) and VYA-native offers. This is how "no-API" channels get stats into one dashboard.

## How it works
```
VYA (vyaplatform.com)                 Extension                         Depop (seller's session)
─────────────────────                 ──────────                        ───────────────────────
/api/extension/queue   ──items+copy──▶ background.js ──FILL_LISTING──▶  content/depop.js
  (active listings,                     popup.js (UI)                     fills photos/caption/price
   Depop-formatted)                                                       seller confirms & publishes
/api/extension/report  ◀──listed+URL── background.js ◀─DEPOP_PUBLISHED─  (captures product URL)
```

- **Semi-automated on purpose:** the extension fills photos, caption (+hashtags) and price, then the
  seller confirms category/size/condition and hits **Publish**. This is safer and dodges the
  bot-detection that full auto-submit trips.
- Once published, the content script reads the new product URL and reports it back, so VYA's
  cross-listing board and delist-on-sale know where the item lives.

## Load it (unpacked, for testing)
1. Chrome → `chrome://extensions` → toggle **Developer mode** (top right).
2. **Load unpacked** → select this folder (`via-extension`).
3. Log into **vyaplatform.com** in the same browser (the store portal).
4. Click the extension icon → your active VYA listings appear → **Fill on Depop**.

## ⚠️ What still needs a live-DOM pass
The plumbing (auth, queue, photo injection, React value-setting, publish capture) is production-grade.
The **Depop form selectors** in `src/content/depop.js` (`SEL`) are best-effort and must be verified
against Depop's *current* sell page — they change their UI. Confirm/finish:
- `photoInput`, `description`, `price` selectors
- **category / size / condition** pickers (Depop uses custom dropdowns — need bespoke handlers)
- the published-URL pattern in `watchForPublish()`

## Syncing likes (engagement)
Passive by design — the content script reads counts off pages the seller is already viewing:
- On a **product/listing page** → that one item's like count.
- On the seller's **shop/closet page** → every item's card in one pass (best — the popup's
  **Sync likes** button just opens that page for you).

Each scraped count is attributed to a VYA item via `/api/extension/listings` (marketplace listing
URL → VYA item id) and POSTed to `/api/extension/report` as `{ platform, itemId, stats:{ likes } }`.
We never auto-click, submit, or open more than the one shop page — same act-as-yourself stance as
listing. Poshmark stats need a stored Poshmark listing URL per item (from a future Poshmark
listing-capture); until then its scanner finds no matches, but the pipeline is wired.

## Marketplaces
- **Depop** — lists (fill form) + reads likes. Product-page like selector `[data-testid="like-count"]`
  is **verified** against live DOM (2026-07); the shop-grid card selector is best-effort.
- **Poshmark** — lists (fill form) + reads likes/offers. Sell-form and like-count selectors are
  **best-effort** (the public listing shows a Like button but no count, so the count location needs a
  logged-in-owner pass); the listing URL + attribution are solid, and publishing captures the URL
  which is what unlocks Poshmark stat attribution.

Each marketplace = one content-script adapter. For **listing**: the message contract
(`PING`, `FILL_LISTING` → `{ ok, needsReview }`, a publish watcher emitting `PUBLISHED` with
`{ platform, itemId, url }`). For **stats**: request `GET_LISTINGS`, match the current URL to an item,
send `REPORT_STATS`. `background.js` + the VYA endpoints stay generic — only a new
`src/content/<market>.js`, a `content_scripts` match, and a `CREATE_URL` entry are added.

## ⚠️ Selectors still needing a logged-in-owner pass
The Poshmark sell-form + like/offer selectors, and Depop's shop-grid card selector, are best-effort
and should be verified against the seller's live logged-in DOM. All attribution + reporting around
them is production-grade. Marketplace **offers** are read conservatively (only a clear on-page count)
— Depop offers live in DMs, so they usually won't show; VYA-native offers already populate the board.

## VYA backend (in the `via` repo)
- `app/api/extension/queue/route.ts` — GET active listings, Depop-formatted (reuses `crossPostContent`)
- `app/api/extension/report/route.ts` — POST `{ itemId, platform, status?, stats? }` → listing status and/or engagement
- `app/api/extension/listings/route.ts` — GET marketplace listing URL → VYA item map + the seller's handles
