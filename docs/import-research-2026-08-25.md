# Store-import research — how the industry does it (2026-08-25)

Web sweep of every product that claims to "import" / "migrate" / "clone" a website, mapped against
VYA's constraints (1-to-1 design fidelity, checkout on VYA Stripe, live VYA inventory, no seller JS
on a VYA origin). Companion to `import-engine-brief.md` §8 (Plan A vs Plan B).
Originating chat session: `0f5c7e57-97dc-41f4-ab32-c6f0ff57ab17`.

## Headline

**Nobody moves storefront design across commerce platforms from a URL alone.** Every product falls
into one of six technical buckets. The only bucket that reaches 1-to-1 fidelity is "same template
language on both ends." Every serious commerce migrator asks the merchant for a token / app install,
never just a URL.

## The six buckets

| # | Approach | Who | How | Fidelity | Maps to |
|---|---|---|---|---|---|
| 1 | Catalog-only migration | Shopify Store Migration app, MigrationPro, Cart2Cart, LitExtension, Shoplazza/Shopline one-click, Etsy Pattern, Nembol | OAuth/API token or CSV → products/customers/orders. Shopify docs: "designed pages and layouts won't transfer (or at all)" | design: none | our catalog import (already solid) |
| 2 | Theme-file transfer, same dialect | Matrixify, Duplify, Shopify "download theme zip → upload" | Copy Liquid/JSON/CSS/JS folder to a destination that runs the same Liquid runtime | 100% | **Plan C** (below) |
| 3 | Crawl-and-freeze static export | ExFlow, SitedIn, NoCodeExport, HTTrack, SingleFile | Headless render → static files. All vendors warn forms/search/cart/JS break | look only | **Plan A** |
| 4 | Archive replay w/ JS sandboxing | Wayback Machine, Webrecorder pywb + **wombat.js**, wabac.js / ReplayWeb.page | Serve capture *with* its JS; injected `wombat.js` overrides `location`, `fetch`, XHR, `document.domain`, storage, postMessage so the site's JS believes it's on its origin and all requests route to the replayer. Runs in a separate origin / sandboxed iframe | near 100% | **Plan B** — reuse wombat instead of hand-rolling JS URL rewriting |
| 5 | AI reconstruction | 10Web AI Recreate, GigaPress SiteForge, Firecrawl Open Lovable, Repaint, Claude Design / v0, Webflow Importer (dead) | Crawl → classify sections → regenerate in destination's widgets. Open Lovable self-reports 70–95%. Webflow Importer shut down: "no longer working for most sites" | approximate | rejected "template with branding" path; last resort for Wix/SPA |
| 6 | DOM-to-design capture | html.to.design, Builder.io Visual Copilot | Chrome DevTools Protocol computed-style snapshot → Figma | pixel look, zero behaviour | could harden Plan A card-template extraction |
| 7 | Live proxy overlay | Cloudflare Workers `HTMLRewriter` mirrors, Framer Advanced Hosting page-by-page | Reverse proxy + rewrite | 100% but seller platform stays in loop | ruled out by non-negotiable #2 |

## Plan C — own the theme, not the page (Shopify only; 13/16 of corpus)

Get the theme **source** and become the renderer, instead of reverse-engineering templates from
rendered HTML.

**Getting the theme (no App Store review needed):**
1. **Theme Access app** (free, Shopify-official): merchant installs, generates a password, pastes it into
   VYA. `shopify theme pull --password …` / same REST calls download the theme. Standard agency flow.
2. **Custom-distribution app** from Partner dashboard: per-store install link with `read_themes` +
   `read_products`; no review; link expires in 7 days.
3. Merchant-created custom app in their admin with `read_themes`.
Reading assets needs only `read_themes`; the 2023-04 Asset API lockdown affects *writes* by public apps.

**Rendering:** LiquidJS (TypeScript) covers core `shopify/liquid` tags/filters. Missing and must be
built: Shopify storefront objects (`product`, `collection`, `cart`, `section`, `routes`, `settings`),
`{% section %}`/`{% sections %}`, JSON templates + `settings_data.json`, filters like `img_url`,
`money`, `asset_url`. Back them with VYA `products`/variants. LiquidJS lax-filter mode passes unknown
filters through, so pages degrade instead of crashing; the eval harness measures the gap.

**Why it beats A/B on our own criteria:**
- Fidelity is native — it *is* their theme. No per-theme shim.
- Live inventory is free: `collection.products` is a SQL query. Every page type renders from data
  (product, collection, search, 404) — no crawling.
- Reuses Plan B work: `/cart/add.js` etc. routes and `sourceVariantId` are exactly what theme JS expects.
- Theme JS is inspectable `assets/*.js`, decided per asset rather than stripped wholesale.

**Costs:** seller must hand over a Theme Access password (one step, industry-normal). Building the
Shopify object/filter layer ≈ 2–3 weeks for the Dawn-family subset, long tail of filters after.
Theme JS / app embeds also call `/products/x.js`, `/search/suggest.json`, `/recommendations/products` —
more Shopify-shaped JSON reads over VYA data.

## Cheap Plan A upgrades regardless

- **Section Rendering API**: any Shopify storefront answers
  `GET /collections/all?section_id=main-collection-product-grid` with that section's HTML, and
  `?sections=a,b,c` (≤5) as JSON. No auth. Gives exact grid/card markup instead of structural guessing;
  likely recovers `unique-vintage` / `shopvintagecharm`.
- **Two-product diff templating**: fetch a card section for two products, diff, the varying spans are
  the `{{ title }}`/`{{ price }}`/`{{ image }}` slots.

## Non-Shopify

Squarespace developer mode (Git access to templates) exists only on 7.0 sites; Wix has no export.
Both stay on Plan A/B, with bucket 5 as last resort.

## Proposed next step (spike, ~2–3 days, nothing live touched)

Pull `blummier`'s theme (Dawn) via Theme Access, render `index` + `collection` + `product` through
LiquidJS with a VYA-backed object layer, score in `npm run eval:import`. Fallback if no seller
password yet: run against Dawn's public GitHub source with default settings (proves rendering, not
real-store customizations).

## Sources

- Shopify: [Liquid reference](https://shopify.dev/docs/api/liquid) · [Theme Access](https://shopify.dev/docs/storefronts/themes/tools/theme-access) · [theme pull](https://shopify.dev/docs/api/shopify-cli/theme/theme-pull) · [Asset API](https://shopify.dev/docs/api/admin-rest/latest/resources/asset) · [Asset API legacy note](https://shopify.dev/docs/apps/build/online-store/asset-legacy) · [Distribution methods](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method) · [Section Rendering API](https://shopify.dev/docs/api/ajax/section-rendering) · [JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates) · [Migrate to Shopify](https://help.shopify.com/en/manual/migrating-to-shopify)
- Liquid engines: [LiquidJS](https://github.com/harttle/liquidjs) · [liquidts](https://github.com/musicglue/liquidts)
- Migrators: [Shoplazza](https://helpcenter.shoplazza.com/hc/en-us/articles/20012846764313-Store-Migration-Migrating-your-store-from-Shopify) · [Shopline](https://help.shopline.com/hc/en-001/articles/4669702695193-Migrating-Your-Shopify-or-LightSpeed-Store-to-SHOPLINE) · [Matrixify](https://matrixify.app/tutorials/clone-shopify-theme-from-one-store-to-another/) · [Duplify](https://apps.shopify.com/duplicate-store) · [Etsy Pattern](https://www.nembol.com/ecommerce-tips/etsy-pattern-review)
- Archive replay: [wombat.js](https://github.com/webrecorder/wombat) · [pywb rewriter](https://pywb.readthedocs.io/en/latest/manual/rewriter.html) · [wabac.js](https://github.com/webrecorder/wabac.js) · [ReplayWeb.page](https://github.com/webrecorder/replayweb.page/blob/main/README.md)
- AI rebuild: [10Web](https://help.10web.io/hc/en-us/articles/4413393256210-What-is-AI-Website-Builder) · [GigaPress](https://gigapress.net/migrate-wix-to-wordpress-with-ai/) · [Open Lovable](https://www.firecrawl.dev/blog/open-lovable-tutorial) · [Webflow Importer](https://importer.webflow.io/) · [Repaint](https://repaint.com/blog/rebuild-wix-website-with-ai)
- Static export / design capture: [Wix export](https://xfermysite.com/blog/export-wix/) · [Squarespace export](https://dev.to/ybouane/how-to-export-a-squarespace-website-as-static-html-and-host-anywhere-1hae) · [Squarespace dev mode](https://bknddevelopment.com/marketing/squarespace-developer-mode-complete-guide/) · [html.to.design](https://html.to.design/docs/what-is-html-to-design) · [Builder.io](https://www.builder.io/blog/website-to-figma)
- Proxy: [Shoptet Cloudflare rewrite](https://github.com/shoptet/cloudflare-html-rewrite-example) · [Framer page-by-page](https://www.framer.com/help/articles/how-to-migrate-a-site-to-framer-page-by-page/)
