# Import Engine — Session Handoff (2026-08-25)

Everything a fresh session needs to pick this up. Read this **and** `docs/import-engine-brief.md`
before touching `site-capture.ts`, `capture-commerce.ts`, `app/lib/import-engine/`, or
`app/lib/plan-b/`. The brief explains *what the system is*; this explains *where it stands now*.

---

## 1. Read this first — hard rules

- **NEVER `git commit` or `git push`** unless told to in that exact message. It never carries forward.
- **Never read `.env`/secrets or hit production** without explicit confirmation.
  `node --env-file=.env.local <script>` to give a script credentials without printing them is the
  established pattern and is fine.
- Many files use **1-space indentation** — match the file you're editing.
- `npx tsc --noEmit` reports stale `.next/types/*` errors — ignore those, not others.
- Blessed test stores (safe to write/overwrite): **`test-import`** and **`test-import-2`**.
  Nothing else. Re-crawling any other store needs the owner's OK.

---

## 2. Where the work lives

Branch **`import/m0-capture-shim`**. One commit is pushed (`3e4c020`, Milestone 0/1) and open as
**PR #5**. Everything since is **uncommitted**: ~32 changed/new files, roughly 2,350 insertions.

| State | What |
|---|---|
| Pushed (PR #5) | Milestone 0: capture shim, source identity, coverage rungs, eval harness |
| **Uncommitted** | Milestone 2 (import visibility), Plan B, ~20 fidelity fixes |

**Not mine — do not assume these are part of this work:** `app/lib/comps.ts` (modified),
`app/lib/lens-products.ts`, `app/lib/lens-products.test.ts`, `app/lib/link-price.ts`. They appeared
mid-session from parallel work. `CLAUDE.md` was auto-modified by `next dev` (it re-adds its block).

---

## 3. Verify (run these first)

```bash
npm test                  # 379 tests, 377 pass
npx tsc --noEmit          # clean (ignore .next/types)
npx eslint <changed>      # clean
npm run eval:import       # PASS — 16/16 platform, 13/16 theme grid
```

**Known pre-existing failures — do NOT "fix" them:** `app/lib/comps.test.ts` and
`app/lib/data-layer/unbranded-benchmark.test.ts` fail at *import* (`next/cache` won't resolve under
plain `node --test`). They never execute.

**Harness baseline changed meaning on 2026-08-24** — see §4 of the brief. Net is still 13/16 but the
composition is honest now: `chillboutiqueconsignment` passes (it was scored on a homepage with no
product grid), and `unique-vintage` fails (a genuine gap the old bug was masking).

---

## 4. Milestone 2 — import visibility (built, uncommitted)

An import is a **job row** (`import_jobs`, self-creating via `CREATE TABLE IF NOT EXISTS` — no
migration step). Everything is designed around one fact: **a big store's crawl outlives a single
serverless invocation**, so stopping half-way is normal.

| File | What it is |
|---|---|
| `import-engine/report.ts` | Pure: step machine, report string, stall/resume predicates. Unit tested. |
| `import-engine/run-import.ts` | The pipeline. Every dependency **injected**, so it's tested with fakes. |
| `import-engine/jobs-db.ts` | Job persistence + atomic stalled-job claiming (`FOR UPDATE SKIP LOCKED`). |
| `import-engine/checks.ts` | Structural checks **shared with `scripts/eval-import.ts`** — never duplicate. |
| `import-engine/wire.ts` | Glues pipeline → real crawler/importer. Used by the route AND the cron. |
| `api/cron/import-sweeper/` | Claims stalled jobs, continues paused ones. Every 5 min. |

Rules worth keeping:

- **Fatal vs warning.** Only the crawl (and a password lock) stop an import. Products, collections,
  membership, blocks and checks degrade to *reported* warnings.
- **Never swallow in the import path.** `run-import.test.ts` **fails the build** if a
  `.catch(() => …)` appears in the route, `capture-commerce.ts`, `wire.ts`, the pipeline or the
  sweeper. An intentional exception needs an `/* allow-swallow: reason */` marker.
- **Resume must not re-enter the crawler when the crawl already finished** — `crawlAndStore` starts
  by DELETING captured pages, so that would destroy a good capture. Guarded and tested.
- **Two things resume a job**: the browser (fast, tab open) and the sweeper cron (slow, tab closed).
  Both go through `wire.ts` so they can't drift.
- Crawl budget is **180s of the 300s limit**, leaving room for the steps after it.

Proven on a real site: a crawl killed at 88 pages resumed from 88 (not 1) and finished at 100.

---

## 5. Plan B — stores on their own domain (built, uncommitted)

Serving a captured store from a **separate registrable domain** means the same-origin policy isolates
the seller's JavaScript from VYA, so their theme's own code runs. That is the only reason the
carousels, filters, quick-shop and cart drawer work natively.

**Gate ANSWERED (2026-08-24): a hosted store's shoppers are the SELLER's customers.** Per-store
identity; single sign-on is NOT a prerequisite.

| File | What |
|---|---|
| `plan-b/store-host.ts` | Host → store slug, the refusal denylist, Shopify theme-route map |
| `plan-b/cart-json.ts` | VYA inventory in Shopify's cart JSON shape |
| `plan-b/scripts.ts` | Which scripts survive capture; inline-URL rewriting |
| `plan-b/lookup.ts` | variant id → VYA item (the bridge) |
| `api/plan-b/cart/{add,change,update}`, `api/plan-b/cart`, `api/plan-b/search/suggest` | The five theme routes |
| `middleware.ts` (~line 200) | Store-host routing, security refusal, `/collections/x/products/y` |

**Config:** `STORE_HOST_SUFFIX`. Unset ⇒ Plan B is entirely inert. Local: `vyasites.test` plus
`/etc/hosts` entries. See `docs/plan-b-local-testing.md`.

**Security, not polish:**
- Admin/portal/internal routes are refused **by host** on store origins, and `/api/*` **fails closed**
  (allowlist, so a route invented tomorrow is refused by default).
- A capture may CONTAIN the seller's scripts; **the serve path decides**. `stripScripts()` runs on
  every VYA-origin response — otherwise a Plan B capture becomes stored XSS at
  `vyaplatform.com/site/{slug}`.
- Must be a **separate apex**, never a subdomain of vyaplatform.com (same-site ⇒ no isolation).

Verified end to end on a real store: add to cart → `/cart.js` → `/cart` page → checkout reaches VYA,
with **zero** requests to `*.myshopify.com` or `shop.app`.

---

## 6. Traps learned this session — do not re-derive

Every one of these passed unit tests and the harness while being visibly broken in a browser.

**Markup surgery**
1. **`.first()` on a substring selector.** `[class*='badge']` matches the positioning wrapper
   (`card__badge`) *and* the styled pill inside it. Writing text into the outer one deletes the pill.
   **Always target the innermost match.** Same family as the `[class*="localization"]` header bug.
2. **Never remove a container that holds other content.** One theme wraps its **entire footer** in
   `<form class="shopify-localization-form">`. `removeChrome` now guards on link count / text length.
3. **…and don't gut it either.** The first version of that guard removed `[class*="disclosure-list"]`
   inside — which is how that theme builds its footer link lists. It deleted 180 links while
   carefully preserving the wrapper. Only form **controls** may go.
4. **Don't reorder a theme's children.** Prepending a sold badge *before* the `<img>` made Editions'
   image library drop the photo. Append after it; position with CSS.
5. **Strip the theme's image hooks from images you own.** We set a final `src` and remove `srcset`;
   leaving `data-rimg` lets the theme recompute one, and its CSS hides what it thinks is unloaded
   (`[data-rimg=lazy]{opacity:0}`).
6. **A theme repeats the product name.** A visible heading *plus* a hidden screen-reader copy. Read
   the template's title **before** substituting, then replace anything still equal to it.

**Content reconstruction**
7. **Read the page size from the theme, never hardcode.** Both collection pagination and homepage
   strips use the count of cards the theme itself rendered. A "featured" rail given all 251 items
   blew the page to 1.2 MB and left a carousel unable to render — the page looked empty below the hero.
8. **Only paginate if the source paginates.** Otherwise a 3-card grid starts splitting into pages of 3.
9. **A collection list is not a product grid.** Structurally identical; the difference is that its
   links point at `/collections/`, never `/products/`. Require **zero** product links before skipping —
   a looser rule cost two stores their theme-matched grid.
10. **Import collection ORDER, not just membership.** The captured collection page already shows the
    seller's order in its product links. Without it their archive came back sorted by import date.
11. **A curated collection's order wins.** Do NOT hoist available items first there (that default
    belongs on the uncurated shop-all page).
12. **Storefronts show sold pieces, badged.** A vintage archive is part of browsing; hiding sold items
    turned a 52-product store into a 15-product one, and a 37-piece archive collection into 1 card.
13. **Query strings must survive link rewriting.** Dropping them collapsed `?page=2..5` onto one path —
    silently breaking pagination, sorting and variant links on **every** store ever captured.
14. **Shopify serves products at `/collections/{x}/products/{y}` too.** Themes use it for quick-shop
    fetches; leaving it unrouted made Quick Shop 404 and show nothing.
15. **Capture the cart page WITH an item in it.** Captured empty it renders no line-item markup, and a
    hand-built substitute never matches (wrong fonts, wrong columns, a bright blue button).
16. **A portal-created listing has no source page.** Render it into a captured product page from the
    same store — and pick a template that actually contains the markup you're substituting (a *sold*
    product's page has no price block at all).

**Portal**
17. **`?store=` must ride on every API call.** Admin pages that omit it read and write *your own*
    store while displaying another. Fixed on 3 pages (29 call sites); **~14 more still have it** (§8).

---

## 7. How to test locally

```bash
# once
sudo sh -c 'cat >> /etc/hosts' <<'EOF'
127.0.0.1  test-import.vyasites.test
127.0.0.1  test-import-2.vyasites.test
127.0.0.1  vyaplatform.test
EOF
# .env.local
STORE_HOST_SUFFIX=vyasites.test
```

`npm run dev:os` serves on **3333** (the OS host). A store hostname is resolved *before* the
port-3333 heuristic, so both work together.

- Store 1 (Objects of Affection, Dawn): `http://test-import.vyasites.test:3333/`
- Store 2 (Bag Crush, Editions): `http://test-import-2.vyasites.test:3333/`
- Same capture on a VYA origin (must have **no** seller scripts): `http://localhost:3333/site/test-import`
- Portal for a store: `http://localhost:3333/admin/inventory?store=test-import-2` ← the `?store=` matters

Re-import a blessed store (admin auth read from the env file, never printed):

```js
// node --env-file=.env.local thisfile.mjs
const auth={Authorization:`Bearer ${process.env.ADMIN_PASSWORD}`,"Content-Type":"application/json"};
let body={url:"https://mybagcrush.com",replaceBlocks:true};
for(let i=0;i<20;i++){
  const r=await fetch("http://localhost:3333/api/store/capture?store=test-import-2",
    {method:"POST",headers:auth,body:JSON.stringify(body)});
  const d=await r.json();
  if(!r.ok){console.log(r.status,d);break}
  if(d.status!=="paused"){console.log(d.report,d.warnings);break}
  body={resume:true};
}
```

**Compare against the real site mechanically** — that is how nearly every bug this session was found.
Fetch both, strip `script/style/noscript`, and diff visible text per `[id^='shopify-section']`.
Beware: probe selectors are theme-specific (`.card__heading` is Dawn; Editions uses
`.product-item__title`). Several "failures" this session were the probe, not the code.

---

## 8. Open — pick up here

1. **UNRESOLVED: sold-item images on Bag Crush.** The owner reports blank tiles for sold pieces.
   Server-side is verified correct: valid blob `src` (HTTP 200, `image/jpeg`, ~300KB), badge after the
   image, theme image hooks stripped, `data-rimg` gone. **Not reproduced from the server** — needs a
   DevTools check: does the `<img>` exist, what is its computed `opacity`/`display`/`height`, and does
   the image request 200? Possibly browser cache (hard-reload) or a runtime script.
2. **`?store=` on ~14 more portal pages** — `app/store/storefront/page.tsx` (30 calls),
   `app/store/settings/page.tsx` (12), `storefront/studio` (11), `admin/bulk-upload` (11),
   `store/inbox` (9), … A data-integrity risk: bulk-upload would import into the wrong store, settings
   would overwrite your own config. ~150 call sites. Copy the `withStore` helper already in
   `admin/inventory/page.tsx`.
3. **`unique-vintage`** — no detectable product grid on homepage *or* `/collections/all` (1.9 MB pages).
   Genuine milestone-4 fidelity gap.
4. **Add both test stores to the eval corpus** so this session's regressions become mechanical.
5. **Facet counts are frozen** ("In stock (15 products)") — the source's own filters aren't wired to
   live inventory.
6. **Milestone 5+**: connected-store extras (customers, order history, redirects), headless rendering.
7. **Cart-page `/checkout` flow** works, but the checkout page itself is VYA's existing Stripe flow —
   not re-verified end to end with a real payment this session.

---

## 9. Things that will bite you

- **The dev server must be restarted** after editing `app/lib/*` used by middleware; several
  "it didn't work" moments were stale module state.
- **The import writes to the production Neon DB** via `.env.local`. Only `test-import` /
  `test-import-2` are blessed.
- **Importing runs a real crawl against a real merchant's site.** Polite (4 concurrent, capped) but
  real. It also now **adds one item to the source store's cart** to capture the cart template — a
  session-scoped side effect, no order created. Flag it if that's not wanted.
- The rehost-images cron (running in prod against the same DB) rewrites imported image URLs to Vercel
  Blob. That is expected, and those URLs do serve valid JPEGs.
