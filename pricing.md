# VYA — Subscription pricing model (working doc)

Goal: set seller subscription prices from real cost-to-serve, know when each vendor plan must
upgrade, and keep margins as VYA scales. **CONFIRMED** = real number; **ASSUMPTION** = placeholder,
confirm before trusting.

---

## 1. Cost inputs

### Fixed / platform (amortized across all stores)
| Vendor | What | Cost/mo | Notes |
|---|---|--:|---|
| **Resend** | Email (transactional + broadcasts) | **$20** ✅ | Transactional Pro, 50,000 emails incl., $0 overage |
| **Vercel** | Hosting / compute / bandwidth | **~$30** ✅ | |
| **Neon** | Postgres | **<$10** ✅ (use $10) | |
| **Voyage** | Embeddings / rerank | **~$0** ✅ | 200M free tokens *per capability* (150B free pixels). Negligible for years. |
| **SerpApi** | Comps pricing + Google Trends | **$25 now** ✅ → **$150 rec.** | On Starter, **901/1,000 used — capping this month**. See §3. |
| **Photoroom** | Ghost-mannequin / backgrounds / fashion models | **TBD** ⚠️ | Pro $7.50 / Max $20.99 / Ultra $82.50 (yearly). Assume **Max $21** until confirmed. |
| **iMessage line (text-to-list)** | Sendblue-style SMS/iMessage intake | **$1,000 one-time + $289/mo per line** ✅ | 210k msgs/mo/line ≈ **~1,000 stores/line** (~170 msgs/store). **Gated to Pro** (only recurring-cost feature). |

### Variable / usage (scales with **items listed**, not orders)
| Vendor | Driver | Cost | Notes |
|---|---|--:|---|
| **Claude (Anthropic)** | LLM: intake vision, descriptions, cross-list copy, Ask VYA, storefront builder | **$100/mo total** ✅ | Pure usage-based. Grows linearly with listings + assistant use. |
| **SerpApi** | comps searches per item + Trends refreshes | within plan cap | **From code** ✅: reverse-image 1–3 (adaptive, clean photo = 1) + a 3-call eBay/Shopping/RealReal basket **only on cold cache**. Raw = 1 (best) to ~6 (worst). **45-day comp cache + VYA-own sold data make it sub-linear** → repeat/similar items ≈ 0 searches. **Empirical: ~901 searches this month.** Working number: **~2.5 effective/item, falling with scale.** |
| **Photoroom** | 1 export/item (first image only; rest are seller's raw photos) | within plan cap | **Confirmed** ✅: exports ≈ items listed → ~$0.007/item |

### Per-transaction (scales with **orders**) — these are already covered by revenue, listed for completeness
| Vendor | Cost |
|---|---|
| Stripe | 2.9% + $0.30 (confirm if negotiated) |
| Shippo (labels) | pass-through; VYA keeps the shipping *margin* |

---

## 2. Cost-to-serve (first cut)

**Fixed pool (production-ready stack):** Resend 20 + Vercel 30 + Neon 10 + SerpApi 150 + Photoroom 21 + Voyage 0 = **$231/mo** (Claude handled as variable below).

**Per active store, fixed-amortized:**
| Active stores | Fixed $/store/mo |
|--:|--:|
| 45 (today) | **$5.13** |
| 100 | $2.31 |
| 300 | $0.77 |
→ Fixed cost per store *falls* as VYA grows. Good scaling story.

**Variable per item listed:**
- **SerpApi:** ~2.5 eff. searches × ~$0.01 (Production tier) → **~$0.025/item** (falls as the cache warms)
- **Photoroom:** 1 export × ~$0.007 → **~$0.007/item**
- **Voyage:** ~$0
- → **Non-Claude variable ≈ $0.03/item**
- **Claude:** $100/mo ÷ items-listed-platform-wide/mo — the single number that resolves the model (§6):
  - at ~2,250 items/mo → ~$0.044/item → **~$0.075/item all-in**
  - at ~600 items/mo → ~$0.17/item → **~$0.20/item all-in**

**MEASURED from the DB (2026-07-26):** ~**28–30 new listings per active store per month** (steady May–Jul),
**~60 stores onboarded** but only **~43–46 list new items in a given month**, **~1,250 listings/mo** platform-wide.
(Guess was 50–100/store — real is ~28.) → Fixed costs amortize across **~60**; AI/variable costs fire only for
the **~45 that list**. ⚠️ The ~15 gap = stores whose Shopify sync isn't pulling new items — worth checking.

Cost to serve one store at **28 items/mo** (fixed-amortized at 45 stores = $5.13):
| Claude/item | Variable (28 × [SerpApi .025 + Photo .007 + Claude]) | **Total cost/store/mo** |
|---|--:|--:|
| $0.04 (est.) | ~$2.03 | **~$7.20** |
| $0.10 (est.) | ~$3.70 | **~$8.80** |

**Takeaway:** all-in cost to serve a typical store is **~$7–9/month.** Trivial vs. the bundle's value +
1% commission + shipping margin → **price on value, not cost-plus.** Listing caps still useful to
contain a rare power-lister, but the real velocity (~28/mo) means most stores sit well inside any tier.

**NOTE on Claude:** the current **$100/mo is mostly the data-layer + marketplace processing + dev/testing** —
the seller-OS intake has only 3 items so far. Per-*intake*-item Claude cost (~$0.04–0.10 est.) should be
re-measured from the Anthropic console once real sellers start listing through intake.

---

## 3. Vendor upgrade cliffs (the strategic part)

**SerpApi** — step-priced; cost/search drops with scale. Upgrade *just before* the search cap.
`items covered ≈ searches ÷ 2.5 eff/item`; `active stores ≈ items ÷ 28 (MEASURED)`.
| Plan | $/mo | Searches | $/search | Legal Shield | ~Items/mo | ~Active stores |
|---|--:|--:|--:|:--:|--:|--:|
| Starter | 25 | 1k | $0.025 | ❌ | ~400 | ~14 |
| Developer | 75 | 5k | $0.015 | ❌ | ~2,000 | ~71 |
| **Production** | 150 | 15k | $0.010 | ✅ | ~6,000 | **~214** |
| Big Data | 275 | 30k | $0.0092 | ✅ | ~12,000 | ~430 |
| Searcher | 725 | 100k | $0.0073 | ✅ | ~40,000 | ~1,430 |

- **U.S. Legal Shield** (indemnity for scraping Google) starts at **Production $150** → effectively the floor for a real product.
- **Action:** you're capping Starter now (~901/1,000). Move to **Production $150** — Legal Shield + covers **~214 active stores**.
- Sub-linear cache means real coverage is *better* than these floors as volume grows.

**Photoroom** (1 export/item → exports = items listed):
| Plan | $/mo | Exports | ~Items/mo | ~Active stores |
|---|--:|--:|--:|--:|
| Pro | 7.50 | 1,000 | 1,000 | ~36 |
| **Max** | 20.99 | 3,000 | 3,000 | **~107** |
| Ultra | 82.50 | 10,000 | 10,000 | ~357 |
→ **Max ($21) covers ~107 active stores** — Photoroom is the tightest cap, so it's the first upgrade
trigger (Max→Ultra at ~100 stores). SerpApi Production lasts to ~214 stores.

**Claude** — no cliffs (pure usage). Watch total $ in the Anthropic console; it's the #1 variable cost.

---

## 4. Revenue context (why margins are huge)

**Two-engine model (subscription-dominant at current scale):**
1. **Subscription** — the PRIMARY, predictable MRR (the tiers below).
2. **1% of ALL GMV through VYA** — every transaction (storefront checkout, cross-listed sales, marketplace),
   not just marketplace-attributed. Scales with each store's success.
3. + shipping margin (small).

**Sizing the commission base — our DB only sees a FRACTION of real store sales.** Marketplace attribution
(`conversions`) is just the VYA-clickthrough slice (~$6–7k/mo total); `sold_items` only catches the synced
catalog (and is a July backfill). Stores gross far more across their own site + other channels. Best estimate
from what we DID measure:
- **Sell-through ≈ new listings** (steady state) = **~28 items/store/mo** (measured, `products`).
- **AOV ≈ $375** — measured: marketplace orders $326→$393→$415 (May→Jul), `sold_items` avg $430.
- → **Total GMV ≈ 28 × $375 ≈ ~$10,500/store/mo.**
- → **1% ≈ ~$100/store/mo → ~$4,500/mo** across ~45 active stores.

So commission is a **genuine second engine (~$4.5k/mo ≈ the subscription MRR)**, and it grows as stores grow
AND as VYA captures 100% of their checkout (vs. the sliver we see today). It's an *estimate* (sell-through +
AOV assumptions) — it becomes exact once stores run checkout through VYA. Both engines are ~pure margin over
the ~$6–8/store cost.

---

## 5. Preliminary tiers (DRAFT — for discussion)

Anchors: Shopify Basic $29 / Grow $79; cross-list tools (Vendoo/List Perfectly) $29–170; ConsignCloud ~$129.
VYA bundles marketplace + storefront + cross-listing + consignment + AI listing + data — worth more than any single tool.

| Tier | Price/mo | Listing allowance | Includes | Cost to serve | Gross margin* |
|---|--:|--:|---|--:|--:|
| **Starter** | $0–19 | up to 50 | core AI listing, marketplace, storefront | ~$9.60 | commission-funded / ~50% |
| **Growth** | $49 | up to 300 | + cross-listing, consignment, email marketing | ~$14–32 | 35–70% |
| **Pro** | $99–149 | fair-use / high | + Data Layer (market insights), priority | ~$15–40 | 70–85% |
| **Enterprise** | custom | unlimited | SLA, onboarding | — | — |

\* subscription-only margin; commission + shipping are additional. Overage or hard caps on listings
protect against whales on lower tiers.

---

## 6. Open questions to finalize
1. ~~SerpApi searches/item~~ — resolved from code: ~2.5 eff/item, sub-linear via cache.
2. ~~Photoroom per item~~ — resolved: 1 export/item.
3. ~~Items/store/month~~ — **MEASURED: ~28/store/mo**, ~45 active stores, ~1,250/mo platform-wide.
4. ~~# active listers~~ — **MEASURED: ~45.**
5. Re-measure **Claude $/intake-item** once real sellers list through intake (today's $100 is data-layer + dev, not intake).
6. Nice-to-have: avg **orders/store/mo** + **AOV** — sizes the (thin) 1% commission + shipping revenue on top of subscription.

---

## 7. Bottom line (with measured data)
- **Cost to serve ≈ $6–8/store/month.** Fixed stack ~$231/mo (÷60 stores = ~$3.85/store) + ~$2–4 variable for the ~45 that list 28 items.
- **Total current platform cost ≈ $330/mo** (Resend 20 + Vercel 30 + Neon 10 + Claude 100 + SerpApi 150 + Photoroom 21) → **~$5.50/store across 60 stores.**
- **Vendor tiers last a long time:** at 28 listings/store, **Photoroom Max ($21) → ~107 stores**, **SerpApi Production ($150) → ~214 stores**. First upgrade trigger is Photoroom (~100 active listers).
- **Immediate action:** SerpApi Starter is capping (~901/1,000) → move to **Production $150** (Legal Shield).
- **Pricing implication:** cost is a rounding error vs. value; subscription is the PRIMARY line (1% commission + shipping are thin adds). Price on **value/positioning**; margins 85–95%.

## 8. FINAL model — 2 tiers, gate on consignment + cross-listing (chosen 2026-07-26)

**Why this gate:** consignment + cross-listing are the tools stores **already pay other vendors for**
(ConsignCloud ~$129/mo, Vendoo/List Perfectly ~$30–70/mo) → proven willingness-to-pay. They cost VYA ~$0
(consignment = DB/logic; cross-listing = free eBay/Etsy APIs + the seller-run browser extension). So gating
them is pure value-capture, not cost recovery — textbook-correct. Unlimited listings + AI everywhere.

| Tier | $/mo | Everything operational\* | + Consignment | + Cross-listing | + Text-to-list | Commission |
|---|--:|:--:|:--:|:--:|:--:|--:|
| **Starter** | **$49** | ✅ (AI listing via app/web) | — | — | — | 1% |
| **Pro** | **$99** | ✅ | ✅ | ✅ | ✅ (iMessage) | 1% |
\* Operational = AI listing/autofill (unlimited, via app/web upload), storefront, marketplace, orders + labels,
inbox, offers, email marketing, CRM, discounts, per-item AI pricing.

**Text-to-list is the ONE cost-justified gate** ($289/mo line) — Starter still gets the same AI autofill via
app/web upload; Pro adds the text-from-anywhere iMessage channel. Concentrating the line cost on the fewer,
higher-paying Pro stores is correct. One line (~1,000 stores) covers you for a long time.

**Unit economics:**
| | Cost to serve/mo | Price | **Gross margin** |
|---|--:|--:|--:|
| Starter | ~$6–8 | $49 | **~85%** |
| Pro (yr 1, ~27 Pro stores) | ~$20 | $99 | **~79%** → ~87% at scale |
- Base cost both tiers = ~$3.85 fixed-amortized (~$231/mo stack ÷ 60) + ~$2.80 AI autofill (28 × ~$0.10).
- Consignment (DB) + cross-listing (free APIs + extension) add ≈ $0.
- **Pro also carries the iMessage line:** $289/mo ÷ ~27 Pro stores ≈ $10.70 + ~$3 setup (yr 1) → +~$13/Pro
  store now, diluting to ~$0.30 as Pro count grows (one line ≈ 1,000 stores).
- Both tiers ~pure margin, **plus 1% of GMV on top.**

**Pro is underpriced vs. what it displaces** — a store today pays **$160–200/mo** for ConsignCloud + a
cross-lister *alone*; VYA Pro at $99 gives both **plus** storefront + marketplace + AI + CRM + email. Room to
price Pro at **$129–149** and still be a bargain; $99 is the aggressive land-grab number.

**Revenue at ~60 stores (say 55% Starter / 45% Pro — many vintage stores cross-list):**
- Subscription: 33 × $49 + 27 × $99 = **~$4,290/mo MRR**
- Commission: 1% × total GMV ≈ **~$4,500/mo** (~$100/store × 45 active; est. from 28 sell-through × $375 AOV)
- less ~$330–430/mo cost → **~90%+ margin**; ~**$8.8k/mo** total today, ~**two equal engines**, both scaling
  as you add stores and capture more of each store's checkout (commission has the most upside).

**Data Layer** (market insights / demand index / sourcing) → **not in the launch tiers.** Ship it later as a
**Pro add-on or a Tier 3** once it's fully built + proven, rather than gating an unproven feature now.

**Onboarding:** $49 floor adds friction vs. free — offset with a **founding-member deal** (e.g. 50% off 6 mo
or first month free) so you onboard your ~60 existing + 20 interested stores now, then $49/$99 is standard.

---

## 9. Cost scaling + break-even (Excel-ready)

### How each cost behaves with scale
- **A. Step-function → margin IMPROVES:** SerpApi (cost/search $0.025→$0.0038 + sublinear cache), Photoroom
  (tiers), iMessage line ($289 ÷ more stores → $0.29), Voyage (free), fixed base (amortizes). Per-store cost FALLS.
- **B. Linear → margin FLAT:** Claude (per-token), Vercel Blob (images), Vercel compute, Neon. Tame with
  Claude Batch API (−50%) + prompt caching + committed-use; reserved Neon; CDN volume pricing.
- **C. Labor → the real swing (not APIs):** support/ops scale with stores. AI self-serve + Ask VYA keep it lean.

### FIXED costs — $/month (independent of store count)
| Line | $/mo | Notes |
|---|--:|---|
| **Payroll** (5 × $120k/yr ÷ 12) | **$50,000** | 99% of fixed cost — the whole break-even story |
| SerpApi (Production) | $150 | steps to Big Data $275 (~430 stores), Searcher $725 (~1,400) |
| iMessage line | $289 | +$1,000 one-time yr 1; one line ≈ 1,000 stores |
| Claude baseline (data-layer + assistant + dev) | $100 | grows slowly; per-store autofill is variable below |
| Vercel (base) | $30 | scales to ~$200 by ~300 stores |
| Photoroom (Max) | $21 | steps to Ultra $82.50 (~107 stores) |
| Resend | $20 | 50k emails |
| Neon | $10 | scales to ~$69 (Scale plan) at data volume |
| Monitoring / misc buffer | $50 | Sentry, compliance, etc. |
| **TOTAL FIXED** | **≈ $50,670/mo** | ≈ **$608k/yr** |

### VARIABLE costs — $/store/month
| Line | $/store | Basis |
|---|--:|---|
| Claude autofill | $2.80 | 28 listings × ~$0.10 |
| Vercel Blob (images) | $0.40 | ~210 MB/store new + bandwidth |
| SerpApi / Photoroom / iMessage marginal | ~$0 | $0 within plan caps (in fixed until a tier step) |
| **TOTAL VARIABLE** | **≈ $3.20/store/mo** | ≈ $38/store/yr |

### REVENUE — $/store/month
| Line | $/store | Basis |
|---|--:|---|
| Subscription (blended 55% Starter $49 / 45% Pro $99) | $71.50 | $85.00 if Pro = $129 |
| Commission (1% × ~$10.5k GMV) | ~$105 | ESTIMATE — the swing factor |
| **TOTAL REVENUE** | **≈ $176.50/store/mo** | $71.50 sub-only |

### Break-even  =  Fixed ÷ (Revenue/store − Variable/store)
Contribution/store = $176.50 − $3.20 = **$173.30**.
| Commission assumption | Contribution/store | **Break-even stores** |
|---|--:|--:|
| **$105/store** (est.) | $173.30 | **~292** |
| $50/store (conservative) | $118.30 | ~428 |
| $0 (subscription only) | $68.30 | ~742 |
| $105/store, **Pro at $129** | $186.80 | **~271** |

### Profit at scale (Pro $99, commission $105/store)
| Stores | Revenue/mo | Cost/mo | **Profit/mo** | Profit/yr |
|--:|--:|--:|--:|--:|
| 80 (pipeline) | $14,120 | $50,926 | **−$36,806** | −$442k (raise covers this) |
| **~292 (break-even)** | $51,538 | $51,604 | **~$0** | ~$0 |
| 500 | $88,250 | $52,270 | **+$35,980** | +$432k |
| 1,000 | $176,500 | ~$54,900 | **+$121,600** | +$1.46M |

**Takeaways:**
- **Payroll is 99% of fixed cost** — profitability is a *store-count* question, not an infra question.
- **Break-even ≈ ~300 paying stores** (if commission lands ~$100/store) or **~740 subscription-only.** You're
  at ~60 + 20 interested → need ~4–9× the store count.
- **Operating leverage is steep past break-even:** each store past ~300 drops ~$173/mo to the bottom line →
  ~$430k/yr profit at 500 stores, ~$1.5M/yr at 1,000. Infra step-ups add only ~$1–2k/mo even at 1,000 stores.
- **Biggest lever on break-even = commission realization** — capturing 1% of *total* GMV (not just marketplace)
  moves break-even from ~740 → ~300 stores. Getting stores onto VYA checkout matters more than any cost cut.
