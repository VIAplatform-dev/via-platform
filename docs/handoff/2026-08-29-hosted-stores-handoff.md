# Hosted Stores — Handoff (2026-08-29)

Read this first if you are a new Claude Code session picking up the hosted-store work. It is
written to be executed, not admired. Everything referenced exists on disk on branch
`import/m0-capture-shim` (uncommitted — see §10).

---

## 0. Rules that override everything (from the user; do not violate)

- **NEVER `git commit` or `git push` unless the user says so in that exact message.** "Commit and
  push" never carries forward. Make changes, then stop.
- **Never read `.env` / `.env.local` / secrets.** Run scripts with `--env-file=.env.local`; never
  print env values.
- **Never write to production (Neon DB, Vercel Blob, sellers' sites) without explicit confirmation
  in the current message.** Reads are fine. Blessed writable test stores: `test-import`,
  `test-import-2`, `sourcedbyscottie`, and `blummier` (authorised for `store_health` publish only).
  A fleet run writes to every store — it needs a fresh "go".
- **The user's machine is not a server.** Do not leave long CPU/Playwright jobs running unattended
  without telling them; kill anything that runs longer than expected. One heavy process at a time.
  Stop the Next dev server when checks are done (`pkill -f next-server`).
- **Do not use subagents for the fleet.** They stalled, crashed (exit 144), and burned the user's
  token budget. Use the unattended `scripts/fleet.sh` instead. Do not poll it; the log tells you.
- **Do not use claude-in-chrome.** Verify with Playwright (`scripts/verify-store.mts`) or the
  user's screenshots.
- **Never import `unique-vintage.com`.** It is discarded (`DISCARDED_HOSTS` in `site-capture.ts`).
- Many files use **1-space indentation**. Match the file. Ignore stale `.next/types/*` tsc errors.
- The user reads plain English. Explain in the seller's terms before the engineer's.

---

## 1. The goal, in the user's words

> "We want to make sure as a company to have 1:1 with the website and don't lose the
> JavaScript, products, and UI."

A seller's store on VYA (`<slug>.vyasites.test:3348` locally; a real host suffix in prod) must be
indistinguishable from their own site for a shopper — same products at the same prices in the same
collections, same look, same theme behaviour — **and must keep working if the seller cancels
Shopify.** And this must hold for every current store and every future one *without per-store
hand fixing*.

### What "1:1" honestly means today

| Layer | State | Proof |
|---|---|---|
| Catalog (every product, price, currency, sold status) | **Done and self-checking** | parity `CATALOG 100%` on blummier, test-import |
| Placement (which products in which collection) | **One engine fix left** | 9 stores off by a few — throttled reads (§6.1) |
| Look (theme HTML/CSS/fonts/photos) | **Done** | side-by-side screenshots |
| Survives Shopify cancellation | **Done on small stores; backlog on large** | blackout gate (§4.3) |
| Theme JavaScript (menus, drawers, carousels) | **Done** (Plan B keeps theme JS) | interaction pass in verifier |
| Shopify's own JS (cart, checkout, search, recommendations, accounts) | **Replaced by ours, by design** | not mirrored; "you may also like" strip differs |

The decision the user still owes (§9): what "1:1" *promises* a seller. "Your store, our checkout"
is deliverable now; "nothing changes" is not.

---

## 2. Architecture in one screen

- **Capture** (`app/lib/site-capture.ts`): crawl the seller's site, store each page's HTML in Neon
  `site_captures` (`store_slug, path, html`). Product grids are re-rendered from live VYA inventory
  at serve time (`liveGridHtml`, `renderThemeCard`) — never frozen source HTML. Sold items stay
  visible with a Sold badge and no add-to-cart.
- **Plan A vs Plan B**: Plan A serves from VYA origin `/site/<slug>` with scripts stripped; Plan B
  serves from the store's own host (`<slug>.vyasites.test`) keeping theme JS, proxying `/cdn/`.
  Shopify stores → Plan B, fallback Plan A. `STORE_HOST_SUFFIX` picks link shape at capture time.
- **Import / repair** (`app/lib/store-import.ts`, `capture-commerce.ts`, `shopifyClient.ts`):
  products from `products.json` (home-market forced via `Cookie: localization=<CC>`, read from the
  homepage's `countryCode`), items upserted, membership from `/collections/<h>/products.json`
  with an **unread-collection guard** (a throttled `200 {"products":[]}` never wipes a collection).
  A product that disappears from the feed is marked `sold` (an inference — see §9).
- **Rehost** (`app/lib/rehost-theme-assets.ts`): copy every theme asset (JS, fonts, images, video,
  import maps, extensionless `/cdn/fonts/`) to Vercel Blob under `theme/<slug>/…`, then rewrite
  every textual form of the URL in every page. Lives **inside `captureSite`** (`opts.rehost`), so
  new captures own their assets; `scripts/rehost-theme-assets.mts` is only the backfill. Idempotent:
  already-owned URLs are skipped (`list({prefix})`). **Rewrite is single-pass (`rewritePageUrls`)**
  — the old per-URL split/join took 5 h on a 369-page store.
- **Serve**: `app/site/[slug]/[[...path]]/route.ts`, `app/site/[slug]/products/[handle]/route.ts`,
  `middleware.ts`, `app/lib/plan-b/*` (cart drawer, cart submit, scripts allow/deny list).
- **Checks** (all in `scripts/`, all Playwright/Node, all read-only unless stated):
  `verify-store.mts` (interaction pass), `blackout-check.mts` (Shopify blocked), `parity-check.mts`
  (source vs ours), `grade-store.mts` (tiers; `--publish` **writes**), `census.mts` (cluster by
  kind), `repair-store.mts` (**writes** items/collections), `fleet.sh` (all of it, per store).
- **Seller-facing**: `app/lib/store-health.ts` (grading), `store-health-db.ts` (`store_health`,
  `store_health_reviews`), `app/api/store/hosted-review/route.ts`, portal tab **Hosted Store**
  (`app/store/dashboard/HostedStoreReview.tsx`) — findings in seller words + side-by-side
  screenshots + *Looks right / Something's off / Skip*.

Deeper design notes: `docs/superpowers/specs/2026-08-28-market-mode-design.md` (Market Mode —
unrelated but same branch), memory files listed in §11.

---

## 3. How to run things

Prereqs: Node 24, `npm ci`, `.env.local` present (never read it), `/etc/hosts` has
`127.0.0.1 <slug>.vyasites.test` for every store (a line per slug; user adds with sudo).

```bash
# dev server on the port every check expects
npm run dev -- -p 3348            # stop it afterwards: pkill -f next-server

# quality gates
npx tsc --noEmit                  # ignore .next/types/* errors
npx eslint <files>
npm test                          # node --test; 2 pre-existing failures import next/cache (comps, unbranded-benchmark)

# one store, one step at a time (read-only unless marked)
npm run verify:store  -- <slug> --port 3348          # interaction pass
npm run blackout:store -- <slug> --port 3348 --label fleet
npm run parity:store  -- <slug> --port 3348          # writes .verify/<slug>/parity.json + parity-*.png
node --experimental-strip-types scripts/grade-store.mts <slug>            # local only
node --experimental-strip-types --env-file=.env.local scripts/grade-store.mts <slug> --publish   # WRITES store_health + Blob health/
node --env-file=.env.local --import tsx scripts/repair-store.mts <slug>   # WRITES items/collections (hits seller's site)
node --experimental-strip-types --env-file=.env.local scripts/rehost-theme-assets.mts <slug>     # WRITES Blob + site_captures

# the whole fleet, unattended (WRITES everything above for every store — needs the user's go)
nohup scripts/fleet.sh > .verify/fleet2.log 2>&1 &
tail -f .verify/fleet2.log        # ends with "══════ FLEET DONE"; report .verify/FLEET-REPORT.md; census .verify/CENSUS.md
npm run census                    # re-cluster from existing .verify/*/health.json, no network
```

Gotchas learned the hard way:
- Two processes on one seller at once → Shopify throttles → empty collection reads. Never run
  repair/parity/fleet concurrently on the same store.
- zsh reads `fleet.sh` incrementally; editing it while it runs is safe only for code after the
  current loop body was parsed. Prefer: kill, edit, restart.
- `parity-check.mts` once contained literal NUL bytes in a regex (grep called it binary). It is
  clean now; if grep ever says "binary file", check for `\x00`.
- `git checkout package.json` once discarded uncommitted deps (`playwright`, `server-only`). Don't.
- Metrics lie; screenshots don't. Seven times a numeric "SURVIVES" was wrong and the PNG showed a
  blank hero. Always open `.verify/<slug>/*BLACKOUT*.png` next to `*normal*.png`.

---

## 4. The checks, what each proves, and its known blind spots

### 4.1 `verify-store.mts` — does it behave
Loads key pages, checks tiles/images/overlays, opens the cart drawer, adds to cart (via `/cart.js`
count), searches, filters. Sold-aware. Blind spots: it mutates a real cart; keep it off nightly.

### 4.2 `parity-check.mts` — is it the same store
- **Catalog**: feed vs `items`. `missingHere` excludes unsellable feed products (no price, nothing
  available — archive display pieces). `extraHere` counts **active** items only (sold pieces stay
  here on purpose; the seller's feed drops them). Per-collection counts.
- **Pages**: sitemap vs captures (locale variants like `/de/…` inflate "missing"; known).
- **Shopper**: 3 pages (home, busiest collection, latest product) loaded on both sides; titles,
  order, **prices normalised to currency+amount** (`$1,200.00 USD` ≡ `$1200`), nav, headings.
  Records `missingTitles`/`missingPrices` so findings can quote them.
- Writes `.verify/<slug>/parity.json` and `parity-{source,ours}_<page>.png`.

### 4.3 `blackout-check.mts` — does it survive cancellation
Loads 3 pages normally and with every Shopify host **and** our `/cdn/` proxy blocked; compares
imgs loaded, product links, header, logo, videos playing, CSS backgrounds. Writes
`blackout-<label>.json` + screenshots. Blind spot: only 3 pages; below-the-fold losses don't show in
the viewport screenshot (blummier home: 28 photos lost, screenshot identical).

### 4.4 `grade-store.mts` + `store-health.ts` — what it means
No score. Findings carry a **tier**; verdict = worst tier present.
- **blocking** (`fail`): product missing / active-but-gone / wrong sold-out status; a price
  differs (only beyond what absent products explain); a page didn't load; product links or header
  lost under blackout.
- **degrading** (`warn`): photos / video / logo / background lost; collection counts off;
  products on their page not shown on ours (collection/home); pages not copied; "couldn't compare"
  (0/0 products on a page).
- **cosmetic** (`pass`): order, menu links, and on product pages the "you may also like" strip.
Messages are seller-worded; a test forbids "Shopify/blackout/cdn/parity" in them.

### 4.5 `census.mts` — where the fixes go
Groups every finding across stores by *kind* (`findingKind`: counts → N, examples dropped, page →
home/collection/product). A kind on many stores is **our** bug (engine or checker), fix once. A
singleton is that store's fact — it belongs on the seller's Hosted Store tab, not in the engine.
The loop: **fleet → census → fix the top line → fleet.**

### 4.6 What none of this verifies (be honest with the user)
Pixel sameness (deliberately not built — masks would be per-store tuning in disguise); every page
under blackout; behaviour on mobile; geo/logged-in views; and anything past the storefront — order
emails, shipping, tax, discounts, accounts, DNS/SSL cutover. **Never show "Ready".**

---

## 5. State of the fleet (as of 2026-08-29 ~19:30)

23 hosted stores: ange-archive, ascensio-demo, awoke-vintage, bag-crush, blummier, chill-boutique,
feathers-boutique-vintage, hachi-archive, lamash, lei-vintage, love-again-vintage, loved-again,
maison-optimism-vintage, montrose-edit, shop-vintage-charm, sourcedbyscottie, test-import,
test-import-2, the-objects-of-affection, thenicheshop, vintage-archives-la, vintage-boutique-style,
we-thieves.

- **Round 1** (`.verify/FLEET-REPORT.md`, log `.verify/fleet.log`): 20/23 rows. It ran with the
  *pre-fix* engine for early stores (currency, sold/£0 rules landed mid-run) and was killed on
  `thenicheshop` during the 5-hour quadratic rehost. Un-gated: thenicheshop, vintage-archives-la,
  vintage-boutique-style, we-thieves. Grades exist for 16 stores (`.verify/*/health.json`), made
  with older checker rules.
- **Round 2: not started.** It will be much lighter (rewrite fixed). It publishes `store_health`
  for all stores → needs the user's explicit go. Start: `nohup scripts/fleet.sh > .verify/fleet2.log 2>&1 &`.
- **blummier** is the reference store: fully repaired (GBP), parity 100%, verdict **WARN**
  (nothing blocking), published to the portal, and documented with pictures at
  https://claude.ai/code/artifact/9adb89f2-1863-409e-8de1-b6d2b79ed9e8 (built from
  `.verify/blummier/`).
- Proven to survive full Shopify blackout on all key pages: test-import,
  feathers-boutique-vintage, hachi-archive, lamash, love-again-vintage, maison-optimism-vintage.

### Round-1 census (stale rules; annotated)
```
10 stores  products not shown here [product]      recommendation strip — FIXED (cosmetic now)
 9 stores  collection counts differ                throttled reads — NEXT ENGINE FIX (§6.1)
 7/5/5     photos would stop loading [home/product/collection]   rehost pre-cap backlog — round 2 clears
 6 stores  products missing here (blocking)        £0 sold-out archive pieces — FIXED
 6 stores  products not shown here [collection]    LOOK: probably pagination (we render page 1)
 5 stores  products not shown here [home]          LOOK: live "new in" strips on their side
 4 stores  section headings missing [home]         LOOK: app-injected sections we strip (popups)
 3/3       prices differ [collection/product]      GBP-as-USD — FIXED, needs round-2 repair
 3 stores  pages not copied                        LOOK: /de/ /it/ locale variants in sitemap
 3 stores  products no longer on your site         sold items — FIXED
 2 stores  video would stop playing [home]         old 20 s video timeout — FIXED, round 2
 cosmetic  menu links / order differ               noted, never gating
singletons: chill-boutique (sold-out status, home prices), shop-vintage-charm (product links lost
under blackout — the one true blackout failure), test-import (a product page didn't load),
montrose-edit (heading).
```

---

## 6. Backlog, in priority order (each is engine-level; none is per-store)

1. **Paced collection reader** — `getShopifyCollectionMembership` in `store-import.ts`: add a
   delay between collection requests (start 700 ms), retry the empty-`200` response as a throttle
   (it already retries 429/5xx), cap concurrency at 1 per seller. Removes the #1 census line.
   Then also investigate `gucci 0/24` on blummier (source serves an empty collection — unpublished?
   then hide ours too).
2. **Product-page price text is frozen at capture** — the PDP HTML carries the capture-time price
   markup. Must render the item's live `priceCents`/`currency` (the GBP fix exposed this).
3. **Crawl in the home market** — `fetchHeaders` in `site-capture.ts` should send
   `Cookie: localization=<CC>` too, so captured pages don't bake `Shopify.currency = USD`.
4. **`syncCollectionOrder` reads page 1 only** of a captured collection.
5. **Locale page variants** (`/de/…`, `/it/…`): exclude from "pages missing" or capture them
   deliberately. Also ~32 MB trailing-slash duplicates in `site_captures` (safe delete; user's call).
6. **Frozen "N products" count labels** in collection headers (cosmetic).
7. **Blackout: gate all pages weekly** (`blackout-check` already takes a page list); import-time
   stays at 3 pages.
8. **Fold `verify:store` into the fleet** with a blessed test item per store — never mutate a real
   cart nightly.
9. **Mobile viewport pass** in parity (most vintage shoppers are on phones).
10. Known cosmetic: hachi-archive/thenicheshop card-width drift; bag-crush empty hero;
    awoke-vintage missing collection header; maison logo clip; loved-again PRADA vendor; lamash £
    on "Under $1,000".
11. `/etc/hosts` still has `unique-vintage.vyasites.test` — user removes with sudo.

Do **not** build: a pixel diff, a single numeric score, a "Ready" label, a nightly fleet (weekly
is in `.github/workflows/fleet.yml`; needs a `FLEET_ENV_FILE` secret to run).

---

## 7. How to work a census line (the method)

1. `npm run census` → read the top multi-store line.
2. Pick one store that has it; open its `.verify/<slug>/parity.json` / `blackout-fleet.json` and
   the PNGs. Decide: **engine bug** (import/rehost/serve), **checker bug** (parity/grade), or
   **real seller fact**.
3. Engine/checker bug → write the failing test first (`app/lib/*.test.ts`, `node --test`), fix,
   run the single-store check to prove the finding disappears, then let the next fleet round prove
   it everywhere. Seller fact → leave it; it shows on their Hosted Store tab.
4. Never "fix" the store. If you touched a specific store's data to make a line go away, you did
   it wrong.

---

## 8. Data you may touch, and where it lives

- Neon: `site_captures` (page HTML, ~1.9 GB), `items`, `item_collections`, `collections`,
  `sellers`, `import_jobs`, `store_health`, `store_health_reviews`.
- Vercel Blob: `theme/<slug>/…` (rehosted assets, ~3.6 GB across stores), product images,
  `health/<slug>/parity-{source,ours}_<page>.png`.
- Local: `.verify/<slug>/` (all check output; gitignored), `.verify/FLEET-REPORT*.md`,
  `.verify/CENSUS.md`, `.verify/fleet*.log`.
- Blessed for writes without asking again: `test-import`, `test-import-2`, `sourcedbyscottie`;
  `blummier` for `store_health` publish only.

---

## 9. Decisions the user owes (ask, don't assume)

1. **Vanished pieces**: a product that disappears from the seller's feed is marked **Sold**. That is
   an inference (blummier's 9 were all 404 on their site — deleted or sold, unknown). Options: keep
   "Sold"; label "No longer available" when inferred and "Sold" only when Shopify said sold-out
   (`available:false` while still listed); or hide deleted pieces. No code written.
2. **What "1:1" promises sellers**: "your store, our checkout" vs "nothing changes".
3. **Round 2 go/no-go** (writes `store_health` for 23 stores).
4. Neon deletions: trailing-slash page variants (~32 MB, safe), `test-import*` fixtures (~41 MB).
5. Whether anything gets committed, and what.

---

## 10. Git state

Branch `import/m0-capture-shim`, nothing committed from this work. Changed/added (high level):
`app/lib/{site-capture,site-capture-db,store-import,shopifyClient,capture-commerce,
capture-commerce-core,capture-shim,rehost-theme-assets,store-health,store-health-db}.ts` (+tests),
`app/lib/plan-b/scripts.ts`, `app/lib/db/collections.ts`, `app/lib/import-engine/{wire,report}.ts`,
`app/site/[slug]/**`, `app/api/store/hosted-review/route.ts`, `app/store/dashboard/{page,
HostedStoreReview}.tsx`, `scripts/{verify-store,blackout-check,blackout-fleet,parity-check,
grade-store,census,repair-store,rehost-theme-assets}.mts`, `scripts/fleet.sh`,
`.github/workflows/fleet.yml`, `scripts/eval-import.ts`, `package.json` (scripts + `playwright`,
`server-only`), `vercel.json` (cron removed), deleted `app/api/cron/rehost-theme-assets`.
Verify before claiming green: `npx tsc --noEmit`, `npx eslint <files>`, `npm test` (2 known
`next/cache` load failures are pre-existing).

---

## 11. Memory files worth reading (in `~/.claude/projects/-Users-avishigupta-Documents-via-platform/memory/`)

`blackout-gate-is-the-acceptance-test.md`, `store-health-tiers-not-scores.md`,
`imported-sites-must-track-live-inventory.md`, `sourcedbyscottie-imported-to-prod.md`,
`market-mode-stripe-connect-rail.md`, `no-claude-in-chrome.md`, `phase-gated-delivery.md`,
`self-review-before-handoff.md`, `screenshotting-captured-store-pages.md`.

---

## 12. First 15 minutes for a new session

1. Read §0 and §9. Ask the user for round-2 go and the "Sold" decision if they haven't given them.
2. `npm test`, `npx tsc --noEmit` — confirm the baseline (747/749, 0 errors).
3. `npm run census` — read the table; it is the to-do list.
4. If round 2 is a go: `npm run dev -- -p 3348`, then `nohup scripts/fleet.sh > .verify/fleet2.log 2>&1 &`,
   tell the user roughly how long (≈10 min/store now), and **do not poll**. Stop the dev server when done.
5. While it runs (it is one process; don't add a second on the same sellers): build §6.1 with a
   failing test first.
