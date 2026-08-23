# getvya.ai Admin — Build Roadmap

Full project briefs for features to build into the getvya.ai admin (Owner Workspace).
Each: **Goal** -> **Core features** (the meat) -> **User flow** -> **Builds on** -> **Watch**.
Status flags: [HIGH]/[MEDIUM]/[LOW] priority, [CONFIRM] = intent needs confirming.

Full metric-level spec for Deeper Analytics lives in `deeper-analytics-spec.md`.

---

## HIGH PRIORITY

## Deeper analytics — what each store gets

**Goal:** A store-owner analytics dashboard that answers real business questions — average customer
spend, average item price, how each quarter is trending — from the store's own catalog and order
data, with anonymized market benchmarks alongside. VYA already syncs each store's full order +
catalog data, so this is their whole-business dashboard, with "via VYA" as a filter.

**Core features (the metrics)**
- **Sales & revenue:** total sales (GMV), number of orders, average order value ("my customer average spend"), revenue trend vs prior period, best day/week.
- **Customers:** average spend per customer (lifetime), new vs returning, repeat-purchase rate, top customers by spend, total customer count.
- **Pricing & catalog:** average item price on my site (listed), average sold price, price distribution (<$100 / $100-250 / $250-500 / $500+), active listings + inventory value, sell-through rate, avg days-to-sell, catalog mix (top brands/categories/price bands).
- **Product performance:** best & worst sellers, most viewed/favorited, aging inventory (unsold > X days).
- **Engagement via VYA (attributed slice):** views -> favorites -> clicks -> conversions with rates, traffic sources, VYA-attributed revenue vs total.
- **Time breakdowns (cross-cutting):** every metric by quarter (Q1-Q4)/month/custom, with period-over-period + YoY comparison and trend lines. e.g. "Q3 AOV $412, up 8% from Q2 - avg item price $286 - 47 orders."

**Builds on:** conversions (Shopify order cache / Wix / Square sync = whole business), products,
event tables, canonical inferBrandFromTitle / normalizeCategory, data-layer benchmarks (N >= 5).

**Watch:** decide whole-business vs VYA-only (examples read as whole-business = stronger product);
some metrics gated by the deferred availability column — see the spec doc for the full dependency list.

---

## Storefront builder

**Goal:** A full visual storefront editor so any store can import their existing site or build one
on VYA, then edit every section themselves — no code.

**Core features**
- **Two entry modes**
  - *Import* — paste your live URL; VYA captures the homepage + sections into an editable storefront. One-time direction; **admin-only re-sync** to pull updates from the source.
  - *Build* — start from a VYA template and add sections.
- **Section-based editor**
  - Section library: hero, featured products, collection grid, about/story, lookbook/editorial, testimonials, newsletter signup, FAQ, contact, Instagram feed, rich-text/custom.
  - Add / remove / **drag-reorder** sections.
  - Section-panel UX: click a section -> side panel edits its content + style in place.
- **Content editing**
  - Text (headings, body), images (upload to Vercel Blob or re-host from cdn.shopify), product pickers, collection pickers.
  - Product/collection binding: choose which items or collections a section displays.
- **Design system (global theme)**
  - Palette, typography pairing, spacing/density, button style, corner radius — applied as tokens across all sections for consistency, with per-section overrides.
- **Media / SEO ownership**
  - Re-host images off cdn.shopify onto a VYA domain (needed for reverse-image/Lens SEO + so the imagery is attributed to VYA, not the seller's Shopify).
  - Auto product/home metadata + Product/Store JSON-LD; sitemap discovery of live storefronts.
- **Publishing**
  - Draft vs. live with preview (desktop + mobile).
  - Publish to vyaplatform.com/{store}; custom-domain mirror kept **noindexed** to avoid duplicate-content penalties.

**User flow:** signup wizard forks on "have a website?" -> Import (paste URL, we clone, you tweak)
or Build (template + sections) -> edit -> preview -> publish.

**Builds on:** storefront capture, block-builder, collections write-path, image re-hosting cron,
storefront SEO/JSON-LD.

**Watch:**
- ~~Collections **rendering** is still orphaned~~ — **done.** Collection pages render (`/s/{handle}/collections/{slug}` → `StorefrontView` filters by membership), collections appear in the storefront nav, and the "Shop by category" tiles now deep-link: a tile naming a real collection goes to that collection, anything else filters the shop by category.
- Import **fidelity** is the hard part (capture must actually look like their real site) — biggest quality risk.

---

## Apps / extensions

**Goal:** An app marketplace inside the admin where stores connect the tools they already use —
Klaviyo, Instagram, Google Shopping, and more — with one-click connect, per-store settings, and
VYA handling the catalog/data sync behind each. Plus a browser extension for channels with no API.

**Core features**
- **The app directory**
  - Browse/search apps by category; each app has a detail page (what it does, permissions, Connect button).
  - One-click connect via OAuth; per-store install/uninstall; per-app settings; connection health (connected / syncing / error).
- **Apps by category (launch set)**
  - *Email & marketing:* **Klaviyo** (sync customers + events, power flows), Mailchimp. (Native VYA email already exists for the simple case.)
  - *Social selling & shopping feeds:* **Instagram Shopping** (product tagging + auto-post), Facebook/Meta Shop, Pinterest, TikTok Shop.
  - *Product feeds / ads:* **Google Shopping** (Merchant Center product feed), Google/Meta ad pixels.
  - *Cross-listing channels:* eBay, Etsy (server-side API); Depop, Poshmark (via the browser extension).
  - *Analytics:* GA4 / Meta Pixel.
  - *Ops (later):* accounting (QuickBooks), reviews, SMS.
- **Shared plumbing (build once, reuse across apps)**
  - *Product feed engine:* one normalized catalog export, formatted per channel — powers Google Shopping, Meta/IG catalog, and Pinterest.
  - *Customer/event sync:* push customers + events (views/favorites/orders) to marketing apps (Klaviyo/Mailchimp).
  - *OAuth connection manager:* per-store, per-app token storage + refresh + permissions.
- **Browser extension (the no-API channels)**
  - Depop/Poshmark cross-listing in the seller's own logged-in session; sold-elsewhere delist sync; capture-from-any-site intake. **No credential holding** (ban liability).

**User flow:** open Apps -> browse the directory -> connect Klaviyo / IG / Google Shopping in one
click (OAuth) -> configure sync -> VYA keeps catalog + customers flowing to each; install the
extension for Depop/Poshmark.

**Builds on:** OAuth connection manager, product feed engine, existing native email, Klaviyo creds
(KLAVIYO_CLIENT_SECRET), Meta Graph (IG), eBay/Etsy/Depop creds, cross-listing hybrid architecture.

**Watch:**
- The **product feed engine** is the shared dependency for Google Shopping + Meta/IG/Pinterest — build it first.
- Overlap: the **Integration with IG** roadmap item is the deep build of the Instagram app listed here.
- Google Merchant Center / Meta catalog approval + feed-spec compliance.
- Depop API pending -> extension is the workaround; extension maintenance + Chrome Web Store review.

---

## In-person payments (Tap to Pay) — build spec

**Why:** capture the *offline half* of every seller's GMV (markets, pop-ups, physical shop) — the sales that
today leak to Venmo/cash. Every in-person sale then runs the **same 1% commission** as online. Offered on **all
tiers** (§8) — it costs VYA ~$0 and is the biggest lever on commission capture-rate. **No hardware** — the
seller's phone IS the reader (Tap to Pay on iPhone / Android).

**Home:** the existing **`../via-app` (Expo/RN)**, behind the store-partner sign-in it already has (the mobile
JWT `storeAuth` falls back to). New "Sell in person" screen in seller mode. **No separate app.**

**Reuses the entire direct-charge stack** — an in-person charge is just a **card-present PaymentIntent on the
seller's connected account** with `application_fee_amount` = our 1% (`applicationFeeCents`, `payments-config.ts`),
identical to `item-intent`/`cart-intent`. Same `markSold` → `createPaidOrder` → webhook → receipt path.

### Flow
1. Seller opens the app (signed in as their store) → **Sell in person** → picks an item (or enters a custom amount).
2. App fetches a **connection token** from our backend (scoped to the store's connected account).
3. SDK discovers + connects the **Tap to Pay reader** (the phone) against the store's Stripe **Location**.
4. Backend creates a **card-present PaymentIntent** on the connected account (`application_fee_amount` = 1%).
5. `collectPaymentMethod(clientSecret)` → customer taps card / Apple-Google Pay → `confirmPaymentIntent`.
6. Success → existing webhook fulfils: `markSold`, `createPaidOrder`, 1% captured, buyer receipt (the new
   store-branded order/tracking page + email — reuse `sendBuyerOrderConfirmation`).

### Backend to build (thin — mostly reuse)
- `POST /api/store/terminal/connection-token` — `stripe.terminal.connectionTokens.create()` **on the store's
  connected account** (`stripeAccount` header). Store-authed.
- `POST /api/store/terminal/payment-intent` — card-present PaymentIntent on the connected account:
  `payment_method_types:['card_present']`, `capture_method:'automatic'`, `application_fee_amount: applicationFeeCents(amt)`,
  `metadata:{ itemId, storeSlug, channel:'in_person' }`. Returns `client_secret`.
- Ensure a Stripe **Location** per store (`stripe.terminal.locations.create()` on the connected account) — create
  lazily on first in-person sale, cache the id on the store's payments record.
- Webhook: `payment_intent.succeeded` already fulfils — add nothing except read `metadata.channel` so in-person
  vs online is distinguishable in analytics (feeds the §8.1 capture-rate story).

### Client (via-app)
- Add `@stripe/stripe-terminal-react-native`; wrap seller mode in `StripeTerminalProvider` with a `tokenProvider`
  that calls the connection-token endpoint.
- `discoverReaders({ discoveryMethod: 'tapToPay' })` → `connectReader(reader, { locationId })`.
- "Sell in person" screen: item picker / amount pad → collect → confirm → success (mark sold, show receipt).

### Prerequisites / gotchas (the real work is setup, not logic)
1. **Native build required** — Terminal needs native code + entitlements, so **EAS dev/prod build, not Expo Go.**
   Confirm via-app is on EAS.
2. **Apple entitlement** — request `com.apple.developer.proximity-reader.payment.acceptance` from Apple; requires
   **iOS 16.4+**, **iPhone XS or newer**, supported region (US ✅). Android Tap to Pay on supported devices.
3. **Connect capability** — enable **`card_present` / Terminal** on connected accounts (small add to onboarding);
   each store needs a **Location** record.
4. **Card-present fees** are the seller's (direct charge) and *lower* than online (~2.6% + 10¢) — an easy yes.

### Test
- Stripe Terminal **simulated reader** for logic; then a real device with the entitlement in a Stripe **test**
  connected account before requesting Apple prod entitlement.

**Scope:** a few weeks — most of it is Apple entitlement + EAS config + Connect capability; the payment logic is a
thin reuse of the existing direct-charge PaymentIntent + fulfilment.

---

## MEDIUM PRIORITY

## Live selling

**Goal:** Let stores run live shopping events inside VYA — video + real-time drops with instant
checkout and inventory sync.

**Core features**
- **Broadcast:** live video (host from the app or web), real-time viewer count + chat with moderation.
- **Show runner / lineup:** queue products for the show from the existing catalog; "now showing" pin + upcoming lineup.
- **Real-time selling mechanics**
  - Per-item **claim/buy** with first-come inventory hold (cart hold + timeout); live sold-out state.
  - Show-only flash pricing / drops.
  - (Phase 2) auction/bidding format.
- **Checkout:** in-stream or claim-then-pay via Stripe; passwordless per-store buyer identity; sales attributed to VYA with commission.
- **Notifications:** "store is live" push/email/text to followers + favoriters (via Linq notify); scheduled shows + reminders.
- **Post-show:** replay/VOD; unsold items return to catalog; show analytics (viewers, conversion, revenue).

**User flow:** schedule show -> notify followers -> go live -> pin items, buyers claim -> checkout
-> replay saved + analytics.

**Builds on:** buyer messaging + Linq notify, sold_items availability, Stripe checkout, catalog.

**Watch:**
- Video infra is a **build-vs-buy** decision (self-host WebRTC/HLS vs. a provider like Mux) — biggest cost/effort driver.
- Real-time infra (websockets) + inventory-hold concurrency are the hard engineering.
- Live is a **new conversion source** — attribution + commission path needs wiring.

---

## Rental Model  [CONFIRM: garment rental, Rent-the-Runway style?]

**Goal:** Support rental — not just resale — so stores can rent pieces out with reservations,
deposits, and returns.

**Core features**
- **Rentable inventory type** (flag on a product): rental price, period options (e.g. 4-day / weekly), refundable deposit / insurance, retail value.
- **Availability calendar** per rentable item (booked dates + cleaning/turnaround buffer).
- **Rental checkout:** rental fee + refundable deposit via Stripe (authorization/hold).
- **Two-way fulfillment:** outbound + prepaid return label.
- **Return workflow:** mark returned -> condition check -> release deposit or charge for damage; late fees; rental extension.
- Rent-or-buy toggle where an item supports both.

**User flow:** list a rentable piece -> buyer books dates -> pays fee + deposit hold -> ships out ->
returns -> condition check -> deposit released.

**Builds on:** Stripe (deposit auth/capture), two-way shipping labels, availability calendar.

**Watch:** deposit authorization vs. capture flow; calendar concurrency; cleaning turnaround; damage disputes.

---

## Integration with IG

**Goal:** Connect Instagram so stores can sell from and sync with their IG presence.

**Core features**
- Connect IG business account (OAuth via Meta Graph — token already wired).
- **Auto-post** new arrivals / drops to feed + story from the admin (on-publish or scheduled).
- **IG Shopping**: product tagging tied to the VYA catalog (catalog synced to Meta commerce).
- **Import from IG**: pull posts/photos to seed listings at onboarding.
- Shoppable posts / link-in-bio route back to VYA product pages.
- (Optional) comment/DM -> cart automation.

**User flow:** connect IG -> new listing auto-posts (or scheduled) -> tagged IG post routes back to
the VYA product; onboarding can import existing IG photos into listings.

**Builds on:** Meta Graph (IG_ACCESS_TOKEN wired), catalog, new-arrivals content format.

**Watch:** Meta commerce catalog approval + requirements; API rate limits; token refresh cadence.

---

## Sourcing



**Builds on:** price-engine + comps (SerpApi google_shopping / ebay / lens) for resale valuation,
Voyage embeddings for taste matching, `check-saved-searches` cron, marketplace channel connections
(eBay/Etsy/Depop), reverse-image search; demand-db for the secondary demand overlay.

**Watch:**
- **Marketplace access** is the hard part — Depop/Poshmark/Vestiaire have no open API, so it's search/scrape (ToS, rate limits, maintenance — same class of problem as the cross-listing extension).
- **Valuation accuracy IS the product** — the buy signal is only as good as the resale estimate; lean hard on the existing price engine + comps + condition.
- Cross-source dedup (one piece listed on multiple marketplaces).

### Cost & data flywheel

**Cost drivers — really just one variable: data acquisition.**
- *API channels (eBay, Etsy)* — ~free within rate limits. SerpApi (already paid, $0.015/search) covers the `ebay` + `google_shopping` engines, so part of this is sunk cost.
- *No-API channels (Depop, Poshmark, Vestiaire, Grailed, Vinted, Mercari, TheRealReal)* — scraping; this is where the money goes.
- *Valuation* — only value items matching an **active saved search / brief**, and **cache comps by product identity** (reuse the lens-cache pattern) + reuse the existing price engine. Turns "value the whole internet" into "value a few hundred candidates per store/month" — bounded and cheap.
- *Embeddings + storage* — negligible.
- **The one lever that sets the whole cost: pull-on-demand (per active search), NOT crawl-everything.**

**The flywheel — the same scraping spend does triple duty:**
- Every listing pulled is a fresh comp -> sharper valuations -> better deal flags AND better seller-facing pricing.
- Feeds the **Data Layer**: near-real-time supply + price across the whole secondhand market by brand/category/condition — a rare, auto-sourced, objective dataset.
- Powers **Deeper Analytics benchmarks** ("your avg item price vs. the live market", not just vs. other VYA stores).
- Demand (VYA already has it) x live supply/price = "wanted AND underpriced right now" — the strongest buy signal, unproducible by any single marketplace.
- *Caveat:* use scraped data **internally** (valuation, sourcing, derived stats). Reselling raw listings breaches marketplace ToS — monetize **derived** market stats (medians/trends), not republished listings.

**Build our own scraper + storage tool?** Right frame: own the parts that are your moat and cheap to own; rent the adversarial parts until scale justifies owning them.
- **Own from day one — storage + price history.** An append-only price-observations store (listing -> price -> timestamp) is the compounding asset: you can't buy back history you didn't capture, and it's what makes the data product + valuation models possible. Never rent this.
- **Own — scraper logic + normalization** for the high-value no-API channels (Depop, Vestiaire, Grailed): custom parsers tuned to the exact fields (brand, condition, size) + cross-source dedup. This is your extraction-quality edge.
- **Rent (at first) — proxies + anti-bot.** Marketplaces run serious bot detection (Cloudflare / DataDome / PerimeterX); rotating residential proxies + fingerprinting is an arms race vendors (Bright Data / Zyte / Apify) already solve. Bring proxies in-house only when volume makes the vendor markup hurt.
- **Cost shape:** *buy* (scraping API) ≈ $0.001–0.01/page, zero fixed cost — cheapest to START. *Build* ≈ similar per-page proxy cost + eng build/maintenance — wins at HIGH volume and gives you the owned data asset. So: start on APIs + SerpApi + a scraping vendor for the hard channels; graduate to owned proxies as volume grows.
- **Compliance:** APIs-first is cheaper AND safer — respect robots/ToS, rate-limit, never bypass CAPTCHAs; keep to public listing data and derive stats rather than redistribute.
- **Maintenance tax:** every marketplace = a scraper to maintain (their DOMs change) — same recurring cost as the cross-listing extension. Budget for it.

---

## Vendor Model

**Goal:** Let a store run its own mini-marketplace — sell pieces from OTHER vendors (other stores,
sellers, consignors) under that vendor's name and collect commission. For the store with an in-person
spot or curated shop that carries other people's inventory alongside its own.

**Core features**
- **Vendors:** add/manage vendors (other stores, sellers, consignors); each has a name/profile the items display under.
- **List under a vendor:** add a piece attributed to a vendor; it shows under that vendor's name in the store + storefront.
- **Commission / splits:** set a commission rate per vendor (or per item) — the store's cut vs. what's owed to the vendor.
- **Vendor ledger + payouts:** running balance per vendor; each sale records the split; payout history + what's owed.
- **Per-vendor inventory & sales:** which items belong to which vendor; per-vendor sales reports.
- **Online + in-person:** works for online listings and in-person/consignment intake.
- **(Optional) vendor visibility:** vendors can see their own items + sales, or it stays fully store-managed.

**User flow:** store adds a vendor -> lists that vendor's pieces under the vendor's name -> a piece
sells -> the commission split is recorded -> the vendor's payout is tracked in a ledger.

**Builds on:** the Consignment module foundation (this is essentially consignment generalized to
"vendors"), Stripe for splits/payouts, per-vendor inventory attribution.

**Watch:** payout mechanics (Stripe Connect splits) + who's merchant of record; commission accounting;
heavy overlap with the Consignment module — likely one shared build.

---

## LOW PRIORITY

## A/B Agentic Website Testing

**Goal:** An AI agent that generates and A/B-tests storefront variants to lift conversion —
hands-off optimization.

**Core features**
- Agent proposes a variant per hypothesis (hero, copy, layout, price display, CTA).
- Split traffic (50/50 or multi-armed bandit); measure conversion / revenue-per-visitor.
- Auto-pick winner; **owner approval gate** before publish + rollback.
- Test log / learnings history.

**User flow:** agent suggests a test -> owner approves -> traffic splits -> winner surfaces ->
owner publishes (or auto-publishes within guardrails).

**Builds on:** Storefront builder (generates variants) + Deeper analytics (measures them).

**Watch:** needs enough traffic for statistical significance; keeps AI in the sanctioned
"website-builder" lane (not a per-page agent); approval guardrails are essential.

---

## Wholesale docs uploader

**Goal:** Upload wholesale documents easily — even in another language — and have AI extract and
translate the info, load it straight into inventory, and keep the original on file as a record.

**Core features**
- **Upload any doc:** PDF / CSV / image / phone photo of a line sheet, invoice, or packing slip.
- **Multi-language extraction + translation:** AI reads docs in any language (Italian, French, Japanese, Korean — common in vintage/luxury wholesale) and translates the fields to English (Claude vision + translation).
- **Structured extraction:** pull SKU, product name, brand, qty, wholesale cost, MSRP/retail, size, material.
- **Straight into inventory:** create inventory records / draft listings from the rows, with COGS + margin set.
- **Records kept on file:** store the original document + parsed data as a permanent purchase record (cost basis, supplier, date) — reconcile against goods received.
- **Review before commit:** bulk-review the extracted table, fix anything, then push to inventory.

**User flow:** upload a foreign-language line sheet -> AI extracts + translates -> review the table
-> push to inventory with the cost records saved.

**Builds on:** AI intake pipeline (draftListing) + Claude vision/translation.

**Watch:** extraction accuracy on messy scans/handwriting; document-format variability; wholesale-cost
vs. retail mapping; keep originals for records/audit.
