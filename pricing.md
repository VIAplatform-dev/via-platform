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

## 8. FINAL model — 4 tiers, gate on operator tools + meter listings (updated 2026-08-17)

Supersedes the earlier 2-tier draft. Differentiate on **listings + seats** (the self-serve upgrade trigger) and
gate the **operator tools** stores already pay other vendors for. **Commission-capture features (in-person
payments, Entrupy) are on every tier** — they cost VYA ~$0 and grow the 1% engine, so gating them is self-defeating.

| | **Starter** | **Growth** | **Pro** | **Enterprise** |
|---|---|---|---|---|
| Price | **$49/mo** | **$99/mo** | **$159/mo** | **Custom** |
| For | Solo / casual | Scaling reseller | A full store | Warehouse / multi-store |
| Seats | 1 | 2 | 3 | Custom |
| AI listings / mo | ~50 | ~250 | ~500 (fair-use) | Custom |
| Core\* | ✅ | ✅ | ✅ | ✅ |
| In-person payments (Tap to Pay) | ✅ | ✅ | ✅ | ✅ |
| Entrupy Verified badge + 25% off | ✅ | ✅ | ✅ | ✅ |
| Cross-listing (eBay/Etsy/Depop) | — | ✅ | ✅ | ✅ |
| Consignment module | — | ✅ | ✅ | ✅ |
| Marketing automations | — | ✅ | ✅ | ✅ |
| Text-to-list | — | capped ~150/mo | uncapped | ✅ |
| Support | Standard | Standard | Priority | Dedicated + SLA |
| Commission | 1% | 1% | 1% | Custom |
| ~Gross margin | ~85% | ~70% | ~55–65% | Negotiated |

\* Core = AI listing (photo→listing), storefront builder + import, marketplace, branded checkout + post-order/
tracking, inbox + offers, CRM + cart recovery + product analytics, email marketing, discounts, per-item AI pricing.
Overage ~$1/listing past each cap (~90% margin → no tier goes negative). 30-day trial, no free tier;
founding-member discount to onboard the existing ~60 stores.

**Four design moves:**
1. **Upgrade ladder = listings + seats** — "I hit a limit" / "my partner needs a login" is the strongest, most
   honest conversion trigger (listings are the real variable cost).
2. **Operator tools gate at Growth+** (consignment, cross-listing, automations) — proven willingness-to-pay
   ($160–200/mo at ConsignCloud + a cross-lister), ~$0 cost to VYA.
3. **Commission-capture features on all tiers** (in-person payments, Entrupy) — ~$0 cost, every enabled sale is
   1% to VYA. Gating them would suppress the second engine.
4. **Text-to-list gated by *volume*, not access** — the one expensive per-listing feature (~$0.18 vs $0.12 + the
   $289 line) → capped on Growth, uncapped on Pro; the 500 fair-use ceiling backstops whales.

**Cost to serve (from §9 detail):** Starter (28 photo listings) **~$8/mo → ~85%**; Growth (~200) **~$30–35 → ~70%**;
a text-heavy Pro store (~350 via text) **~$78 → ~55%**. Overage + the 500 cap backstop the extremes. Payroll
(~$50k/mo) is 99% of fixed cost — break-even is a headcount question, not an infra one.

**Data Layer** (market insights / demand / sourcing) → still **not in launch tiers**; ship later as a Pro add-on
or premium module once proven.

**Commission = 1% of VYA-processed GMV** (storefront checkout + marketplace + **in-person**). Scaling — a
per-order cap + volume-regressive rate — is designed in **§8.1**.

### 8.1 Commission scaling — 1% flat, per-order cap, capture-rate is the real lever

**What's captured:** **1% of every sale VYA is the payment rail for** — storefront checkout, **in-person
(Tap to Pay)**, and the marketplace. Any channel where the money moves through VYA.

**What's NOT captured:** off-platform payments — **Venmo / cash / friends-and-family**, and sales that settle on
**another marketplace's checkout** (eBay/Etsy/Depop/Poshmark). VYA facilitates cross-listing but doesn't process
those payments, so there's no 1%. → the strategic pull is to make VYA the **default rail everywhere** so the only
leakage is the low-value cash/Venmo tail. (Corollary: a cross-listed sale that closes on eBay earns VYA $0 — so
the incentive is to make VYA's own storefront + marketplace the channel the sale actually happens on.)

**Rate = flat 1% (self-serve).** It's a *platform fee*, not a 6–20% marketplace take, so it rarely triggers
resistance. No regressive formula for self-serve — **Enterprise negotiates** a lower rate as a volume perk.

**Per-order cap ~$40 — the one real lever.** Keeps high-value grails on-platform (a seller with their own site
*will* route a $10k sale off to dodge a $100 fee — and those are your highest-value transactions):
| Item | 1% flat | Capped ~$40 |
|---|--:|--:|
| $200 top | $2 | $2 |
| $2,000 bag | $20 | $20 |
| $10,000 Birkin | $100 | ~$40 |
| $20,000 Kelly | $200 | ~$40 |

The cap only bites above ~$4k/item (rare), so **aggregate impact is ≈ nil** — but it removes the incentive to
take a grail off-platform. Tunable ($30–50).

**Scaling is capture rate, not the %.** The rate stays 1%; the engine grows by capturing **more of each store's
GMV** onto VYA. In-person (Tap to Pay) is the big unlock — it grabs the offline half that's otherwise cash/Venmo.
| Stage | stores × GMV/store × 1% | Commission/mo |
|---|---|--:|
| Today | ~45 × ~$10.5k | ~$4.5k (≈ MRR) |
| 300 stores | 300 × ~$12k | ~$36k |
| 1,000 stores | 1,000 × ~$12k | ~$120k |

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

---

## 10. Entrupy authentication — 5% rev-share (trust/retention play, thin margin)

**Deal — CONFIRMED 2026-08-16.** Store buys authentications at **25% off list**; VYA takes a **5% rev-share**.
**Entrupy is the merchant** — they bill the store directly (VYA is *not* the reseller). So VYA books **only the
net 5% as revenue, no COGS, no ARPU gross-up.** This mirrors how **Whatnot** runs Entrupy (negotiated seller
discount + the platform is not the merchant). *(An earlier reseller framing — VYA buys at 30% off, resells at
25%, keeps the spread — was dropped: as the card merchant VYA would eat ~2.9% of the gross, which on a 5% spread
halves the margin. Rev-share keeps the full 5% net and offloads all billing/refund/tax/liability to Entrupy.)*

**No hardware** — Entrupy is now app/photo-based (the device is gone), so it embeds fully in VYA intake.

**Pricing is token-based, and scales with the item** (confirm exact rate + whether our 25%/5% applies to tokens):
| Item (tier) | Tokens | List (~$5.60/tok) | **Store pays (−25%)** | VYA rev-share (5%) |
|---|--:|--:|--:|--:|
| Coach bag / Nike sneaker (Contemporary) | 2 | $11.20 | **$8.40** | $0.56 |
| Off-White sneaker (Designer) | 3 | $16.80 | **$12.60** | $0.84 |
| Gucci / LV bag (Designer) | 5 | $28.00 | **$21.00** | $1.40 |
| Chanel bag (Prestige) | 8 | $44.80 | **$33.60** | $2.24 |
| Hermès Birkin (Ultra Prestige) | 20 | $112.00 | **$84.00** | $5.60 |

Per-token retail is **$3.78–$5.60** by plan; at platform rates it's lower. So an everyday $200–$2k piece is
**~$8–28** to authenticate; the scary $84 tier is only Birkins/Kellys (~0.4% of a $20k bag — trivial insurance).

**Why it matters (the margin is NOT the point):**
1. **Thin rev-share.** 5% net, zero cost to serve — e.g. 4 auths/store/mo × ~$20 list × 5% ≈ **$4/store/mo**
   (~$180/mo at 45 stores). A nice add, never an engine. In the lab it's booked net (no gross-up).
2. **The real value = trust + retention.** The **"Entrupy Verified"** badge (99.86% accuracy + a financial
   guarantee — Entrupy buys the item back if a certified piece is fake) lifts buyer confidence → conversion + AOV
   on the exact items where authenticity fear kills the sale. And stores get it **25% off + with no $139–$1,049/mo
   Entrupy subscription** — a sticky reason to route listings through VYA. Reinforces the §8 bundle at $0 to us.

**Competitive context:** $10 services (LegitApp, Authenticate Plus) are a human *photo opinion, no guarantee*;
Entrupy at ~$8–28 is a **guaranteed certificate**, and it's cheaper than eBay ($40 mid-value) or Fashionphile
($75/$125). Positioned right, it's the mid-market "trusted cert," not the cheapest glance.

**Positioning:** offer the **Entrupy Verified** badge + 25% discount to **all tiers** (it's rev-share, costs us
$0, and platform-wide authentication builds buyer trust → GMV). Use it on **high-value pieces** ($500+), where
the fee is trivial vs. the sale and the guarantee matters most.

### 10.1 API integration map — grounded in Entrupy API v2 (developer.entrupy.com)

**Capture is SDK/app-based; results come back over API/webhook.** The actual scan (bag microscopy / sneaker
photos) happens in Entrupy's **iOS/Android SDK or app** — there is **no REST photo-upload**. So VYA signs the
seller into Entrupy *under our org*, the seller scans, and VYA **pulls the result + certificate via API/webhook.**

**Account model — multi-merchant via one org + per-seller users.** VYA = one Entrupy **organization** (partner
**Bearer token**, server-side only). Each seller = a `unique_user_id` (their store slug) — mirrors our per-store
sub-account plan for shipping ([[shipping-provider-decision]]).
- `POST /v2/integrations/authorize-user` — sign a per-seller auth (`unique_user_id`, `email`) → returns a
  `signed_authorization_request` the seller's Entrupy SDK exchanges for a session token. (Legacy:
  `/v2/integrations/app-login-voucher`.) Results carry `owner.user_id` → attributable per store for billing.

**Flow:**
1. On a high-value VYA item, seller taps **"Authenticate with Entrupy."**
2. VYA server calls `authorize-user` → hands the signed request to the Entrupy SDK (embed in via-app, or
   deep-link the Entrupy app). **Set `customer_item_id` = our item id.**
3. Seller scans the piece (device/phone) in the SDK.
4. Entrupy processes → fires our **webhook** (registered via `POST /v2/webhooks` with a `secret_key`, channel =
   authentications; verified domain via `/v2/search/domains`) → `POST /api/webhooks/entrupy` with the `entrupy_id`.
5. VYA fetches `GET /v2/authentications/{entrupy_id}` → `status.result.id` (authentic / not / indeterminate),
   `certificate.url`, images, `timestamp`. (Fallback/poll: `GET /v2/lookup/authentications/{customer_item_id}`.)
6. VYA stores it + sets `entrupy_verified` on the item + the certificate link.
7. **Storefront + cross-listings render an "Entrupy Verified" badge → links to `certificate.url`.**
8. *(Optional, resale-grade anti-swap):* register the item's **fingerprint** (`/v2/fingerprints`,
   `/v2/search/fingerprints`) so at ship/sale we can verify the physical item matches the one authenticated.

**Form prefill:** `POST /v2/config/authentications` + `POST /v2/catalog/brands` return supported brand / material /
category options → prefill the auth form from the item's inferred brand + category.

**Data model — new `authentications` table:** id, store_slug, item_id, provider ('entrupy'), entrupy_id,
customer_item_id, category, brand, status (pending/authentic/not/indeterminate), certificate_id, certificate_url,
result_json, list_cents, wholesale_cents (70%), seller_charge_cents (75%), created_at, resolved_at.

**VYA endpoints to build:**
- `POST /api/store/authenticate` — start an auth (calls authorize-user, writes a pending row, sets customer_item_id).
- `POST /api/webhooks/entrupy` — signature-verified (secret_key) async results → fetch + store + flag the item.
- Badge rendering in `app/s/[handle]/p/[id]` + storefront blocks + cross-listing payloads.

**Billing:** Entrupy invoices VYA at wholesale (70%); VYA charges the seller 75% — cleanest as a **per-auth Stripe
charge** at scan time (card on file), else accrue to the monthly VYA invoice. VYA remits wholesale, keeps the
5-point spread. Reconcile per `owner.user_id`.

**Unknowns that gate the build:**
- Exact **list prices + plan structure** (per-auth vs. monthly bundle) → margin math + billing model.
- Whether the SDK **embeds in our RN app** (via-app) or the flow is a **deep-link to the Entrupy app** (UX only;
  both pull the same result via API).
- **Category coverage** (bags ✅ device; sneakers ✅ photos; watches/apparel?) → map to our inferred categories.
- Certificate `url` is **publicly viewable** (needed for the badge link on public listings) — expected, confirm.
