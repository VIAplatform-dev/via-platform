# Import Engine — Working Brief

Everything a fresh session needs to continue work on the store-import engine without
re-deriving it. Read this before touching `store-import.ts`, `site-capture.ts`,
`capture-commerce.ts`, `capture-shim.ts`, or anything under `app/lib/import-engine/`.

---

## 1. What this system is

Sellers paste their existing storefront URL. VYA copies the design, imports the catalog, and
hosts the result — then swaps the commerce layer so orders run through VYA's Stripe instead of
the seller's old platform. The goal is **1-to-1 fidelity with the source store**. That's a
product decision that has been made and reaffirmed; do not propose replacing it with a
"template with their branding" approach as the primary path.

Two independent halves, and conflating them causes most of the confusion:

| Half | What it does | Reliability |
|---|---|---|
| **Design capture** | Crawl pages, inline CSS, rewrite links, host on VYA | Fragile — every theme differs |
| **Catalog import** | Read structured product data (feeds/APIs) | Solid — platform-published data |

A third, easily missed piece: **product grids are re-rendered from live VYA inventory on every
request**, so a hosted store never shows a frozen catalog. This is a hard requirement — see §6.

---

## 2. Hard rules (from the repo owner)

- **NEVER `git commit` or `git push`** unless told to in that exact message. It never carries forward.
- **Never read `.env`/secrets or hit production** without explicit confirmation. `--env-file=.env.local`
  to give a script credentials without printing them is fine and is the established pattern.
- Many files use **1-space indentation** — match the file you're editing.
- Re-crawling a store **overwrites its stored capture**. Ask before doing it to a store that matters.
- `npx tsc --noEmit` reports stale `.next/types/*` errors — ignore those, not others.

---

## 3. Current state

Milestone 0 (capture shim, source identity, coverage rungs, eval harness) is **committed and
pushed** on `import/m0-capture-shim` — PR #5. Merging that PR is what deploys it.

Milestone 2 (import visibility) is built on the same branch: a job model, resumable steps, a
sweeper cron, structural checks at import time, and no silent error-swallowing left in the import
path. Check `git status` / the PR before assuming anything is live in production.

Known pre-existing failures, unrelated to this work — do not "fix" them by accident:
- `app/lib/comps.test.ts` and `app/lib/data-layer/unbranded-benchmark.test.ts` fail at *import*
  (`next/cache` can't resolve under plain `node --test`). They never execute.

---

## 4. The evaluation harness — use this, don't assert

```bash
npm run eval:import            # score the importer against the 16 real stores
npm run eval:import -- --live  # re-fetch instead of using .eval-cache/
npm run eval:import -- <url>   # score one store
npm test                       # unit + regression suite
```

Baseline to beat (as of this brief):

```
platform detected      16/16  100%
theme-matched grid     13/16   81%
live products rendered 16/16  100%
brand readable (3+)    16/16  100%
```

Stores currently falling back to a generic grid: `unique-vintage`, `leivintage`,
`thevintageboutiquestyle`.

**The grid score changed meaning (2026-08-24).** It used to be measured only on the homepage — but
several storefronts put *collection tiles* there and no product grid at all. Those tiles are
structurally identical to a product grid, so they were being filled with products (a real bug: a
"shop by collection" row rendered as individual items), and the harness scored that as a match.
Now: collection rows are left alone, and a store whose homepage has no product grid is scored on
`/collections/all` instead. Net score is unchanged at 13/16, but the composition is honest —
`chillboutiqueconsignment` was never broken (wrong page), and `unique-vintage` is a genuine gap that
the bug was masking (no detectable product grid on either page).

The harness exits non-zero **only** on a platform-detection regression — that's the hard
failure, because a wrong platform sends a store down the wrong extraction path. Grid fallback
warns instead.

---

## 5. The store corpus

16 real stores, platform confirmed by live detection. `scripts/eval-import.ts` holds the list.

| Platform | Count | Stores |
|---|---|---|
| Shopify | **13** | blummier (Dawn), maisonoptimismvintage (Dawn), theobjectsofaffection (Dawn), awokevintage (Dawn), chillboutiqueconsignment (Spotlight), angearchive (Dwell), vintagearchivesla (Vessel), mybagcrush (Editions), hachiarchive (Exhibit), wethieves (Prestige), feathersboutiquevintage (Prestige), unique-vintage (custom), shopvintagecharm (custom) |
| Squarespace | 2 | leivintage, montroseedit |
| Gatsby / SPA | 1 | thevintageboutiquestyle |

**81% is Shopify.** That number drives the architecture (see §8).

Useful non-corpus test targets:
- WooCommerce with a working public Store API: `barefootbuttons.com`
- BigCommerce: `vivavintageclothing.com`
- Wix (JS-rendered, uncapturable): `systemspro.wixsite.com/vibe-tribe`
- Headless Shopify (Remix): `hydrogen.shop`

---

## 6. Non-negotiable behaviours

Break any of these and the product is broken, even if tests pass:

1. **Checkout runs on VYA's Stripe**, into the seller's own Connect account. Shop Pay and
   Shopify's dynamic checkout buttons must stay stripped (`rewireCommerce`) or they take the
   order away.
2. **Every request routes through VYA.** No proxying to the seller's old platform.
3. **Product grids render live VYA inventory**, never captured markup. A listing added in the
   portal must appear on the storefront with no re-crawl.
4. **Never execute the seller's JavaScript on a VYA origin.** See §8 for the one architecture
   where keeping their JS is safe.
5. **Seller edits are never overwritten.** Items carry `origin`; `'user'` rows are immune to
   re-sync, enforced in the SQL `WHERE` clause as well as in app logic.
6. **Imports are idempotent.** Matching is on `source_id` (the platform's own handle/id), never
   title. Verified: three consecutive imports → updated, updated, **all unchanged**.

---

## 7. Empirical findings — do not re-derive these

Each of these cost real debugging time. They are counter-intuitive and will bite again.

### Selector traps
- **`[class*="localization"]` deleted entire headers.** Dawn puts `header--has-localization` on
  `<header>` as a *feature flag*. The substring matched it and cheerio removed the header, nav and
  all. Lesson: never use a bare substring selector that can match a modifier class on a landmark.
  `removeChrome()` in `site-capture.ts` now guards landmarks and containers holding real controls.
- **`mage\/` matched `image/`.** Every page with `type="image/png"` was detected as Magento.
  Platform probes need anchored signatures.
- **`.header-localization` sat on the same div as search/account/cart.** Removing the container
  took the whole icon bar. Guard: never remove a container that holds other real controls.
  Careful — Shopify's country picker contains its *own* `icon-search`, so that class alone is not
  proof the container is worth keeping.

### Rendering traps
- **Dawn ships `a:empty,div:empty,section:empty,…{display:none}`.** Product photos rendered as a
  childless `<div style="background:url(...)">` were hidden by the theme. Use a real `<img>`.
  The no-image placeholder uses `&nbsp;` (U+00A0) deliberately — CSS `:empty` treats
  whitespace-only as empty in Selectors 4, but U+00A0 is not ASCII whitespace.
- **Cloned theme cards duplicated stylesheets.** Capture inlines a stylesheet where its `<link>`
  was — sometimes *inside* a product card. Cloning that card 314× produced a 6.4 MB page. Hoist
  `<style>`/`<link>` out of the template before cloning.
- **`GRID_SELECTORS` matches padding wrappers and the pagination list.** `.first()` picked a
  wrapper with no cards. Grids are now found **structurally** (§9).

### Network traps
- **Currency must come from the same response as the prices.** Shopify Markets serves the *same*
  `products.json` URL as GBP `245.00` or USD `341.00` depending on how it reads the request, and
  the homepage can disagree with the feed. Read the `cart_currency` cookie **on the feed response**.
  Taking currency from a separately-fetched homepage mislabels prices by ~39%.
- **A `VYA-Importer/1.0` User-Agent gets 403'd** by common WordPress/Cloudflare rules — including
  on a store whose own public API serves data fine to a browser UA. A blocked response looks like
  an empty page, so a perfectly importable WooCommerce store was detected as a JS shell and
  declined. All outbound import fetches use the same browser UA as the crawler. If a site still
  refuses, decline honestly (`BlockedByStoreError`) — never try to defeat bot protection.
- **Every Shopify feed contains raw C0 control characters** in product descriptions; strict
  `JSON.parse` rejects the whole payload. Use `parseLooseJson`.
- **BigCommerce's sitemap entry point is bare `/xmlsitemap.php`** (an index). `?type=products`
  returns an empty document. BigCommerce also serves products at the site root
  (`/1950s-silk-dress/`), so requiring a `/products/` path segment finds nothing.
- **Shopify sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`.** Iframe embedding is
  impossible for 13 of the 16 stores. Don't re-propose it.

### Scale traps
- One store's capture is **51 MB / 95 pages**. At 45 stores that's ~2.3 GB in Postgres, growing
  per re-crawl. Move page bodies to Blob before this scales.
- `unique-vintage.com` has a 1.9 MB homepage and a ~1000-node mega-menu.

---

## 8. Architecture: Plan A vs Plan B

The single decision is **where a captured store is served**, which decides whether the seller's
JavaScript may run.

**Plan A (built, today).** Served at `vyaplatform.com/site/{slug}`. Their JS runs with VYA's
privileges, so it is stripped — which kills every carousel, dropdown, search box and filter.
`capture-shim.ts` rebuilds that behaviour. Works on every platform that returns HTML. Cost:
a shim per theme family, forever.

**Plan B (proposed, not built).** Served at a **separate registrable domain** (e.g.
`store.vyasites.com`) or the seller's own domain. Same-origin policy isolates their JS from VYA,
so it can be kept and everything works natively.

Why Plan B works, and why it is a *Shopify* decision: every Shopify theme publishes its own route
table into the page, and **every path is relative**:

```js
routes = { cart_add_url: '/cart/add', cart_change_url: '/cart/change',
           cart_update_url: '/cart/update', cart_url: '/cart',
           predictive_search_url: '/search/suggest' }
```

Relative paths resolve against whatever domain served the page — so on a VYA-hosted origin, the
theme's own JS sends its cart calls **to us**. Implement those five routes in Shopify's JSON shape
and the seller's real cart drawer drives VYA's database. Checkout is the same trick: their button
navigates to `/checkout`, which is VYA's Stripe flow.

The bridge is `sourceVariantId`, already stored on every imported variant — their button posts a
Shopify variant id, which maps straight to a VYA item.

**One implementation covers all 13 Shopify stores and every future one.** A bespoke React
storefront has no shared dialect, so the same work would have to be redone per store.

Plan B requirements that are **security, not polish**:
- Admin/portal/internal API routes must be refused by host on store origins.
- Absolute same-origin URLs inside inline JS must be rewritten, or they escape back to Shopify.
- A *subdomain* of vyaplatform.com is **same-site** and does not isolate (cookie tossing). Use a
  separate apex.

**Gate: ANSWERED (2026-08-24) — a hosted store's shoppers are the SELLER's customers, not VYA's.**
So per-store identity is the model, single sign-on is *not* a prerequisite, and Plan B is unblocked.
This decision also argues *for* Plan B architecturally: a separate origin per store gives per-store
cookie/session isolation for free, whereas serving every store from vyaplatform.com (Plan A) puts
all stores in one shared cookie jar — the wrong shape for "the seller's customers".

---

## 9. Design principles that were learned the hard way

1. **Detect structurally, not by class name.** Class-name grid detection worked on **6 of 20**
   stores. Every non-Dawn theme fell through. Structural detection (a container whose children
   each hold an image, a link and text; price found by *money shape*) gets 16/20. The same applies
   to sliders — the shim finds hand-rolled carousels by computed style, not by class.
2. **Reuse the theme's own markup.** Live grids clone the store's *own* product card so its
   column count, type and price format survive. Rendering our own card produced a cramped 6-up
   grid that looked nothing like the source.
3. **Only add what the theme genuinely cannot do without its JS.** The theme's stylesheets are
   inlined, so it still lays itself out. An earlier shim restyled Dawn's rows anyway and broke
   them — flattening a 4-up grid to 3-up and making a one-at-a-time announcement bar show all
   three messages. Tests now assert no blanket `.slider`/`slideshow-component` layout override.
4. **Nothing is silently dropped.** Sections the block classifier can't name are kept verbatim as
   `custom` blocks. Products the source stops listing are marked *sold*, not deleted.
5. **Never guess money.** `priceCents` + an ISO currency from the platform. The string parsers in
   `capture-commerce-core.ts` are a legacy fallback only.

---

## 10. What to build next

Ordered. Acceptance criteria are executable.

1. ~~**Ship what exists.**~~ **Done** — committed and pushed, PR #5. Merge to deploy.
2. ~~**Import visibility.**~~ **Built** (see §12). Job model, resumable steps, per-step reporting,
   sweeper cron, import-time structural checks. Acceptance is enforced by tests, including an
   executable check that no silent `.catch(() => …)` remains in the import path.
3. **Plan B for Shopify.** *Accept:* the theme's own cart drawer shows VYA items; checkout reaches
   VYA Stripe; `curl store-origin/admin/inventory` is refused; **zero** network requests to
   `*.myshopify.com` or `shop.app` during add-to-cart → checkout.
4. **Close fidelity gaps.** *Accept:* `npm run eval:import` → theme-matched ≥ 15/16, no
   "collection handles" warnings; Squarespace burger menu opens on mobile.
5. **Connected-store extras** — customers, order history, URL redirects (only reachable via a
   merchant-authorised API). Order history is what makes the analytics real.
6. **Headless rendering** — the only path to 1-to-1 for Wix/SPA. Note the one SPA store in the
   corpus has **no detectable product source either**, so rendering alone wouldn't finish the job.
   Build when a second SPA seller appears.

---

## 11. Known gaps and risks

- **Authorisation:** nothing stops someone importing a store they don't own. The acknowledgement
  step is specced but not built. Needed before self-serve.
- **Paid themes:** Dwell and Vessel (Ange Archive, Vintage Archives LA) are licensed per-merchant.
  Mirroring a public page differs from redistributing theme source — don't pull theme assets from
  the Admin API.
- **Cost attribution:** every `api_costs` row has a null `item_id`, so spend can't be traced to a
  store or feature. Worth fixing before optimising anything.
- **Shim drift:** theme updates change markup and failures are silent. Run the harness on a
  schedule, not only before releases.
- **TOCTOU DNS rebinding:** `safe-url.ts` re-resolves per redirect hop, but a hostile DNS server
  could still swap records between `lookup()` and `fetch()`. Pinning the resolved IP at the socket
  layer is the real fix.

---

## 12. The import job model (milestone 2)

An import is a **job row** (`import_jobs`, created by `CREATE TABLE IF NOT EXISTS` on first call —
no migration step). Everything about it is designed around one fact: **a big store's crawl outlives
a single serverless invocation**, so stopping half-way is normal, not exceptional.

| File | What it is |
|---|---|
| `import-engine/report.ts` | Pure: step machine, report string, stall/resume predicates. Unit tested. |
| `import-engine/run-import.ts` | The pipeline. Every dependency **injected**, so it's tested with fakes. |
| `import-engine/jobs-db.ts` | Job persistence + atomic stalled-job claiming. |
| `import-engine/checks.ts` | Structural checks **shared with `scripts/eval-import.ts`** — never duplicate them. |
| `import-engine/wire.ts` | Glues the pipeline to the real crawler/importer. Used by the route AND the cron. |
| `api/cron/import-sweeper` | Claims stalled jobs, continues paused ones. Every 5 min. |

Rules worth keeping:

- **Fatal vs. warning.** Only the crawl (and a password lock) stops an import. Products, collections,
  membership, blocks and checks degrade to *reported* warnings — a store whose design copied but
  whose collections didn't link is a partial success the seller must be told about.
- **Never swallow in the import path.** `run-import.test.ts` fails the build if a
  `.catch(() => …)` appears in the route, `capture-commerce.ts`, `wire.ts`, the pipeline or the
  sweeper. An intentional exception needs an `/* allow-swallow: reason */` marker.
- **Resume must not re-enter the crawler when the crawl already finished** — `crawlAndStore` starts
  by DELETING the store's captured pages, so that would destroy a good capture. Guarded, and tested.
- **Two things resume a job**: the seller's browser (fast, while the tab is open) and the sweeper
  cron (slow, works when it isn't). Both go through `wire.ts` so they can't drift.
- The crawl's time budget is **180s of the 300s limit**, leaving room for the steps after it.
