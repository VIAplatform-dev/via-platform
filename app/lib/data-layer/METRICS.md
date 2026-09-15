# Market Metrics. Definitions

The daily job (`market-metrics-db.ts`) reads the unified `events` log and writes one
`market_metrics` row per **segment × window × day**.

- **Segments**: `brand`, `category`, `era` (e.g. Just Cavalli / Tops / Y2K).
- **Windows**: `7d` and `30d` (trailing).
- **Math**: all in `metrics.ts`, unit-tested in `metrics.test.ts`. Tunables in `config.ts`.

Every number is **market-level and aggregated** a seller never sees another store's
figures. `store_count` / `txn_count` are carried on each row so the privacy guardrail
(Task 7) can hide any segment thinner than N (default 5).

---

### Demand Index: 0–100
1. **Raw demand** for a segment over the window:
   `views×1 + saves×3 + clicks×2 + orders×6` (weights in `DEMAND_WEIGHTS`).
2. **Index** = the **percentile rank** of that raw demand among all segments of the same
   type in that window. Lowest → 0, highest → 100, ties share a rank.
   - Why percentile: "82" means *hotter than 82% of brands* a stable, comparable scale
     that doesn't drift as overall traffic grows.

### Trend: rising / falling / flat
Compare this window's raw demand to the **immediately prior equal window**.
- `> +10%` → **rising**, `< −10%` → **falling**, otherwise **flat** (`TREND_FLAT_BAND`).
- From a zero base, any demand is **rising**. Keeps noise from reading as a trend.

### Sell-through %
`units sold in window ÷ items currently in stock for the segment`.
- **null** when there's no active supply (a rate over zero stock is meaningless, not "0%").

### Median days-to-sale
**Currently null, not faked.** We don't yet capture a per-item listing date, so we can't
measure how long a sold item sat. The column exists; it gets populated once we log
listing→sale durations (a later enhancement). Shown as "-" until then.

### Price benchmark: p25 / median / p75
25th / median / 75th percentile (linear interpolation) of **realized sale prices** from
order events in the segment+window. The band a piece actually sells in.

### Supply gap: 0–100
`demand_index − supply_percentile`, clamped to [0, 100], where `supply_percentile` is the
segment's rank by current in-stock count. **High demand + thin stock → high gap** = the
clearest "source this" signal. Era supply is enriched from product titles on the fly
(products carry no era column).

---

### Honesty notes
- Brand/category/era come from the **same canonical inference** used everywhere
  (`inferBrandFromTitle`, `inferCategoryFromTitle`, `inferEra`), and era/condition are only
  set when the listing states them, never guessed.
- The job is **idempotent**: re-running for a date replaces that date's rows.
- Old admin analytics (`/admin/data`) keep running in parallel until these events-based
  metrics are validated against them, then we cut over.
