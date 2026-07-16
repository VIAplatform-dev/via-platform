# Intake AI accuracy — roadmap

_How the listing AI identifies and prices items, where it falls short, and the path to
"almost 95%" on **brand + price** — the two that matter most. Living doc; update as we ship._

Last updated: 2026-07-16

---

## The one-line thesis

**Identification is the ceiling, and the system doesn't yet _learn_.** Pricing math is already
good — it fails on garbage-in (wrong/too-broad ID) and on pieces the market can't comp. The
highest-leverage work is everything that makes the model **compound**: feed corrections back in,
give it reference data for specific pieces, and use all the signal a seller uploads.

Realistic target: **95% is reachable per-segment** (branded, identifiable, mid-tier). Truly obscure
archival will always lag — even expert humans disagree there. Track accuracy **by segment**, not as
one global number.

---

## How intake works today (the pipeline)

1. **Seller** uploads ~3 photos, **types the brand** (now required before AI; "Unbranded" is valid),
   and hits "Fill the rest with AI."
2. **Draft** (`/api/store/intake`): in parallel — a Voyage **embedding** of the main photo, a Google
   **Lens** reverse-image search (SerpAPI) → consensus brand, and the core **Claude vision** pass
   (`draftListing`) → brand/era/material/condition (+confidence), category, a tight `searchQuery`,
   `tag` OCR (brand/RN/made-in/style off the label), runway, price hint, parcel. A typed brand is
   authoritative; otherwise brand resolves label → Lens → vision.
3. **Price** (`/api/store/intake/pricing`): build the comp query from `searchQuery`; gather comps
   (brand-filtered reverse-image + VYA visual comps + cached + live eBay-sold/Shopping/RealReal + VYA
   internal benchmark); **Claude** (`valueFromComps`) keeps true comps, drops outliers, anchors to
   the SOLD median (condition-aware) → market value; apply the store's price multiplier → suggestion.
4. **Review & publish**: risky low-confidence fields flagged; corrections → `intake_predictions`
   (accuracy dashboard), published AI-value-vs-price → `intake_memory_items` (calibration).

**Stack:** Claude vision (identify + write) · Claude (price reconcile) · Google Lens / eBay / Shopping
/ Trends via SerpAPI · Voyage embeddings · RN→brand learned table · Photoroom (cosmetic).

---

## Shipped (Phase 0 — this cycle)

- **Brand-first gate** — AI won't run without a brand anchor.
- **Tag OCR** — vision transcribes brand/RN/made-in/style; printed label / resolvable RN outrank the
  visual guess when no brand is typed. **RN→brand** learned table (never fabricated; grows from
  dual-fact labels + optional FTC).
- **Tight comp query** — model emits `brand + specific model + era`, used for comps instead of the SEO
  title (same-piece, not same-brand).
- **Cleaner valuation** — comps filtered to the resolved brand; fallback median trims outliers;
  valuation is condition-aware.
- **Measurement** — fixed the eval brand grader (exact-string → house-level match, so it stops
  reporting a false ~5%); accuracy dashboard now shows **price calibration by category** + a **live
  feed of what sellers change**; market-trends cron → weekly (SerpApi quota fix).

---

## Roadmap (highest leverage first)

### Phase 1 — Learn from corrections (the compounding loop) ★ biggest miss ✅ shipped
**Gap:** we log every seller correction + bank 4,494 labeled examples, but none of it feeds back into
the identifier. It never gets better at _your_ inventory.
**Done:**
- Retrieval few-shot: intake pulls the k most similar past **confirmed** items — cross-store,
  brand-scoped, labels-only (`getCrossStoreSimilar`) — plus a cross-store **brand prior**
  (`getBrandPrior`: what this brand's pieces usually are + resell for on VYA, N-gated).
- Per-store visual memory (`getVisualHints`) + correction hints (`getIntakeHints`) already feed the
  draft; confirmed-item titles now carry through so the references name the actual piece.
- `learnRnBrand` fires on any dual-fact tag (brand + RN read off one label).
**Measure:** brand + price correction-rate on the dashboard should fall week over week.

### Phase 2 — Specific-piece recognition ✅ shipped (needs the embed backfill to light up)
**Gap:** "Prada" is trivial (typed); "Prada Re-Nylon ~2019" from photos is hard — and that
specificity is what makes the price right. The model has no reference to recognize models against.
**Done:**
- **Reference index** = a photo embedding on every labeled catalog example (`training_examples.embedding`),
  filled in batches by `embedPendingTrainingExamples` (Voyage cost → run-when-ready; `/api/admin/reference-index`
  POST `{limit}`, GET stats). Turns the whole brand+title+era+price catalog into a visual reference.
- **`resolveSpecificPiece(embedding, brand)`** matches an upload against that index + confirmed VYA
  listings (both carry a TITLE = the model), same-brand preferred. Returns a discrete `{model, query,
  similarity, priceCents}` only above a HIGH bar (0.82) — else null → graceful brand-only.
- **Wired into intake:** a confident match (a) feeds the specific model into the draft so the title/era
  get more specific, (b) becomes the comp query (threaded to phase-2 pricing) so comps target the exact
  piece, (c) surfaces a "🎯 Looks like …" cue to the seller.
**Remaining:** run the embed backfill post-deploy (index is empty until then); persist a `resolved_specific`
flag to report the resolve-rate on the dashboard.
**Measure:** price ±20% rate; % of listings that resolve to a specific model vs brand-only.

### Phase 3 — Use all the signal ✅ shipped (frame-adaptive; auto best-frame deferred)
**Gap:** reverse-image + embedding use only the **first** photo; the tag is shot ~60% of the time and
has no dedicated capture.
**Done:**
- **Adaptive multi-frame reverse image** (`reverseImageBestOf`): searches the primary photo first and
  only escalates to later frames when evidence is weak (no brand consensus / too few priced comps),
  merging + deduping across frames. Quota-safe — a clean primary photo still costs one Lens call; a
  bad angle escalates (env `INTAKE_REVERSE_FRAMES`, default 3). The "strong enough" gate is
  context-aware: brand typed → enough same-brand priced comps; brand unknown → confident consensus.
- **Tag-photo prompt** in intake — nudges the seller to include the brand/care label (the strongest
  brand+era signal); the multi-frame search then consumes that frame automatically.
**Deferred:** embedding/comp photo still uses frame 0; automatic best-identifying-frame selection.
**Measure:** positive-ID rate; tag-present rate.

### Phase 4 — Condition precision ✅ shipped
**Gap:** condition swings price hard but is coarse from 3 photos.
**Done:**
- The vision draft now grades condition on the **canonical scale** (`conditionGrade`) and lists the
  **specific visible flaws** it saw (`flaws[]`: pilling, scuffs, tarnish, stains…) — prompt-enriched,
  no extra Claude call. Seller-typed condition still wins as ground truth.
- **Explicit, deterministic price adjustment:** the comps are valued at STANDARD resale condition
  (so the model no longer self-discounts invisibly), then the band is scaled by
  `CONDITION_MULTIPLIERS[grade]` (centralized in `data-layer/config.ts`; symmetric 5% steps —
  Deadstock/NWT ×1.1, Excellent ×1.05, Very Good = 1.0 baseline, Good ×0.95, Fair ×0.9 — gentle on
  purpose so a grade never guts the price). Shows in the rationale ("· −5% (Good condition)").
  `normalizeConditionGrade` maps freeform → grade; no grade → no change.
- Flaws surface to the seller under the condition field ("AI noted: scuffed toe · tarnished pull").
**Remaining:** persist the grade so the dashboard can report price error where seller-grade ≠ AI-grade.
**Measure:** price error on items where seller-condition ≠ AI-condition.

### Phase 5 — Measurement completeness ◐ partly shipped (golden set remains)
**Gap:** exam labels are noisy; corrections don't record category, so **brand-by-segment** is blind.
**Done:** category logged on `intake_predictions`; **brand accuracy by category** + **price
calibration by category** on the dashboard, both graded house-level (Dior ≡ Christian Dior) at read
time; the dashboard now **interprets** each row in plain language and **flags low-N segments as too
thin to judge** instead of showing a misleading number.
**Beta-readiness scorecard (the go/no-go) — shipped:**
- The three gated dimensions — **brand, price, specific piece** — each scored vs a **95%** bar, judged
  on the **lower bound of a 95% Wilson confidence interval** (so a lucky small sample can't call it;
  "pass" needs ~97% @ n≥500 or ~98% @ n≥200 — rigorous but reachable). Verdicts: pass / so-close /
  below-95% / insufficient. `getBetaReadiness` (`beta-readiness.ts`), surfaced at the TOP of
  `/admin/intake-accuracy` with per-segment price breakdown + explicit blockers list.
- **Price graded against REAL sold prices** (`eval-price.ts`): runs the pricer BLIND on items VYA
  actually sold (photo + brand → market value) and grades vs the real price — % within ±10% (and ±20%),
  median error, by category + price tier, with CIs. Leak-safe (reverse-image + external comps).
  Results **accumulate** per sold item (`price_eval_items`) so N — and confidence — grows each run.
  `/api/admin/price-eval` (GET picture, POST `{sample}` to grade more). Available now, no labeling.
- **Brand + specific graded blind on the golden set** (`runEval`): brand house-level; **specific-piece**
  = does the AI's own title/query name the right model (leak-free token match, not the reference index).
- **Ablation — "does the learning loop actually work?"** (`eval-ablation.ts`, `/api/admin/ablation`, dashboard
  A/B panel): runs the SAME items with memory OFF vs ON and reports the accuracy lift. Both arms blind on
  brand, reverse-image held out → the delta is memory ALONE. Leak-guarded (retrieval drops a near-identical
  self-match; `excludeNearIdentical` on `getCrossStoreSimilar`/`resolveSpecificPiece`). Reports the
  memory-hit-rate, so an empty corpus honestly reads "no lift yet, nothing to retrieve". This is the proof
  (or disproof) that retrieval helps — it lights up once the reference index + real listings exist.
- **Exam cadence:** the nightly cron is now **weekly** (Mondays) — a frozen base model barely moves day to
  day, so nightly just burned SerpApi quota. Run the exam **on-demand** after a change; weekly is the trend tick.

**Golden set — foundation shipped, curation is the human step:**
- `training_examples.golden` flag + `getGoldenCandidates` (ranks the trustworthiest auto-labeled
  rows — high-trust, brand+price+photo, seller kept the AI's brand — for review) + `markGolden`.
- Exam-against-golden: `runEval({ goldenOnly: true })` samples only golden rows (falls back to the
  full set if none exist yet); the run records whether it was golden. `EvalResult.goldenOnly`.
- Admin endpoint `/api/admin/golden-set`: GET `?candidates=1&category=…` to review, POST `{ids,on}`
  to promote/demote. Grade against it with `/api/admin/eval` POST `{ goldenOnly: true, withPrice: true }`.
- **To do (human):** review candidates and promote ~150 verified items across tiers, then run the
  golden exam as the real benchmark. A review UI can come later; the curl flow works today.
**Measure:** trustworthy per-segment brand + price numbers.

### Phase 6 — The VYA model (long game)
**Gap:** we rent identification from a general model.
**Do:** once corrections accumulate, fine-tune / distill a VYA-specific model on the labeled set for
identification (and eventually pricing). The training dataset card is already banking for this.

---

## Constraints to design around

- **SerpApi quota** (~1,000/mo). Nightly exam (20) + weekly market-trends keep us under; adding
  nightly price or heavy comp pulls needs a plan (smaller sample, caching, or a plan bump).
- **Per-call model cost** — vision + valuation are 2 Claude calls per intake; keep added passes cheap
  and gated.
- **Cold-start** — learned tables (RN, corrections) are empty until volume accrues; seed where safe,
  never fabricate.

---

## The loop we run

Ship a lever → **run the practice exam with "+ price"** → watch **price-by-category** + the
**corrections feed** → attack the worst segment → repeat. Instruments first, then grind.
