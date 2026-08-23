# Price Accuracy v2 — Design + Execution Plan

**Date:** 2026-08-22 · **Status:** Phases 1–3 built (uncommitted). 273 tests green.

> **Direction change during execution.** Sold-vs-asking was removed as the valuation hierarchy.
> It was the single common cause of every underpricing case found in testing: a lone $900 sale
> beat a $1,459–$2,082 cluster (Miu Miu, $1,155); 20 brand-level sales beat the actual listing
> (Valentino, $210); two unrelated $350–$500 sales beat nine listings of the same Versace runway
> dress at $1,733–$3,200 ($473). Comps are now ranked by HOW WELL THEY MATCH THIS PIECE —
> visually-confirmed same-piece listings outrank keyword matches whether or not they sold.
> Sold/auction status survives as context on each comp line, never as the ranking.
**Goal:** materially tighter price suggestions from intake, via (1) more real comps, (2) correct
currency handling, (3) sold-status truth, (4) tiered brand-safe reverse-image search, and
(5) an outcome feedback loop that grades every suggestion against what the market actually did.

---

## What we're building (one paragraph)

When a seller uploads photos, pricing always runs reverse-image search (Google Lens via SerpApi)
plus eBay sold, Google Shopping, RealReal, VYA's own sold/listed comps, and the internal
benchmark — as today. New: Lens matches that show no price get their product page fetched and the
price extracted from structured data (with ISO currency + sold/available status); all comp prices
become currency-aware and convert to USD or drop; the Lens search escalates in tiers
(image → image+brand → image+brand+category, brand ALWAYS first) when verified priced matches are
thin, with a brand guard so a refined query can never admit another brand's item; and every
suggestion is logged (suggested price, confidence, source, PROMPT_VERSION, seller's final price)
so time-to-sale and realized prices can later calibrate the condition multipliers and an
ask-to-sale haircut.

## Non-goals (this round)

- No change to the description/draft side of intake.
- No automatic re-pricing of live listings.
- No seller-facing exposure of another store's numbers (privacy rule stands: N ≥ 5 aggregates only).
- The calibration math itself (adjusting multipliers/haircut from outcomes) is a later phase —
  this round builds the logging + reporting that makes it possible.

---

## Phase 1 — Currency correctness + link price-verify + sold detection

The highest-value, lowest-risk phase. Fixes a silent systematic error (EUR/GBP comps entering the
median as USD) and recovers prices for the many Lens matches Google returns without one.

### 1a. Currency-aware prices

- `Comp` and `VisualMatch` gain `currency` (ISO code) end-to-end; `priceToCents` variants return
  `{cents, currency}` instead of assuming USD.
- Lens `price.currency` symbol → ISO (`$`→USD, `€`→EUR, `£`→GBP, `¥`→JPY, `CHF`, `SEK`, `DKK`,
  `NOK`, `PLN`, `CAD`, `AUD`); scraped pages give ISO `priceCurrency` directly from JSON-LD.
- New `toUsdCents(cents, iso)` with an FX table in `app/lib/data-layer/config.ts` (centralized-config
  rule; rates are coarse market rates with a `// refresh quarterly` note — comp pricing tolerates
  ±2% FX drift, it does not tolerate treating €450 as $450).
- **Guardrail:** unknown/missing currency on a non-US source domain (`.fi`, `.de`, `.co.uk`, …) →
  drop the comp rather than guess. Log a per-run counter of converted vs dropped so we can see
  the effect.

### 1b. Link price-verify (`app/lib/comp-price-verify.ts`, new)

For the top **8** embedding-verified matches that lack a price:

- Fetch the product page directly (our own fetch, zero SerpApi spend). Parallel
  `Promise.allSettled`, 8s per-page timeout, ~500KB body cap, one attempt (no retry hammering),
  browser-like User-Agent.
- Extraction order (cheap → richer): JSON-LD `Product.offers` (`price`, `priceCurrency`,
  `availability`) → `og:price:amount` / `og:price:currency` meta → microdata `itemprop=price`.
  Optional Haiku fallback on stripped page text, **flag-gated** (`VYA_LINK_VERIFY_LLM=true`) so
  the default path costs no tokens.
- **Sold detection, free on the same page:** `availability: SoldOut/OutOfStock`, or known
  sold-badge markers on vestiairecollective/grailed/depop domains → comp enters as `sold: true`
  (a realized transaction — the gold-standard comp), else `sold: false` asking.
- **Cache:** new `link_price_cache` table keyed by URL, 30-day TTL. Cache only genuine fetch
  results — never cache a timeout/error as "no price" (mirrors the lens-cache rule).
- **Guardrails:** http/https only; skip link-shortener/redirect hosts; per-run overall budget
  (whole verify step aborts past ~10s so intake latency stays sane); results that produce a price
  wildly outside the verified-match cluster (>5× the cluster median) are discarded as
  extraction errors.

### 1c. Wire-in

`estimatePrice` treats link-verified prices exactly like native Lens prices (they flow through
`matchesToComps` → `rankComps`), now with honest `sold` flags and USD-normalized values.

**Tests (node --test):** symbol→ISO mapping; `toUsdCents` incl. unknown-currency drop; JSON-LD /
og / microdata extraction against captured HTML fixtures (Shopify + WooCommerce + a Vestiaire-style
sold page); outlier discard; cache hit path.
**Phase gate (user-run):** for each golden-set photo, hit
`/api/admin/lens-price-debug?image=<url>&brand=<brand>&linkVerify=0` then `&linkVerify=1`.
Pass = (a) no foreign-domain match priced as if USD — rows flagged `foreignDomain` either carry a
converted (higher) price or none at all; (b) `prices.recoveryRate` ≈ 50%+ of previously unpriced
matches; (c) at least one recovered comp shows `sold: true`; (d) totalComps rises and the resulting
suggested price moves toward known truth or holds. Must include one item whose matches are
mostly European stores.

---

## Phase 2 — Tiered reverse-image escalation + brand guard

### Tier logic (new `reverseImageTiered()` in `comps.ts`; call site swaps from `reverseImageBestOf`)

1. **Tier 1 — image only** (today's multi-frame behavior). Embedding-verify → link-verify.
   **Stop if ≥ 5 verified matches with confirmed prices.**
2. **Tier 2 — image + `q: "{brand}"`** (brand from label OCR / draft, which runs first).
   **Stop if ≥ 2 verified priced matches** (cumulative, deduped).
3. **Tier 3 — image + `q: "{brand} {category}"`** — brand first, category attached
   ("Valentino shoulder bag"). Take what survives verification.
   - **Unbranded fallback:** no brand → skip Tier 2; Tier 3 uses `q: "{category} {material}"`
     ("suede shoulder bag") and pricing continues to lean on the unbranded golden-set benchmark.

### Guards

- **Brand guard (tiers 2–3):** drop any match whose title resolves via `inferBrandFromTitle`
  (canonical, `market-data-db.ts`) to a *different* brand than the query's. This — not query
  wording — is what guarantees "brand first, never another brand's bag."
- **Adaptive similarity floor:** verify at **0.75** (the "90% confidence / 15% MoE" translation);
  if < 3 matches survive, relax to the current 0.68 before escalating a tier. Both ends stay
  env-tunable (`VYA_VISUAL_MATCH_MIN`, `VYA_VISUAL_MATCH_STRICT`).
- **Quota guardrail:** worst case 3 Lens calls per item (vs 1 today, within the 5,000/mo plan);
  per-photo lens cache still applies, and tiers reuse Tier 1's frames — refinement tiers run on
  the primary frame only. Log `[comps] tier=N` lines for cost visibility.

**Tests:** tier stop-conditions; dedupe across tiers; brand-guard keep/drop cases (incl. comps
with no brand signal → benefit of the doubt); unbranded fallback; adaptive floor.
**Phase gate (user-run, see Testing Ladder):** golden-set dry-run with `VYA_LENS_TIERED_ENABLED`
off vs on, plus the edge-case probes. Pass = (a) clean branded piece stops at Tier 1 (1 Lens
call — check the `[comps] tier=` log); (b) poor-photo piece escalates and gains verified comps;
(c) zero cross-brand comps in any tiered result; (d) unbranded piece falls to category+material
without error; (e) golden-set median error improves or holds vs Phase 1.

---

## Phase 3 — Outcome logging (close the loop)

### Data

New table `price_suggestions` (written at intake accept/publish):

- `product` key, `store_id`, `suggested_cents`, `low_cents`, `high_cents`, `confidence`,
  `source` (comps/floor/benchmark/knowledge), `prompt_version`, `comp_count`, `sold_comp_count`,
  `seller_price_cents` (what they actually published), `created_at`.
- Migration via an admin endpoint; **the user triggers the prod write** (hard rule — no direct
  prod writes from here).

### Reporting (admin-only, `/admin/data`)

Join `price_suggestions` to the existing `clicks`/`conversions` tables:

- **Accuracy:** suggested vs realized price (median % error, by category / condition grade /
  prompt_version — the PROMPT_VERSION stamp turns every row into a labeled eval example).
- **Time-to-sale:** days from listing to attributed conversion, bucketed by how far the seller
  priced from the suggestion — the "sold in 2 days = too low, sat 60 days = too high" read.
- **Override drift:** median seller override by category (sellers consistently bumping a category
  +30% = that category prices low).

**Guardrails:** internal admin only — never seller-facing (and any future seller-facing derivative
obeys the N ≥ 5 privacy floor from `config.ts`). Attribution is imperfect (external checkouts) —
the report states its coverage % rather than pretending completeness.

**Tests:** suggestion write path; report SQL against seeded fixtures.
**Phase gate (user-run):** publish 2–3 test listings through intake, confirm each lands a
`price_suggestions` row with the right suggested/seller values + PROMPT_VERSION, and the
`/admin/data` report renders with honest coverage numbers. (Full accuracy read matures over
weeks as real sales accumulate — the gate here is only that logging is complete and correct,
since rows missed now are eval data lost forever.)

---

## Phase 4 (later, data-dependent) — Calibration

Once a few hundred outcomes accumulate: fit the ask-to-sale haircut from paired ask/sold segments;
sanity-check `CONDITION_MULTIPLIERS` against sale-speed by grade; per-category correction factors.
Each lands as a reviewed config change (centralized in `config.ts`), never a silent model tweak.
Not scoped further here on purpose — the Phase 3 report tells us what to build.

---

## Testing Ladder (how every phase is judged)

Two separate questions, tested separately: "does the code work" (layers 1–2, automated, Claude's
job) and "are the prices actually better" (layers 3–5, user-run, judged against prices the user
trusts). **No feature flag flips on for real intake until its phase gate passes.**

1. **Unit tests** — `npm test` (node --test), written test-first with each phase. Real captured
   HTML fixtures for extraction; synthetic match sets for tier/guard logic. Green before any
   dry-run.
2. **Typecheck + lint** — `npx tsc --noEmit`, `npx eslint` on touched files.
3. **Golden set (built once, reused forever):** ~10 items with a known-truth price — recently
   sold VYA pieces (realized price is the truth) + a few hand-priced pieces incl. the pink
   Valentino test bag. Kept as a fixture list (item photos + truth price) so any change can be
   replayed. **The metric is median % error vs truth**; every phase must improve it or hold it.

   **Two debug endpoints, two halves of the pipeline** (both admin-authed JSON APIs, not pages):
   - `/api/admin/price-debug?query=<brand + model>` — the TEXT half: eBay-sold, Google Shopping,
     cache state, and the model valuation. Does NOT run reverse-image, so it cannot exercise
     Lens currency handling or link-verify.
   - `/api/admin/lens-price-debug?image=<photo url>&brand=<brand>&linkVerify=1` — the PHOTO half:
     Lens → visual verification → link price-verify → comps, with a per-match `priceFrom`
     (`google-lens` / `link-verify` / `none`), `host`, `foreignDomain`, `sold`, and a recovery-rate
     summary. `&linkVerify=0|1` flips the feature per request, so before/after needs no restart.
     **This is the Phase 1 + 2 gate tool.**
4. **Edge-case probes (run at Phase 2, rerun before enabling anything):** blurry/folded-garment
   photo (must escalate, not return garbage); unbranded piece (category+material fallback +
   golden-set benchmark); EU-only matches (convert or drop, never €-as-$); an ultra-common item
   like a Levi's tee (sold comps dominate; no anchoring to a high ask).
5. **Production, gradually:** flags on for real intake only after 3–4 pass. Expected noise:
   some sites block fetches or JS-render prices — a single failed extraction is not a bug; judge
   the hit rate across the set, and failures must degrade silently to pre-flag behavior. From
   Phase 3 on, the `/admin/data` outcome report becomes the permanent, always-on test harness —
   error drift by prompt_version replaces manual golden-set runs over time.

Each phase ends with Claude handing over a ready-to-run gate script: "run these N items, here's
the before/after table, check these columns" — the user judges pass/fail before any go-ahead.

## Rollout guardrails (all phases)

- **Feature flags, default off:** `VYA_LINK_VERIFY_ENABLED`, `VYA_LENS_TIERED_ENABLED` — prod
  behavior is unchanged until flipped; Phase 3 logging is passive (no behavior change) and ships on.
- **Shadow first:** flip flags in price-debug dry-runs before enabling for real intake.
- Existing fallback ladder is untouched: model-valuation failure still degrades to trimmed sold
  median → benchmark → golden set → knowledge, never a crash.
- No commits/pushes without an explicit instruction; each phase ends with its Testing Ladder
  gate handed to the user, then stops for go-ahead (phase-gated delivery).

## Execution prompt (per phase)

> Implement Phase N of docs/price-accuracy-v2-plan.md exactly as specified. Work test-first
> (node --test), match each file's existing style (1-space indent where present), reuse
> canonical helpers (`inferBrandFromTitle`, `normalizeCategory`, config.ts constants — never
> hardcode rates/thresholds elsewhere), keep all new behavior behind the phase's feature flag,
> and do not commit. Finish with `npx tsc --noEmit` + `npm test`, then hand over the phase's
> Testing Ladder gate (the exact items to run, the before/after table, and the pass criteria)
> and stop for go-ahead.


---

## Execution log (what actually shipped)

**Phase 1 — currency + link price-verify.** `currency.ts` (symbol→ISO, FX table in config, drop
unknown rather than guess), `comp-price-verify.ts` (JSON-LD/OpenGraph/microdata extraction,
US *and* European number formats, candidate ranking that skips social/editorial hosts, two-sided
outlier guard), `link-price-cache-db.ts`. Verified: 0 → 3 prices recovered on a real item; a
9,995 DKK dress that read as $9.99 now reads $1,459.

**Phase 2 — tiered reverse-image.** `reverseImageTiered`: image → image + brand → image + brand +
category, brand always leading, with a canonical brand guard dropping any match whose title
resolves to a different label. When the caller has no brand (the normal intake case) it is taken
from tier 1's own match consensus. Escalation is evidence-driven — a clean product photo still
costs exactly one Lens call (verified live: 7 priced matches at tier 1, no escalation).
`brandFirstQuery` does the same job for the keyword searches, which were running brand-less and
pricing a Valentino against $18–$95 no-name sundresses.

**Match-quality hierarchy (replaces sold-anchoring).** `exactPieceEvidence` + `compLine` tag every
comp `SAME PIECE ✓0.95` or `keyword match`, plus seller tier (vya / specialist / marketplace).
Full-size Lens images are now embedded instead of Google's ~225px thumbnails — measured on a real
dress, same-piece similarity went 0.744 → 0.954 while the best non-match went 0.733 → 0.849, a
10× wider margin. Verified end-to-end: the Versace went $473 → $2,048 with the rationale citing
seven same-piece listings.

**Phase 3 — outcome logging.** `price_suggestions` records every suggestion at the moment it is
made (suggested/market/band, confidence, source, PROMPT_VERSION, comp count, same-piece count,
seller's published price). `/api/admin/price-accuracy` reports override drift by category, prompt
version, and evidence type. Time-to-sale is deliberately NOT joined yet: `sold_items` carries
title/designer, not our `item_id`, so the join would be guesswork — logging `item_id` now is what
makes it possible later.

## Still open

- **Run-to-run instability.** The vision draft writes a different `searchQuery` each run, so the
  keyword comps shift between runs. The same-piece anchor is stable; the keyword tail is not.
- **Vestiaire link-verify** still 403s on direct page fetch; the Shopping-index pass is the
  workaround and now inherits the brand-first query.
- **Positioning call (business, not engineering).** Is eBay VYA's market? If not, marketplace-tier
  comps should be a floor signal rather than evidence, the way auction closes now are.
- **Phase 4 calibration** stays unscoped until Phase 3 has accumulated real outcome data.
