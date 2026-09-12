# Imported-site builder — Steps 2 to 5

Design, 2026-09-11. No code yet. Phased: the owner tests each step in the running app before the next starts.

The goal: a seller who imported her site edits it the way she would in Shopify or Squarespace. She adds product grids that look like her own, manages pages and the menu, edits the header and footer once for every page, and sets text size for the whole site. Everything she adds takes her site's own fonts, colours and product cards.

## Decisions carried in

| Decision | Source |
|---|---|
| Keep the imported sections exactly as captured. No conversion to Studio blocks. | owner, after the spike |
| New things take the site's own type, colours and cards | owner |
| Copy the Shopify/Squarespace patterns: click to select, section toolbar, add between sections, shared header/footer, colour set per section, global type scale, pages panel = menu order, grid presets, undo that survives save, desktop/mobile preview | research |
| Bounded settings: type scales not px, curated fonts, colour by role, preset grids | research |
| Product grids render from LIVE inventory, on every storefront kind | owner rules (memory) |
| **New tables are created by a one-time admin endpoint the owner triggers, never on first request.** The dev server points at the production database. Wherever a section below says "created on first use", build `POST /api/admin/site-builder/migrate` (admin-auth, idempotent `CREATE TABLE IF NOT EXISTS`) and have feature code fail soft until it has run. | owner, 2026-09-11 |
| **Squarespace is tested on an imported test copy**, a new writable store slug, not on `lei-vintage` / `montrose-edit` (real sellers). The owner triggers the import. | owner, 2026-09-11 |
| **Step 2 does not start until the owner has reviewed this spec and answered the open questions below.** | owner, 2026-09-11 |

## What exists today (read before building)

- **Storage.** `site_captures (store_slug, path, html)` holds one row per page, overwritten in place ([site-capture-db.ts](../../../app/lib/site-capture-db.ts)). Reserved rows that are data, not pages: `/__vya/*` (never served, see [cart-template-store.ts](../../../app/lib/plan-b/cart-template-store.ts)) and `__vya_custom_css__` (the design layer).
- **History.** `site_capture_versions` ([capture-versions-db.ts](../../../app/lib/capture-versions-db.ts)) stores gzipped versions and keeps **3 per page** plus the newest crawl ([capture-versions-core.ts](../../../app/lib/capture-versions-core.ts)). Seller undo takes back one `edit` version and consumes it. Current prod counts: 2,034 rewrite, 256 crawl, 82 edit.
- **Serve.** [app/site/[slug]/[[...path]]/route.ts](../../../app/site/[slug]/[[...path]]/route.ts) does the following, in order:
  1. `stampEditIds` (editor only)
  2. live grids (home + `/collections/{h}` only)
  3. collection tiles
  4. edit-mode branch (`prepareEditMode`)
  5. cart page
  6. chrome cleanup
  7. section fragment
  8. `injectCart`/`injectCss`/SEO

  Product pages go through their own route, `app/site/[slug]/products/[handle]/route.ts`. The cart page borrows the home page's chrome (`buildFallbackCartPage`). Search is built from a collection template.
- **Editor.** [app/store/storefront/page.tsx](../../../app/store/storefront/page.tsx) is the parent panel. `EDITOR_JS` in [site-capture.ts](../../../app/lib/site-capture.ts) runs inside the iframe, and the two talk over `postMessage`:
  - iframe → parent: `section`, `textsel`, `imgsel`, `inline`, `unsaved`, `saved`, `status`, `deselect`, `secrect`
  - parent → iframe: `addblock`, `set`, `secstyle`, `txtstyle`, `dupsec`, `delsec`, `undo`, `redo`, `css`, `save`, `scrollto`, `deltile`, …
- **Undo in the editor.** The in-iframe undo is an in-memory snapshot stack (`uS`/`rS`). A structural save calls `location.reload()`, so **the undo stack dies on every structural save**.
- **Sections model.** `eachSection` picks sections in this order: `.shopify-section` first, then top-level `<section>`, then `main > div` children, plus `[data-vya-block]`. They are numbered in document order.
- **Save payload.** A save sends `sections: (index | {new, html} | {sec, html})[]`. `applySectionEdits` removes every section and rebuilds the run, so **an omitted index means deleted**. Text, image and link edits carry `was` (`locateEdit`).
- **Header/footer.** Every page keeps its own copy. `extractChromeEdits` + `applyChromeEditsToPage` copy an edit to every other page by matching the old value, inside `header, footer, nav`. Product pages copy body edits the same way.
- **New blocks.** `NEW_BLOCK_TYPES` has 15 types. The templates are written **twice**: server `newBlockHtml` and client `newBlockEl`. Both hard-code px font sizes, `#1a1a1a` buttons, and forms with `onsubmit="return false"`.
- **Pages.** `/api/store/capture` returns `pages`, `unlinked` (via `partitionByReachability` over `/` and `/collections`), `productTemplate`. `store_page_order` ([page-order-db.ts](../../../app/lib/page-order-db.ts)) only orders thumbnails in the editor, and has one row in prod (via-admin, 80 paths).
- **Live-grid machinery.** Private: `productGrids`, `fillGrid`, `renderThemeCard`. Exported: `injectLiveGrids`, `fillCapturedGrid`, `liveGridHtml`, `detectGridHandles`, `capturedGridProductHandlesPerGrid`. Plus [collection-tiles.ts](../../../app/lib/plan-b/collection-tiles.ts), and [recommendation-template.ts](../../../app/lib/plan-b/recommendation-template.ts), which already clones a theme grid out of a fragment and stores it as a reserved row.
- **Design layer.** [captured-design.ts](../../../app/lib/captured-design.ts) stores a JSON header inside `__vya_custom_css__` (accent, bg, text, heading/body font, radius). `injectCss` appends it on every hosted page. [font-detect.ts](../../../app/lib/plan-b/font-detect.ts) offers the site's own fonts.

## Findings from the read-only probe of prod data (2026-09-11)

| # | Finding | Consequence |
|---|---|---|
| F1 | 30 captured stores. 26 Shopify, 2 Squarespace (`lei-vintage` 52 pages, `montrose-edit` 201), 2 other. Largest store: `2nd-street-shop`, 942 pages, 867 MB. | Nothing may loop over every page on a request. No fleet-wide rewrites. |
| F2 | Header markup differs on almost every page, but only in per-page state. Examples: `menu-list__link--active` / `aria-current` on the current link, `return_to=%2Fcollections%2F…` in login links, Squarespace `header-nav-item--active`. Footers are identical, or differ only by block order. | One canonical header per store is feasible if we re-apply per-page state at serve time. |
| F3 | Shopify menus exist **twice** in the header (desktop list + drawer). Squarespace also has two (desktop + mobile overlay). | Menu edits must hit every copy. By-old-value matching already does, by accident. A menu model must do it on purpose. |
| F4 | `eachSection` on Squarespace finds `section.region` (the whole homepage body, 6 `.page-section`s) plus the footer's `section.page-section`. On Shopify it includes the `header-group`/`footer-group` sections. | Squarespace pages cannot reorder or insert between real sections today. On both platforms the header and footer can be deleted as if they were body sections. |
| F5 | The serve route makes grids live only for `/` and `/collections/{h}`. Squarespace collections live at `/shop` and `/shop/{cat}` (products at `/shop/p/{slug}`). | **Squarespace collection pages are served with capture-day products** (found by reading the code, not tested live). That breaks the live-inventory rule. It is fixed in Step 2. |
| F6 | Type-size hooks by theme family:<br>• `--font-body-scale`/`--font-heading-scale` (Dawn family): **10 stores**<br>• `--font-size--h1…h6`/`--font-size--paragraph` (Horizon family): **7**<br>• `--font-size-heading-N`: 2<br>• `--font-size-ratio-*`: 2<br>• root var (`--base-text-font-size`, `--FONT-SIZE-BASE`): 2<br>• Squarespace `--base-font-size` + `--heading-N-size`: 2<br>• no hooks (feathers, shop-vintage-charm, vintage-boutique-style, 2nd-street-usa, sourcedbyscottie): 5 | A text scale needs a small adapter per family, detected from the captured CSS. |
| F7 | Native colour sets exist. Shopify has `color-scheme-N` classes (20 stores). Squarespace has `data-section-theme="white|light|dark|black|bright…"`. | A "Colour set" per section can swap the theme's own scheme instead of inlining colours. |
| F8 | `gianna-marie-raucher /collections/accessories` has card-shaped `li.product-grid__item` elements with an image, link and price. The spike still saw the plain fallback there. | Deciding a card is usable must be done **by rendering a sample card and checking it**, not by detection alone. |
| F9 | The added "Newsletter" and "Contact" blocks post nowhere (`onsubmit="return false"`), and "Testimonials" ships made-up customer names. `/api/contact` is store-scoped: it opens a thread in the seller's inbox and respects her messaging setting. `/api/newsletter` is **not**: it writes to VYA's own `waitlist` table with no store and answers "Welcome to VYA!". The classic storefront's `NewsletterForm` posts there too. | Hosted: dead forms and fake reviews, fixed in Step 5. Classic: a shopper signing up to a seller's list lands on VYA's waitlist instead. Flagged here; open question 13. |

## Foundations (ship inside Step 2; everything later depends on them)

1. **Numbering v2 + version guard.** `eachSection` changes in two ways:
   - It never returns anything inside the header/footer regions (Shopify `.shopify-section-group-header-group|footer-group`, `#shopify-section-header|footer`, top-level `header`/`footer`; Squarespace `header#header`, `#footer-sections`).
   - On Squarespace it uses `.page-section` inside `#sections`/`.region`.

   Only the stored page is ever numbered, so no saved data carries old numbers. The risk is an editor tab that is already open. `prepareEditMode` writes `__VYA_EDIT.numbering = 2`, the save sends it, and `/api/store/capture/edit` answers a mismatch with **409 "Your editor is out of date — reload"** and writes nothing.
2. **Hide, don't delete, captured sections.** The X on a captured section sends `{sec, hidden: true}`. The server sets `data-vya-hidden="1"`, and `injectCss` always adds `[data-vya-hidden]{display:none!important}`. In the editor, hidden sections show greyed out with a **Show** button. "Delete permanently" is a second, confirmed action. When a section really is removed, `applySectionEdits` first moves its `<style>`/`<link>` into `<head>`, the same way `fillGrid` treats leftover cards. That fixes the "kept section went blank" spike finding. VYA-added blocks still delete outright.
3. **Undo that survives save.**
   - `versionsToDrop` keeps the newest 3 versions of any kind, plus the newest crawl, plus the **newest 10 `edit` versions**. Estimate: gz ≈ 80 KB/page, so 10 × edited pages is a few MB per store.
   - The top-bar Undo uses the iframe stack first. When that stack is empty (after a reload), it calls `POST /api/store/capture/undo` for the current page.
   - Reserved builder rows (`/__vya/chrome/*`, `/__vya/grid-kit`) keep 20.
4. **One cheerio pass for builder transforms.** A new `app/lib/site-builder/apply.ts` runs `applySiteBuilder($, ctx)` once per request on the parsed page: grids (Step 2), menu + page meta (Step 3), shared chrome (Step 4). The route already parses 1 MB pages many times, so no transform adds its own parse.
5. **Where code goes.** New logic lives in `app/lib/site-builder/*` (pure, testable) with thin hooks in `site-capture.ts`. First commit of Step 2, after the bug-fix agents land: **move `EDITOR_JS` into `app/lib/site-builder/editor-js.ts` unchanged.** Every later step adds to it, and it currently sits in the most contended file in the repo.

---

## Step 2 — "Add product grid" in the site's own card

**What she gets.** A **Product grid** entry in Layout, and a **+** between any two sections. The grid shows a chosen collection's live pieces in her theme's card. It has settings for: collection, how many (1–20, the Studio's `MAX_FEATURED`), desktop columns 1–6, mobile columns 1–2, image shape (Theme / Portrait / Square / Landscape), and card style (Theme card / Simple).

### Data
- **Grid kit.** Reserved row `/__vya/grid-kit`, JSON, lives and dies with the capture, never served:
  ```
  { v:1, sourcePath, platform:"shopify"|"squarespace",
    cardHtml,          // one card, style/link/script removed (fillGrid's clone source)
    gridEl:{tag,attrs},// the grid container, children removed
    shell:[{tag,attrs}],// wrappers from the section root down to the grid's parent — keeps .page-width/.content-wrapper
    css,               // <style> text on the source page that the home page lacks, capped 300 KB
    price:{decimals,showCode}, labels:{add,sold} }
  ```
  `deriveGridKit(pages)` tries pages in order:
  - Shopify: `/collections/all`, then other `/collections/*`
  - Squarespace: `/shop`, then `/shop/{cat}`
  - then `/`

  On each page it takes the largest `productGrids` grid and its template card. It then **renders one real item through `renderThemeCard` and rejects the kit** if the template's title or price text survives (F8) or the grid styles each slot individually (Squarespace Fluid Engine, `slotsAreIndividuallyStyled`). No page gives a kit → `null` → the grid uses the Simple card (`liveGridHtml`), which still inherits fonts.

  The kit is derived the first time a grid is previewed and saved on the first grid save (a seller action, not a backfill). "Refresh card look" in the panel re-derives it.
- **The block lives in her page HTML as a marker only**, never with cards:
  `<div data-vya-block="1" data-vya-newtype="products" data-vya-grid-id="g_x7k2" data-vya-grid='{"v":1,"collection":"dresses","count":8,"cols":4,"mcols":2,"ratio":"theme","card":"theme"}'></div>`
  `parseGridConfig` validates against bounds (enums, integer clamps; the collection must be one of hers, or `all`). An invalid value falls back to the default, never to an error on the shopper's page.
- `site-capture.ts` exports one hook, `renderKitGrid($, kit, items, hrefFor, opts)`, which wraps the private `fillGrid`/`renderThemeCard`. No other private function is exposed.

### API
- `POST /api/store/capture/grid-preview {path, config}` → `{html, kit: "theme"|"simple", empty}`. It renders exactly what a shopper would get, from live inventory. Auth: `resolveStoreSlugAny`.
- `POST /api/store/capture/grid-kit {refresh:true}` → re-derives and saves the kit.
- `/api/store/capture/edit` accepts `{new:"products", grid:{…}}` in `sections`. `newBlockHtml` ignores any `html` for this type and emits the marker from the validated config. `sanitizeCapturedSection` strips `data-vya-grid*` from captured sections, so a marker cannot be smuggled in.

### Editor
- Parent: a Layout card **Product grid** at the top of the Shop category. Selecting a grid block opens a **Grid** panel instead of text fields:
  - collection picker (her collections, plus All pieces)
  - count stepper
  - Desktop columns (1–6) and Mobile columns (1–2) as segmented controls
  - Image shape
  - Card style
  - "Refresh card look" link
  - live note: "Shows sold pieces the way this collection is set to" (follows `collection-sold-policy`)
- `EDITOR_JS`:
  - **+ between sections**: on hover, a small + sits on the boundary between two sections and opens the add popover at that position. It replaces "drops at the bottom / near the middle".
  - `addblock type:"products"` inserts the marker with defaults (first collection linked in her menu, else `all`; 8; 4; 2), then fetches `grid-preview` into it.
  - Selecting it posts `{vya:"section", grid:config}`. The parent sends `{vya:"gridset", config}`. The iframe updates the attribute, re-fetches the preview and sets `struct=1`.
  - `cleanHtml` empties grid blocks back to the marker before save.
  - Cards inside get `data-vya-item`, so clicking a name or price opens the existing "This piece" panel.

### Serve (shoppers)
- `applySiteBuilder` → `injectGridBlocks`. It runs only when `html.includes("data-vya-grid")`, **on every page type**:
  - catch-all route: home, pages, collections, search template
  - the product route
  - the cart fallback, which borrows home chrome

  It runs after `stampEditIds` and before the edit-mode branch, so the editor and shoppers see the same cards.
- Items are fetched once per distinct collection: `all` → `listStorefrontItems`; otherwise `getCollectionWithSyncState` + `listCollectionItemsForStorefront`. Then cap at `count`, and use `hrefFor` / `keepQuickAdd: onStoreOrigin` exactly as the existing grids do.
- Layout: the shell and grid from the kit. Kit CSS is injected once per page, and only when the page lacks it (`data-vya-kit-css`). Scoped rules:
  `[data-vya-grid-id=g] <grid>{display:grid!important;grid-template-columns:repeat(cols,minmax(0,1fr))!important}`, children `{width:auto!important;max-width:none!important;flex:none!important}`, the same under `@media (max-width:749px)` with `mcols`. A non-Theme ratio sets `aspect-ratio`/`object-fit` on the card image and zeroes the theme's padding-ratio wrapper (`--ratio-percent`).
- Empty collection: shoppers get nothing (the block collapses). The editor shows "No pieces in this collection yet".
- **Squarespace collection pages go live (F5).** `/shop` → `all`, `/shop/{cat}` (not `/shop/p/`) → handle `cat`, through the existing `injectCollectionItems` branch. This is a separate commit inside Step 2, so it can be tested on its own.

### Shopify vs Squarespace
| | Shopify | Squarespace |
|---|---|---|
| Kit source | `/collections/all` → `/collections/*` | `/shop` → `/shop/{cat}` |
| Shell root | `.shopify-section` (keeps `.page-width`, colour scheme class) | `section.page-section` (keeps `.content-wrapper`, `data-section-theme`) |
| Card | `renderThemeCard` clone | `.product-list-item` clone. Fluid-Engine slots fall back to Simple. |
| Product links | `/products/{handle}` | same `hrefFor`; the product route already resolves `/shop/p/` via the product index |
| Section unit for + | `.shopify-section` outside header/footer groups | `.page-section` (numbering v2) |

### Migration
None. No backfill. The kit is derived when first used.

### Risks
- **Kit CSS pulled from a collection page conflicts with homepage CSS.** Mitigation: inject only the missing blocks, cap the size, and offer the Simple card.
- **Theme JS on Plan B re-initialises cloned cards.** `renderThemeCard` already rewrites identity ids per clone. Covered by the existing Horizon test.
- **Column override fights a carousel-type grid.** The kit rejects sources whose grid is a slider (`slideshow`, `swiper`, `flickity`, `[class*=carousel]`).
- **Page weight.** Count is capped at 20. Kit CSS is capped.

### Tests (`node --test`)
- `grid-config.test.ts`: clamps, enums, unknown collection → `all`.
- `grid-kit.test.ts`, with fixtures cut from Dawn, Horizon (`product-card`), Palo Alto, Squarespace `.product-list-item`, and a no-card page:
  - kit or null
  - F8 rejection when template text survives
  - slider rejection
- `inject-grid-blocks.test.ts`:
  - count cap
  - sold badge
  - empty collapse
  - scoped CSS names only its own grid
  - kit CSS injected once for two grids
  - marker-only after `cleanHtml`
- `applySectionEdits`:
  - hide sets `data-vya-hidden`
  - real delete moves styles into `<head>`
  - numbering v2 skips header/footer groups
  - Squarespace `.page-section` numbering
  - version mismatch → 409
- `versionsToDrop`: 10 edits kept beyond 3; newest crawl still kept.
- Squarespace `/shop/{cat}` handle mapping; `/shop/p/x` excluded.

### Owner test steps
Stores: `test-import` (Dawn), `test-import-2`, `sourcedbyscottie` (Palo Alto). Squarespace: see open question 3.
1. Store OS (localhost:3333) → Storefront → Home. Hover between the hero and the next section: a **+** appears. Click it → Product grid.
2. A grid of real pieces appears in the site's own card. Hover a card image: the second photo still swaps if the theme does that.
3. In the Grid panel set collection = a small collection, count 6, desktop 3, mobile 2. The canvas updates after each change.
4. Switch the preview to phone: 2 columns. Switch Card style to Simple and back.
5. Save. After the reload, press Undo in the top bar: the grid is gone (server undo). Press Undo again: the previous save is undone too.
6. View live. Same grid. In Inventory, mark one of the shown pieces sold → reload the live page → it shows as sold (or drops off, per that collection's setting).
7. Select any original section → X. It greys out in the editor and disappears on the live site. The sections around it still look right. Click **Show** and it comes back.
8. Try to select the header as a section: it is no longer offered as a movable or deletable section.
9. (Squarespace, once a writable store exists.) Open `/shop` live → sold pieces and new pieces match Inventory.

---

## Step 3 — Pages panel

**What she gets.** A **Pages** rail tab with the list shaped like Shopify's navigation + pages screens:
- **In your menu**, in menu order, draggable
- **Other pages**
- **Collections**
- **Not linked** (existing reachability)
- Product page template

Per row: open, rename, add to or remove from the menu, **hide (X) / show**. Plus **Add page**.

### Data (sparse: no row means "as captured")
```
site_pages (store_slug, path, title TEXT NULL, nav_label TEXT NULL,
            hidden BOOL NOT NULL DEFAULT false, kind TEXT NOT NULL DEFAULT 'captured',  -- 'captured'|'added'
            chrome TEXT NULL,          -- Step 4: 'shared'|'own'
            updated_at, PRIMARY KEY (store_slug, path))
site_menus (store_slug, menu TEXT,     -- 'main'|'footer'
            items JSONB NOT NULL,      -- [{id,label,href,hidden?,children?:[…]}], depth ≤ 2, ≤ 30 items
            signature TEXT NOT NULL,   -- normalized href sequence of the menu it was learned from
            updated_at, PRIMARY KEY (store_slug, menu))
```
Self-healing DDL like the rest of the schema. **Note: the first request creates these tables in the prod DB** (dev DB = prod).

A menu row is written the first time she changes the menu. Until then it is detected at read time: `detectMenus(headerHtml)` finds the link lists in the header region, groups copies by normalized href sequence (F3), and reads top-level items as the direct children.

### API
- `GET /api/store/capture/pages` → merged list (captured paths + `site_pages` overrides + detected or stored menu + `unlinked`). Read-only: it never writes.
- `PATCH /api/store/capture/pages {path, title?, navLabel?, hidden?}`.
  - Refuses to hide `/`, `/cart`, `/search`.
  - Returns `linkedFrom` (how many links on her home/collections pages still point at the page), so the UI can warn.
- `PUT /api/store/capture/menu {menu:"main", items, signature}`.
  - Validates hrefs: no `javascript:`/`data:`.
  - Returns 409 if the signature no longer matches the live header (the site changed under her).
- `POST /api/store/capture/pages {title}` → creates an added page and returns its path. Slug: `pageSlugify`. Shopify: `/pages/{slug}`. Squarespace: `/{slug}`. Suffix `-2` on a collision with any captured path.
- `DELETE /api/store/capture/pages?path=` → added pages only. Keeps a version first.

### Add a page
`buildBlankPage(templateHtml, {title})`, a pure function:
- Template: the shortest `/pages/*` (Shopify) or shortest non-shop page (Squarespace), else `/`.
- Remove every body section (numbering v2 list) and insert a starter Text block.
- Set `<title>`/`og:title`; drop canonical, `og:url` and the old page's JSON-LD.

The chrome-borrowing logic in [fallback-cart-page.ts](../../../app/lib/fallback-cart-page.ts) is moved into a shared `borrowChrome()` so the cart page and new pages share it. The new page is written with `saveCapturePage(slug, path, html, "")` plus a `site_pages` row `kind='added'`. `source_url=''` keeps it out of origin detection. By default it is added to the end of the main menu, with a checkbox to opt out.

### Editor
- Pages tab replaces the thumbnail strip's ordering. `store_page_order` stays readable but is no longer written.
- Drag within "In your menu" → `PUT menu`.
- Hidden rows are greyed and marked "Hidden — shoppers get Page not found".
- Rename opens a small dialog: page title + menu label, and says the URL stays the same.
- `EDITOR_JS`: on a hidden page, a thin bar reads "This page is hidden from shoppers · Show". Nothing else changes.

### Serve (shoppers)
- Early in the catch-all route: one `site_pages` read for `(slug, pathname)`. If hidden and not an editor request → **404, before any rendering**. That includes the Section Rendering API (`?section_id=`) and search templates.
- `applySiteBuilder` → `applyMenu($, menu, {path})`:
  - reorders the existing item elements in **every** copy of the menu
  - drops items for hidden pages or hidden items
  - adds an item by cloning a sibling without a dropdown (href + label), with active markers cleared
  - skips the page entirely when its detected signature differs from the stored one (a landing page with its own header)
- Page `title` override is applied to `<title>`/`og:title`.
- Applied in: the catch-all route, the product route, the cart fallback (after `borrowChrome`), and search.

### Shopify vs Squarespace
| | Shopify | Squarespace |
|---|---|---|
| Menu lists | `header-inline-menu`/`.menu-list__list`, drawer `ul.menu-drawer__menu` | `.header-nav-list`, `.header-menu-nav-list` |
| Active marker | `--active` classes / `aria-current` | `header-nav-item--active` / `aria-current` |
| New page path | `/pages/{slug}` | `/{slug}` |
| Dropdowns | `details`/`summary` items move as a whole | folder items move as a whole |

### Migration
- None required. Rows are sparse.
- `store_page_order` (1 row) is left alone.
- Re-import: `deleteCaptures` must **keep `kind='added'` pages** (see open question 10). Until that is decided, the owner-only force re-import warns that added pages go with it.
- `storefront-versions-db` snapshots include added pages automatically (they are capture rows). `applyMenu` ignores menu items whose page no longer exists.

### Risks
- **Hiding a page that the footer, a banner or a collection tile links to.** Mitigation: the `linkedFrom` warning. Shoppers get a clean 404, not a broken layout.
- **Theme JS indexes menu items** (mega-menus). Mitigation: reorder and remove whole item elements only; never rewrite item internals.
- **Signature drift after a re-crawl** → menu edits stop applying. Mitigation: the panel shows "Your menu changed since you last edited it — review", with a one-click re-learn.

### Tests
- `detectMenus`: fixtures from Horizon (gianna), Dawn, Palo Alto, Squarespace. Two copies grouped as one menu; footer lists separated.
- `applyMenu`: reorder in both copies; hide; add a clone with active markers cleared; skip on signature mismatch.
- `buildBlankPage`: header, footer and head CSS kept; body sections gone; title set; canonical removed.
- Hidden-page gate: plain request → 404; editor request → page; section fragment request on a hidden path → 404.
- `deleteCaptures` keeps added pages (if decided).

### Owner test steps
1. Storefront → Pages. The menu order matches the live header.
2. Drag "About" above "Shop" → View live: desktop menu **and** the phone menu (open the hamburger) both show About first.
3. X on a collection page → View live: it is gone from the menu, and visiting its URL shows "Page not found". Back in the editor it opens, with the hidden bar. Show → back in the menu.
4. Rename "Our Story" to "About us" → menu label and browser tab title change. The URL does not.
5. Add page "Shipping" → it opens with her header and footer and a starter text block. Edit the text, save, View live via the menu.
6. Try to hide Home → refused, with a reason.
7. Open a product page live: the menu shows the same order and hidden items (product route parity). Open the cart page: the same.

---

## Step 4 — Header & footer: edit once, for all pages

**What she gets.** A **Header & footer** rail tab.
- Header: announcement bar (show/hide, text, link), logo (upload, width slider 60–300 px), menu editor (Step 3 items plus one level of children, destination picker page / collection / URL), icons (search, account show/hide; cart always shown), colour set.
- Footer: its menus, social icons show/hide, newsletter show/hide, copyright text, colour set.
- Clicking the header or footer on the canvas edits them in place.
- Every change applies to every page that uses the shared header.
- **History** list with restore.

### Data
Reserved rows, which live and die with the capture:
- `/__vya/chrome/header`, `/__vya/chrome/footer`: `{v:1, html, sourcePath, markers:{active:[classes]}, signature, shared:true, adoptedAt}`
- History comes from `keepVersion` (reason `edit`, keep 20 — see Foundations).
- `site_pages.chrome = 'own'` marks a page that keeps its own copy.

**Region extraction** `extractChromeRegions($)`:
- Shopify: header/footer section groups; else `#shopify-section-header|footer` / `[id$="__header"]`; else a top-level `header`/`footer` outside `main`.
- Squarespace: `header#header`, `footer#footer-sections`.
- None found → the tab says "Header editing isn't available for this site yet" and nothing changes.

**Normalization** for grouping: strip `aria-current`, active classes (`*--active`, `is-active`, `current`, `header-nav-item--active`, `menu-list__link--active`), `return_to=` values, `data-vya-*`, whitespace.

### Adoption (replaces copying edits to every page by old value)
Opening the tab for the first time runs `GET /api/store/capture/chrome/survey`:
- normalized signatures across non-product pages
- sample: every menu-linked page + 40 more, capped for 900-page stores

It reports "Your header is the same on 38 of 40 pages. Home uses a different one." **Use one header everywhere** → `POST /api/store/capture/chrome/adopt {sourcePath}`. This writes the two chrome rows (from the largest group, or the page she is on) and `chrome='own'` for pages outside that group, which she can switch.

This is a seller action: no backfill, no page rewrites. The per-page copies in `site_captures` are **never modified**, so **Stop sharing** is a clean rollback, with a warning that edits made while sharing live only in the shared copy.

After adoption:
- `/api/store/capture/edit` stops running `extractChromeEdits` propagation for that store. Chrome elements in the editor carry no page ids, so no chrome edit can come in through a page save.
- Product-template body propagation is untouched (open question 6).

### API
- `GET /api/store/capture/chrome` → `{header, footer, elements, menus, history}`.
- `POST /api/store/capture/chrome/edit {region, edits, images, links, styles, ops, numbering}`.
  - Text/image/link edits run `applyEditsWithReport` over the region HTML (with `was`).
  - `ops` is a closed set: `toggle {target, on}`, `logo {src?, width?}`, `announcement {text?, href?}`, `scheme {value}`, `copyright {text}`.
  - One write, one version.
- `POST /api/store/capture/chrome/restore {versionId}`, `POST /api/store/capture/chrome/unshare`.
- `PUT /api/store/capture/menu` (from Step 3) accepts `menu:"footer"` and children.

### Editor
- The parent tab is laid out like Shopify's header section settings: element list with toggles, logo block, menu editor, colour set chips.
- `EDITOR_JS`:
  - After `applySharedChrome`, header and footer elements get region ids `data-vya-rid` (a separate namespace from page `data-vya-eid`).
  - Clicking one posts `{vya:"region", region, fields}`.
  - Saving sends region edits to `chrome/edit` and page edits to `edit`, as two requests.
  - A header badge on hover reads "Shared across 38 pages".

### Serve (shoppers)
`applySiteBuilder` → `applySharedChrome($, chrome, {path, pageChrome})`, skipped when the page's `chrome='own'`:
- replace the page's regions with the canonical HTML
- re-apply per-page state (F2): `aria-current="page"` and the recorded active classes on links whose normalized href equals the current path; `return_to` rewritten to the current path
- then `applyMenu` (Step 3) runs on the single copy

Toggles render as `data-vya-hidden` (theme JS still finds the element). Logo width is a scoped CSS rule plus the `img` width attribute. Colour set swaps `color-scheme-N` on the region's section, or `data-section-theme` on Squarespace. Fallback: role colours via CSS variables.

Applied in the catch-all route, the product route, the cart fallback (on the borrowed page) and search. The Section Rendering API fragments are cut **after** this pass, so a re-rendered header section is the shared one.

### Shopify vs Squarespace
| | Shopify | Squarespace |
|---|---|---|
| Regions | section groups (all 20+ modern themes); legacy ids for Palo Alto-era themes | `header#header`, `footer#footer-sections` |
| Announcement | `[id*="announcement"]` section | `.sqs-announcement-bar-dropzone` |
| Logo | `.header__heading-logo`, `a[href="/"] img` in header | `.header-title-logo img` |
| Colour set | `color-scheme-N` | `data-section-theme` |
| Links | root-relative (Plan B) | baked `/site/{slug}/…` (Plan A capture). Normalizer compares both forms. |

### Migration
- None forced. Stores stay on per-page copies until the seller adopts.
- Optional owner-triggered `POST /api/admin/site-builder/adopt-chrome?slug=` for fleet adoption later. It never runs automatically.
- Pages that already received a bad propagated edit (the 19-page incident): adopt from the page that is right, and the rest follow at serve time without being rewritten.

### Risks
- **Home uses a transparent/overlay header variant** → a shared copy would flatten it. Mitigation: the survey marks it `own` by default.
- **Theme JS depends on per-page header data** (e.g. localization form `return_to`). Mitigation: F2 per-page rewrites, plus Plan B verify on 3 themes before shipping.
- **Two tabs editing**: one on a page save, one on a chrome save. They are different rows, so no clobbering. Chrome saves use `was`.
- **Serve cost**: two small reserved rows. Read them in one `path IN (…)` query, cached per request.

### Tests
- `extractChromeRegions`: fixtures for Horizon, Dawn, Palo Alto (legacy ids), Squarespace.
- Normalizer: gianna's `/` and `/collections/accessories` headers (F2 diff) produce one signature; lei `/` vs `/shop` produce one.
- `applySharedChrome`: active marker on the right link in both menu copies; `return_to` rewritten; `own` page untouched.
- Chrome edit: text edit with `was`; toggle round-trip; logo width; scheme swap limited to schemes present.
- Edit route: adopted store → no propagation writes (spy on `updateCapturePageHtml`).
- Restore/unshare.

### Owner test steps
1. Storefront → Header & footer → survey message → **Use one header everywhere**.
2. Click the announcement text on the canvas and change it. Save. View live on Home, a collection, a product page and the cart: all show the new text. Open the phone menu: the same.
3. Toggle Search off → gone everywhere. Toggle on.
4. Upload a new logo, width 140 → every page.
5. Menu: add a dropdown child "Bags" under Shop → desktop dropdown and phone drawer both show it.
6. Break something on purpose (clear the copyright). History → restore the previous version → fixed on every page.
7. Stop sharing → pages show their original headers again (with a warning first).
8. On the live collection page the current menu item is still underlined/highlighted (per-page state kept).

---

## Step 5 — Site-wide text size + a small section library styled from the site

**What she gets.**
- In Design: **Heading size** (80–130 %, steps of 5) and **Body text size** (85–120 %), in the same panel as the existing fonts (her site's fonts listed first).
- In Section style: **Colour set** chips from her theme's own schemes, with Custom as the fallback.
- Layout's library cut to sections that look native: Text, Image with text, Image banner, Button, FAQ, Newsletter, Contact form, Product grid, Divider.

### Data
`DesignSettings` in [captured-design.ts](../../../app/lib/captured-design.ts) gains `headingScale`, `bodyScale`, and `type: {recipe, originals}`. The `kit` is optional and lives in the same `vya-design:` JSON header. No new table.

`detectTypeRecipe(css)`, a pure function, runs server-side when design settings are saved, from the home page's captured CSS, and stores the originals:

| Recipe | Stores (F6) | Output |
|---|---|---|
| `dawn` | 10 | `:root{--font-body-scale:calc(orig*b);--font-heading-scale:calc(orig*h)}` |
| `horizon` | 7 | redefine `--font-size--paragraph` ×b, `--font-size--h1…h6` ×h (originals may be `clamp()`; wrapped in `calc()`) |
| `heading-n` | 2 | `--font-size-heading-N` ×h, body var ×b |
| `ratio` / `root-var` | 4 | base var ×b, heading ratio vars ×h |
| `squarespace` | 2 | `--base-font-size` ×b, `--heading-1…4-size` ×h |
| `fallback` | 5 | `html{font-size}` ×b only when the theme is rem-based. Heading ×h via measured rules for `main h1–h4` (sizes read in the editor at 1280 px). The UI says "Heading size only" when body can't scale. |

Because recipes multiply the theme's own variables, responsive `clamp()` sizes stay responsive, and header/footer menus follow the body scale the way they do on Shopify.

### Section library styled from the site
- **No inline px type or colours in new blocks.** Blocks use the theme's own elements and classes, so the theme's CSS and the type scale apply:
  - Shopify: wrapper `.shopify-section`-shaped `div` > `.page-width` (kit `shell` idea, from the home page) with the current `color-scheme-N`, `h2`/`p` bare, buttons get the class list of the first primary button found in `main`.
  - Squarespace: `section.page-section[data-section-theme]` > `.content-wrapper` > `.content`, buttons `sqs-button-element--primary`.
  - Fallback: CSS variables `--vya-page-width`, `--vya-btn-*` from a harvested style kit.
- **One template source.** `newBlockHtml(type, kit)` on the server is the only definition. `prepareEditMode` embeds the rendered templates as `__VYA_EDIT.blocks`, and `EDITOR_JS` `newBlockEl` clones from it (the duplicated client templates are deleted).
- **Forms work (F9).**
  - The form carries `data-vya-form="contact"|"subscribe"` and no handler of its own: the sanitizers strip `on*` attributes, and Plan A strips scripts. VYA's script that is already injected on every hosted page (`injectCart`, which binds Add buttons the same way) submits it as JSON and shows the thank-you. That works on Plan A and Plan B alike.
  - Contact posts `{storeSlug, name, email, message}` to `/api/contact`, so the message lands in her inbox. Check that `proxy.ts` lets `/api/contact` through on a store origin (the cart's `/api/storefront/*` calls already get through).
  - Newsletter needs a store-scoped signup that doesn't exist yet: `POST /api/storefront/subscribe {storeSlug, email}`. It is rate-limited like `/api/newsletter`, adds the shopper to `store_customers` with `email_subscribed = true`, and mirrors to her email provider the way `importCustomers` does. The classic `NewsletterForm` switches to it in the same commit (parity). **Newsletter is not offered until open question 13 is answered.**
- **Removed from the menu:** Testimonials (made-up names), Blog (links to nowhere), and Hero/Statement/Columns/Split/Announcement folded into the list above. Blocks already saved on stores keep rendering: their HTML is stored.
- **Colour set** is a new bounded edit channel, `secAttrs: {sec, scheme}`. It swaps a `color-scheme-N` class (only schemes present on the page) or a `data-section-theme` value (allowlist), and never inlines colours.

### API
- `/api/store/capture/css` keeps its contract. The Design panel keeps posting the rebuilt CSS; `buildDesignCss` emits the scale block.
- `/api/store/capture/edit` accepts `secAttrs`.
- `GET /api/store/capture/type-recipe` → `{recipe, canScaleBody, canScaleHeadings}` for the panel.

### Editor
- Design tab: two sliders, with a live preview through the existing `{vya:"css"}` channel. Reset to 100 %.
- Section style: Colour set chips first, Background/Text colour under "Custom".
- `EDITOR_JS`: on load, it measures computed h1–h4 sizes for the `fallback` recipe and posts `{vya:"typeprobe"}`. The parent saves it only when she moves a slider, never on load.

### Serve (shoppers)
- `injectCss` already runs on the catch-all route, product route, cart fallback and search, so the scale reaches every hosted page with no new code path.
- New blocks are plain stored HTML.

### Migration
None. Missing scales mean 100 %. The recipe is detected lazily when she first saves Design.

### Risks
- **A theme sizes some text in px outside the variables**: the scale looks partial. Mitigation: bounded range; the survey lists "text that won't scale" in the admin (not the seller UI).
- **Theme primary-button detection picks the wrong button.** Mitigation: prefer `main` buttons with a background, and expose "Button style: Theme / Outline" as the only choice.
- **Recipe detection on a re-crawl changes the originals.** Mitigation: re-detect on save; values are ratios, not px.

### Tests
- `detectTypeRecipe`: one fixture per family from F6, with originals parsed (including `clamp()`).
- `buildDesignCss`: scales emitted per recipe; 100 % emits nothing; values clamped to bounds.
- `newBlockHtml(kit)`: no `font-size:` / hex colours in the output; Shopify and Squarespace wrappers; forms carry `data-vya-form` and no inline handler.
- Form payload builder: sends the page's store slug to `/api/contact` or `/api/storefront/subscribe`; rejects any other target.
- Colour set: only schemes present are accepted; the Squarespace allowlist.
- Old saved blocks still render (fixture).

### Owner test steps
1. Storefront → Design → Heading size 120 %. Headings grow on the canvas as she drags. Check the phone preview: still wraps sensibly.
2. Body size 90 %. Save → View live: Home, a collection, a product page and the cart all use the new sizes.
3. Try a store without size hooks (e.g. `sourcedbyscottie`): the panel says what can scale.
4. Layout → + between sections → Image with text. Fonts, button look and page width match her site. Change Heading size again: the new section follows.
5. Add Contact form → View live → send a message → it arrives in her Messages inbox. (Newsletter, once open question 13 is answered: submit an email live → it appears in her Customers list as subscribed, and not in VYA's waitlist.)
6. Select an original section → Colour set → pick the dark scheme → it looks like her theme's own dark sections.
7. Confirm Testimonials and Blog are no longer offered. An old page that has them still shows them.

---

## Shopper-facing parity (owner rule)

| Feature | Classic storefront | Studio/blocks | Hosted catch-all route | Hosted product route | Hosted cart page | Search | Checkout / buyer emails |
|---|---|---|---|---|---|---|---|
| Added product grid | n/a (Featured block exists) | Featured block: collection + count ≤ 20, **no mobile-column setting** | Step 2 | Step 2 | Step 2 (borrowed chrome only) | Step 2 | n/a |
| Squarespace live collections | n/a | n/a | Step 2 (F5) | already live | n/a | n/a | n/a |
| Hidden page / menu order | `extraPages` (no hide) | `extraPages` (no hide) | Step 3 | Step 3 | Step 3 | Step 3 | n/a |
| Shared header/footer | VYA nav | VYA nav | Step 4 | Step 4 | Step 4 | Step 4 | storeName only; logo sync is open question 9 |
| Text scale | none | per-block `headingSize` only | Step 5 | Step 5 | Step 5 | Step 5 | n/a |
| Working newsletter/contact | contact OK; newsletter goes to VYA's waitlist (F9) | same as classic | Step 5 | n/a | n/a | n/a | n/a |

Gaps outside this spec, flagged: Studio has no mobile-column setting and no global type scale; classic/Studio pages cannot be hidden; the classic newsletter form signs shoppers up to VYA's waitlist instead of the seller's list (F9).

## Coordination with in-flight work
Other agents are changing `site-capture.ts` (price-0 handling, heading decoys, `restoreParkedHrefs`, `stampEditIds`), the edit route (`was`/`skipped`), the catch-all route (early `stampEditIds`, facet labels), `page.tsx` (phone layout) and the css route. Step 2 starts only after those land.

Its first commit moves `EDITOR_JS` out of `site-capture.ts` with no behaviour change. New logic goes in `app/lib/site-builder/*`. Hooks into shared files stay a few lines each.

## Out of scope
- Converting captured sections into Studio blocks.
- Changing page URLs (redirects).
- Grid settings on grids that came with the capture (open question 5).
- Per-element px font sizes.
- A shared product-page template (open question 6).
- A seller-facing version browser beyond undo and chrome history.

## Open questions for the owner
1. ~~**Hidden page, shopper view.**~~ **Answered 2026-09-11:** plain "Page not found"; its menu links disappear.
2. ~~**Rename.**~~ **Answered 2026-09-11:** title and menu label only. The URL never changes, so no redirects table.
3. ~~**Squarespace test store.**~~ **Answered 2026-09-11:** import a Squarespace test copy under a new writable slug; the owner triggers it.
4. **Squarespace collection pages** appear to show capture-day products today (F5). Fix inside Step 2 as proposed, or ship it first as its own fix?
5. **Grids that came with her site.** Should Step 2 also give them count/columns settings, or only new grids?
6. **Product-page edits** still copy to every product page by old value, the same failure mode as the 19-page header incident. Move that to a shared product template in Step 4, or leave it?
7. **Library cuts.** OK to stop offering Testimonials (made-up names) and Blog (dead links)? Existing ones keep rendering.
8. **Stores whose themes have no size hooks** (5 stores): accept "Heading size only" there?
9. **Logo.** When she changes the header logo, should it also become her store logo on checkout, buyer emails and the marketplace?
10. ~~**Re-import.**~~ **Answered 2026-09-11:** a re-import KEEPS seller-added pages (and, from Step 4, her shared header/footer). `deleteCaptures` must spare `kind='added'` rows.
11. **Bounds.** Grid count ≤ 20 (the Studio's cap), mobile columns 1–2, heading 80–130 %, body 85–120 %: OK?
12. **Shared header rollout.** Seller clicks "Use one header everywhere" per store (proposed), or the owner adopts fleet-wide through the admin endpoint?
13. **Newsletter signups.** The classic storefront's form sends shoppers to VYA's own waitlist, not the seller's list. OK to add a store-scoped signup that saves them as her subscribed customers, and switch the classic form to it at the same time? The hosted Newsletter section waits on this.
