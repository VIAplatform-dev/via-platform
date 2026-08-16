# Deeper Analytics — Category Deep Dives

Detailed spec for the store-owner analytics dashboard (getvya.ai admin). Each metric lists:
**Definition** - what it means -> **Compute** - how -> **Source** - where the data lives ->
**Watch** - caveats/edge cases.

Core data model referenced:
- `conversions` (order_id, order_total, currency, store_slug, timestamp, customer_email, user_id, via_click_id, matched, returned, items) — synced from Shopify order cache / Wix / Square = WHOLE business; filter matched=true for VYA-only.
- `products` (price, size_keys, created_at, store_slug; brand & category are INFERRED, not stored).
- `product_views`, `product_favorites`, `clicks`, `store_visits` — engagement/traffic events.
- Unified `events` table (single key = items.id) — reconciliation layer across the above.
- Canonical `inferBrandFromTitle` / `normalizeCategory` — reuse everywhere so numbers reconcile.

Two global toggles apply to every metric below:
1. **Whole-business vs. VYA-only** — switches the query between all synced orders and matched/attributed only.
2. **Time window** — quarter/month/custom, with prior-period and YoY comparison (see Time Engine at bottom).

---

## 1. Sales & revenue
*Answers: how much am I selling, and is it growing?*

**Total sales (GMV)**
- Definition: gross value of orders in the period.
- Compute: `SUM(order_total)` where `store_slug=X` AND timestamp in window AND `returned IS NOT TRUE`.
- Source: `conversions.order_total`.
- Watch: net out returns; use store's native currency; `order_total` = amount actually paid (after discounts).

**Number of orders**
- Definition: distinct orders in the period.
- Compute: `COUNT(DISTINCT order_id)`.
- Watch: distinct on `order_id` — re-syncs call `saveConversion` again; it's idempotent on `conversion_id`, but always dedupe on `order_id` for counts.

**Average order value (AOV) — "my customer average spend"**
- Definition: average spend per order.
- Compute: `SUM(order_total) / COUNT(DISTINCT order_id)`.
- Watch: this is per-ORDER (not per-customer — see section 2). Show **median order value** alongside; a single $4k bag skews the mean.

**Revenue trend**
- Definition: % change vs. the prior comparable period.
- Compute: `(thisPeriod - priorPeriod) / priorPeriod`.
- Watch: compare like-for-like windows (full quarter vs. full quarter); guard divide-by-zero for new stores.

**Best day / best week**
- Definition: highest-revenue day and week in the window.
- Compute: `GROUP BY day|week ORDER BY SUM(order_total) DESC LIMIT 1`.

---

## 2. Customers
*Answers: who buys, and do they come back?*

Identity key = `conversions.customer_email`. A store sees its OWN customers (their data — fine).
Cross-store customer data stays private; only aggregated market stats are shared.

**Average spend per customer (lifetime)**
- Definition: total spend per unique customer, averaged — an LTV proxy.
- Compute: `SUM(order_total) / COUNT(DISTINCT customer_email)` (lifetime), or group by email then average.
- Watch: differs from AOV whenever customers reorder. This is the number that shows loyalty value.

**New vs. returning**
- Definition: in-period customers whose first-ever order falls in the window (new) vs. earlier (returning).
- Compute: per `customer_email`, `MIN(timestamp)` over all history; new if MIN is in-window.
- Watch: requires full order history, not just the window.

**Repeat-purchase rate**
- Definition: % of customers with 2+ orders.
- Compute: `customers with order_count >= 2 / total customers`.
- Watch: choose lifetime vs. in-window and label it; short windows understate repeat behavior.

**Top customers by spend**
- Definition: leaderboard by lifetime `SUM(order_total)`.
- Source: `conversions` grouped by `customer_email`.

**Total customer count**
- Definition: distinct customers.
- Compute: `COUNT(DISTINCT customer_email)`.
- Watch: orders without an email (some synced orders, guest checkout) fall into an "unknown" bucket — surface that count so totals reconcile.

---

## 3. Pricing & catalog
*Answers: how is my inventory priced, and how fast does it move?*

**Average item price on my site (listed)**
- Definition: mean price of active listings.
- Compute: `AVG(price)` FROM `products` where active.
- Watch: also show **median** (robust to high-ticket outliers); native currency.

**Average sold price**
- Definition: mean price of items that actually sold in the window.
- Compute: from `conversions.items` line-item prices; `AVG(item_price)`.
- Watch: sold price can be below listed (offers/discounts) — that gap is itself a useful signal. If `items` lacks per-line price, fall back to `order_total / item_count`.

**Price range / distribution**
- Definition: histogram of listing prices into bands (<$100, $100-250, $250-500, $500+).
- Compute: bucket `products.price`.
- Watch: bands should be store-configurable — a fine-jewelry store's bands differ from a tee store's.

**Active listings + total inventory value**
- Definition: count of live listings; `SUM(price)` = retail value of unsold stock.
- Source: `products` filtered to available.
- Watch: **dependency** — clean active/sold state needs the deferred availability column (Option B); today only Option A (`sold_items` preservation) is shipped. Flag before building inventory value / sell-through.

**Sell-through rate**
- Definition: sold / (sold + still-active) over a cohort or period.
- Compute: sold events (from conversions.items) vs. active counts at period start.
- Watch: define the cohort explicitly (listed-in-period vs. all-active); depends on availability state above.

**Average days-to-sell**
- Definition: avg(sold_date - listed_date) for items sold in the window.
- Compute: `products.created_at` -> sold date (conversion timestamp when the item appears in an order).
- Watch: `created_at` may reflect Shopify **sync** time, not true first-listed date (same caveat as the listing-velocity endpoint) — label days-to-sell as approximate.

**Catalog mix: top brands / categories / price bands**
- Definition: distribution of the catalog by inferred brand, category, and price band.
- Compute: run `inferBrandFromTitle` / `normalizeCategory` over `products`, then group.
- Watch: brand/category are inferred, not stored — MUST reuse the canonical functions so this reconciles with the marketplace and the data layer.

---

## 4. Product performance
*Answers: what's working, what's dead?*

**Best & worst sellers**
- Definition: products ranked by units sold and revenue in the window.
- Compute: `conversions.items` grouped by product.
- Watch: product keys are inconsistent across tables (composite string vs. INT vs. name) — join through the unified `events` table (items.id) rather than raw keys.

**Most viewed / most favorited**
- Definition: products ranked by view and favorite counts.
- Source: `product_views`, `product_favorites`.
- Watch: pair with sales — high views + low sales = a pricing or photo problem worth surfacing.

**Aging inventory**
- Definition: active listings unsold beyond a threshold (e.g. 60/90 days).
- Compute: `created_at` older than threshold AND still active.
- Watch: this is the hook into markdowns / cross-listing prompts ("12 items over 90 days — cross-list or discount?").

---

## 5. Engagement via VYA (attributed slice)
*Answers: what is VYA specifically driving for me?*

**Funnel: views -> favorites -> clicks -> conversions (with rates)**
- Definition: the acquisition funnel for VYA traffic and the drop-off at each step.
- Source: `product_views`, `product_favorites`, `clicks`, `conversions`.
- Rates: favorite rate = favorites/views; click-out rate = clicks/views; conversion rate = conversions/clicks.

**Where visitors come from (traffic sources)**
- Definition: referrer-classified sources of VYA visitors.
- Source: `store_visits` via `getTrafficSources` ("Where visitors come from").

**VYA-attributed revenue vs. total**
- Definition: revenue where `matched=true` OR `via_click_id` present, vs. whole-business total.
- Value: shows VYA's contribution and is the commission basis.
- Watch: for Wix stores, attribution is INFERRED (7-day click window / email match), not hard-proven — label this slice as softer for those stores.

---

## Cross-cutting: the Time Engine
- Every query is parameterized by `[start, end]`; quarter presets (Q1-Q4), month, custom range.
- **Comparison:** compute the same metric for the prior comparable period AND the year-ago period; show delta + %.
- **Trend series:** bucket by day/week/month for sparklines and trend lines.
- Example row: `Q3 AOV $412 (up 8% vs Q2) - avg item price $286 - 47 orders`.

## Cross-cutting: reconciliation, currency, returns, benchmarking
- **Reconciliation:** always brand/category via the canonical functions, and product joins via the `events` table — so every section, the marketplace, and the data layer agree.
- **Currency:** display in the store's native currency; only convert (FX) when benchmarking across stores, and label it.
- **Returns:** exclude `returned=true` from revenue; optionally show gross vs. net.
- **Market benchmarking:** for headline metrics (AOV, avg item price, sell-through), show the anonymized peer median at **N >= 5** stores — e.g. "your AOV $412 vs. category median $290." Never expose an individual store's numbers.

## Data dependencies / gaps to resolve first
1. **Availability state** (active vs. sold) — needs the deferred `products.available` column (Option B). Blocks inventory value, sell-through, aging.
2. **`created_at` accuracy** — Shopify sync time vs. true listed date. Affects days-to-sell.
3. **Product-key inconsistency** across event tables — the unified `events` table is the fix; best/worst sellers depend on it.
4. **Line-item price granularity** in `conversions.items` — needed for average sold price and best-sellers.
5. **Wix attribution softness** — only affects the VYA-attributed slice, not whole-business metrics.
