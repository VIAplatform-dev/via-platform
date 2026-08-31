# Store analytics — backend map

The decision-grade analytics suite behind `/admin` → **Analytics**. One endpoint,
one resolved period, six sections. This file is the map: what the data actually
is, where each number comes from, and what is still missing.

---

## 1. The problem this layer solves

VYA records the same fact in more than one place, for historical reasons. A
metric that reads only one source is not merely incomplete — it is wrong:

| Fact | Lives in | Gotcha |
|---|---|---|
| A sale | `orders` **and** `items.status = 'sold'` | At the time of writing there are ~3,500 sold items and ~10 orders. An orders-only GMV reads ≈ zero for nearly every store. |
| A product view | `store_product_views` **and** `analytics_events` | The storefront beacon writes both. A naive union double-counts. |
| An item favourite | `analytics_events` only | See "Known issues" — the intended table can never be created. |
| A session + its source | `store_visits` | One row per session, source classified on arrival. |
| A page view | `store_pageviews` | Not session-gated. |
| A store's contact list | `store_customers` | Includes people who never bought. |

`views.ts` resolves this into **two Postgres views** that every metric module
reads. They are plain views (no materialisation, nothing to refresh) created
lazily once per lambda instance, in the same style as the capture tables.

### `vya_store_sales` — the sales ledger

```
orders (paid | shipped | delivered | fulfilled, paid_at not null)
  ∪
items (status = 'sold') that have no such order
```

Columns: `sale_id, seller_id, item_id, amount_cents, sold_at, buyer_email, origin`.

* The order wins when both exist — it carries the real amount and the buyer.
* An item-origin sale is valued at its list price and has no buyer email.
* `sold_at` is **NULL** when a sold item has no recorded date (bulk imports).
  Time-windowed queries exclude those rows automatically; `sales.undatedSales`
  surfaces them explicitly so the seller learns they exist rather than silently
  wondering where the money went. Dates are never invented.

### `vya_store_engagement` — the engagement stream

```
store_product_views                                  → 'view' (storefront)
  ∪
analytics_events WHERE event_type <> 'view'
                    OR surface = 'marketplace'       → favourites, clicks,
                                                       checkout starts,
                                                       marketplace views
```

Columns: `store_slug, item_id, event_type, ts, actor_id, surface, session_id`.

Storefront views come from the capture table (which both writers feed); only
what is *unique* to the event stream is taken from `analytics_events`. That is
what keeps the union from double-counting.

---

## 2. Period semantics — `period.ts`

Pure, no I/O, unit-tested (`period.test.ts`). One entry point, `resolvePeriod`.

Accepted period keys:

| Form | Example | Meaning |
|---|---|---|
| Rolling | `30d`, `90d` | Ends now |
| To date | `mtd`, `qtd`, `ytd` | Calendar unit start → now |
| Month | `2026-08` | Whole calendar month |
| Quarter | `2026-Q3`, `q3-2026` | Whole calendar quarter |
| Year | `2026` | Whole calendar year |
| Custom | `custom` + `from`/`to` | `to` is **inclusive** |
| All | `all` | The store's creation date → now |

Every resolution produces two comparison windows:

* **prior** — calendar-aware. The month before August is July, *not* "31 days
  earlier" (which for a 31-day month lands in the middle of the one before).
  Rolling and custom windows slide by their own length. To-date windows compare
  against the **same elapsed span** of the previous unit — 29 days in vs 29 days
  in, never 29 days against a finished 92.
* **yoy** — the same window one year earlier.

Calendar boundaries resolve in the **store's timezone** (`?tz=`, default UTC), so
"best day" is the day the seller lived through. Trend buckets (`day`/`week`/
`month`) are chosen from the window length and truncated in the same zone.

Windows are half-open `[start, end)`. Malformed input degrades to the 30-day
default rather than erroring.

---

## 3. Module map

| Module | Answers | Reads |
|---|---|---|
| `sales.ts` | Did I make money, and is that up or down? | `vya_store_sales`, `items` |
| `customers.ts` | Who bought, and do they come back? | `vya_store_sales`, `store_customers` |
| `catalog.ts` | What do I ask, what does it go for, what moves? | `items`, `vya_store_sales` |
| `products.ts` | Which pieces carry the store, which are dead weight? | `vya_store_engagement`, `vya_store_sales`, `items` |
| `engagement.ts` | Where do people come from, where do they fall out? | `vya_store_engagement`, `store_visits`, `store_pageviews`, `store_searches`, `vya_store_sales` |
| `quality.ts` | What about *how I list* makes a piece sell? | `items`, `vya_store_sales` |
| `margin.ts` | What did I actually keep? | `vya_store_sales`, `items.cost_cents` |
| `suite.ts` | Orchestrates the above | — |
| `core.ts` | Typed SQL tag, `SOLD_STATUSES`, stats helpers, `safe()` | — |

Three rules every module follows:

1. Scope by `seller_id`, resolved once in the suite — never re-join on slug.
2. Take a resolved `Window`; no module invents its own idea of "this period".
3. **Degrade to zeros, never throw.** `safe()` is where that policy lives. A
   fresh store, or a table an older deployment hasn't created, renders an empty
   dashboard rather than a 500.

### Definitions worth knowing

* **Sold** — `SOLD_STATUSES` in `core.ts` (`paid | shipped | delivered |
  fulfilled`). One definition, imported by `store-analytics-db.ts` too, so no two
  surfaces can disagree about GMV.
* **Sell-through** — sold in the window ÷ (sold in the window + still listed).
  "Of what I could have sold, how much did I."
* **Realisation** — average sold ÷ average listed. Under 100% means the catalog
  sells below list.
* **Days to sell** — `sold_at − items.created_at`, mean and median.
* **New vs returning** — decided by *first-ever* sale, not first sale in the
  window. Someone who bought in 2024 and again today is returning, always.
* **Worst performers** — active, live ≥ 14 days, ranked by views per day live.
  Interest, not price, so cheap and expensive pieces compete fairly.
* **Aging** — active and live > 90 days (`AGING_DAYS`).

### Attribution

One-of-one inventory makes item-level attribution exact in a way it never is for
a normal shop: a piece sells once, so the last session that touched *that piece*
before it sold is the session that sold it. No probabilistic splitting. Channel
comes from joining that session back to `store_visits`, which classified its
entry source on arrival.

`attributionCoveragePct` reports the share of sales that could be traced to a
session at all. When it is low the channel table is a sample, and the UI says so
rather than letting a seller read it as complete.

---

## 4. Listing quality — `quality.ts`

The section that answers *what should I do differently to the next piece I list?*
It compares a store's own listings that carry a signal against its own listings
that don't — measurements present, four or more photos, brand / size / condition
filled in, description length — reporting the difference in sell-through, days to
sell and realised price.

Three guardrails, each one added because the naive version was wrong:

1. **Within-store only.** Across stores this would mostly measure which sellers
   are diligent, not which listings convert.
2. **Observable listings only.** A piece imported as already-sold never sat on a
   VYA shelf, and import batches have systematically different field completeness
   from natively-listed pieces. Including them produced confident *backwards*
   findings — one store's data said "noting the condition HURTS sales" at
   z = -13.9, purely because one batch arrived sold with no condition set. A sold
   piece is evidence only when `sold_at` is present and later than `created_at`;
   the rest are dropped and counted as `excludedImports`.
3. **A significance test, not a percentage gap.** At a 6% sell-through, 20
   listings produce about one sale, so "0% vs 6%" is often pure chance. Every
   verdict clears a two-proportion z-test at 95% (`Z_95`), on top of minimum
   sample sizes per side. Below the bar the answer is `no-clear-effect` or
   `not-enough-data`, never a made-up finding.

Whole-catalog, not period-scoped: "do measurements help?" is a structural
question about how this seller lists, and it needs every listing it can get.

Marketplace-wide the signals are strong (measurements 59.5% vs 32.8%
sell-through; photo count monotonic from 8.4% at one photo to 67.5% at eight
plus). Per store, with the guardrails applied, no store currently has enough
native selling history to clear the bar — so the tab honestly reports no clear
effect and leans on catalog completeness and the count of live listings missing
each signal, which are actionable regardless.

## 5. Profit & loss

**`margin.ts`** — gross profit, gross margin, return on cost, profit per sale,
profit by brand and category, best and thinnest margin items, and stock valued at
cost rather than list. Everything is computed over the *covered* slice (sales
whose item carries a cost) and reported beside `coveragePct`; extrapolating
across uncovered sales would be inventing profit. A cost of zero counts as "not
recorded" — treating a blank as £0 would report 100% margin on everything.

The capture path was already complete (the intake form has a cost field, the
publish route reads it, PATCH writes it) — it was simply never filled, and the
autosave draft payload silently dropped `cost` and `measurements` while publish
sent them. That's fixed.

**Operating costs (`../expenses-db.ts`)** are the other half. `store_expenses`
holds one row per cost, whatever door it came in through:

* **one-off** (`recurs` NULL) — typed into the statement, or said to the
  assistant: "spent 84 on poly mailers" hits the `log_expense` tool.
* **`per_order`** — a packing-recipe line. `amount_cents` is the cost of ONE
  mailer / dust bag, multiplied by the sales in the window.
* **`monthly`** — a fixed bill. `amount_cents` is the monthly rate, prorated
  across the window by mean Gregorian month.

Recurring rows are rates, not events, so `occurred_on` reads as *effective
from* — adding studio rent today never invents rent for a closed quarter.
Per-order lines multiply against the **sales ledger**, the same basis the
statement's revenue uses, so the two always agree.

Net profit is deliberately `null` until some cost of goods is known: subtracting
real expenses from an unknown gross would print a loss the store isn't making.

## 5. API

```
GET /api/store/analytics/suite
  ?period=30d|90d|mtd|qtd|ytd|2026-08|2026-Q3|2026|custom|all
  &from=YYYY-MM-DD&to=YYYY-MM-DD     # period=custom, `to` inclusive
  &tz=America/New_York               # default UTC
  &sections=sales,customers,catalog,products,engagement,quality,margin
```

Returns `{ ok, store, period, sections, sales?, customers?, catalog?, products?,
engagement?, quality?, margin?, generatedAt }`. Sections are individually selectable so
a dashboard tab can ask for only what it renders. 401 when the caller isn't a
store; 404 when the slug has no seller row (the synthetic admin workspace, or a
store mid-signup).

Typical whole-suite latency against production data: **150–800 ms**.

---

## 6. Known issues and follow-ups

1. **`store_favorites` name collision.** `favorites-db.ts` owns the live table (a
   user *following* a store: `user_id`, `store_slug`). `store-favorites-db.ts`
   tries to `CREATE TABLE IF NOT EXISTS store_favorites` with a completely
   different shape (a shopper *saving* an item: `item_id`, `shopper_id`) — which
   is therefore a permanent no-op, and every write it makes fails silently into a
   `.catch`. Item favourites are consequently only recorded in
   `analytics_events`. **Fix is a migration** (rename to `store_item_favorites`
   and backfill), not an analytics change; until then `vya_store_engagement`
   deliberately takes favourites from the event stream alone.
2. **Undated sold items.** ~3,300 sold items have no `sold_at`. They count in
   catalog totals and in `undatedSales`, but cannot appear in any date range.
   Setting `sold_at` on import/bulk-mark-sold would fix it going forward.
3. **No cost data yet.** `items.cost_cents` is still populated on zero rows, so
   the Profit tab shows its prompt rather than figures. Nothing more needs
   building — the field just needs filling. Consider making cost required at
   intake, or offering a bulk-edit pass over existing stock.
5. **Marketplace attribution.** `vyaAttributed` keys on `surface = 'marketplace'`
   events. Nothing writes those yet — every `recordEvent` call site currently
   passes `storefront` — so the figure reads zero until marketplace surfaces
   start emitting events. The query is correct; the input is missing.

6. **Session duration** is still uncaptured. Device and location now are, from
   the user-agent and Vercel's edge geo headers — but only for visits recorded
   since that shipped; earlier rows are NULL and read as unknown.
