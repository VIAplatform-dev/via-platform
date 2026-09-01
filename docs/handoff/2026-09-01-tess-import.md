# Handoff — Tess Elizabeth Vintage, 1 September 2026

**Her store is live now:** https://tesselizabethvintage.vyasites.com

It did not need a deploy. The captures, inventory and collections were written straight to the
production database, and Plan B is already on `main`, so production served her the moment the
import finished.

**What still needs a deploy is the code.** Production is currently rendering her with three bugs
that are fixed locally but uncommitted. See §3.

---

## 1. What came over

| | |
|---|---|
| Source | https://tesselizabethvintage.com (Shopify, not password-protected) |
| Pages | 39 crawled, 69 captured · 0 missing against her sitemap |
| Products | **142 of 142** · 0 missing, 0 extra, 0 availability mismatches |
| Collections | **23 of 23** exact · 535 items filed across 21 |
| Photos | 841 copied to our Blob · 0 failed |
| Prices | 15/15 on the page match what the cart will charge |

**Blackout gate passes** on home, a collection and a product page — with Shopify blocked entirely,
all three render unchanged. Screenshots inspected, not just the metrics.

**Shopper flow, in a real browser:** cart 7/7 (home · product · add · drawer · cart · remove ·
checkout) and accounts 8/8 (bag · icon · panel · sign-in · session · orders · sign-out · isolation).

---

## 2. Pre-staging, and how it avoids being overwritten

Hana asked that Tess's site be planted ahead of time so that pressing "import my store" picks it up
instead of running a cold crawl. That works, and it cannot destroy her site.

`POST /api/store/capture` now reads the store's captured page count *before* anything destructive.
Above zero, and the caller is not the owner, it returns the site already there — shaped exactly like
a finished import ("Your site is live on VYA, 69 pages"). It never reaches `createJob`, which is
what deletes captures and re-crawls. Same answer whether she types her own URL, a different one, or
double-clicks. There is no "you already did this" message; from where she stands nothing happened
except that her site is on VYA.

The decision is one pure function, `app/lib/import-engine/reuse-capture.ts`, with 5 unit tests.

> **The one way to lose her site.** The owner is deliberately exempt, because re-importing is the
> repair path. So `getvya.ai/admin/import` **will** re-crawl and discard edits. Its warning banner
> is the only thing between a click and losing her. Don't run it on her without meaning to.

Not verified end to end: the seller-session path itself, which needs a real seller login for her
store. The decision function is unit-tested; the route path is shared with the admin flow.

---

## 3. Not deployed — three bugs production is still serving

All fixed locally, all uncommitted. Every one affects **every hosted store**, not only Tess.

**Photos deleted from badged pieces.** We strip the template's badge with `[class*='badge']`. That
is a substring match, and her theme labels the card's *image gallery*
`card-gallery--badge-top-right`. So we deleted the wrapper holding every photo — but only on pieces
her theme badges (Sold out, Sale), which is why it read as a pricing bug. 15 of 37 pieces on
Accessories were a title and a price over blank space. Live prod still shows 3 such cards on
`/collections/bottoms`.

**Sale prices invisible.** The live price was written correctly into the theme's `price__regular`
block — which her theme marks `price__hidden` when a piece is marked down. The right number, in the
DOM, off screen. The shopper saw only the struck-through was-price and no price to pay. This is also
why every price check reported 15/15 matching: a text comparison finds it.

**Sign-in links pointed nowhere.** `signin/route.ts` built the emailed link from
`new URL(request.url).origin`, which resolves to `http://localhost:3000` even when the Host header
is the store (measured). Every sign-in email from every hosted store carried a link to a host with
no store on it — clicking it answered `{"error":"Unknown store."}`. The verify redirects had it too,
so even a successful sign-in bounced the shopper off the store origin, where the session cookie does
not apply. The link now comes from the store's canonical address, and never from the Host header in
production — a header is attacker-controlled, and a magic-link built from one is how those emails get
pointed at someone else's server with a live token attached.

Also in the same change: new imports are addressed at `{slug}.vyasites.com` rather than
`vyaplatform.com/site/{slug}`, via one helper that is the exact inverse of the routing the proxy
already uses, so the address a seller is shown is the address that serves her store.

---

## 4. Harness fixes (`scripts/verify-carts.mts`)

The cart check reported Tess as "timed out — the page never settled". Her cart was fine the whole
time. It clicked `.first()` on the Add selector, which resolves to the theme's **sticky
add-to-cart bar** — permanently outside the viewport — so Playwright scrolled, found it still off
screen, and retried to timeout. Six products × (8s click + 10s cart wait) blew the 90s budget.

The same `.first()` also broke the re-add before the checkout step, so checkout was tested on an
empty bag and reported "no checkout control".

And `visibleCartText()` did not know about `[data-vya-fallback-cart]` — VYA's own cart page — so on
awoke-vintage it read the drawer's empty containers and called a cart page plainly showing
"Awoke Tote · Remove · $18.00" empty.

All three fixed by clicking every visible copy until one accepts, and by teaching the region list
about our own cart page. Re-checked: tesselizabethvintage 7/7, blummier 7/7, awoke-vintage 7/7.

---

## 5. Open

1. **Commit and push.** Nothing here is committed. Until then production serves the bugs in §3.
2. **PR #7 is still not deployed** — the srcset, section-404, `<sale-price>` and data-island fixes
   from 1 Sep. Independent of this work, still outstanding.
3. **bag-crush** threw a 15s page-load timeout in the cart check. Assumed dev-server slowness;
   **not verified**.
4. **Her theme's module graph is incompletely re-hosted.** Console shows 404s for
   `theme/tesselizabethvintage/account/*.js` and `Unexpected token 'export'`. These are dynamic
   `import()` specifiers *inside* rehosted JS, which asset collection never sees because it only
   reads URLs written into the HTML. Her account dialog is the visible casualty. Does not affect
   cart, checkout or sign-in — all verified working.
5. **`app/lib/site-capture.ts` has uncommitted changes from another agent** alongside mine. Low
   conflict risk, but check before committing.
6. Builder (from-scratch) storefronts still advertise `{handle}.getvya.ai` in two places and
   `{handle}.vyaplatform.com` in a third. Untouched — that is the bigger shared-host change in the
   29 Aug handoff §8.

---

## 6. For Hana

- Her store: **https://tesselizabethvintage.vyasites.com**
- Local: add `127.0.0.1 tesselizabethvintage.vyasites.test` to `/etc/hosts`, then
  `http://tesselizabethvintage.vyasites.test:3000/`
- Removing "Bring your site over" from the seller's view is yours — I left it alone.
- Tess has no store record in `stores.ts` and no `store_users` row. The import did not need one, but
  her portal login will.
- When she does open the Hosted Store tab she meets a **side-by-side review** first: 3–5 pages of
  her site next to ours, with Looks right / Something's off / Skip. Edit buttons stay hidden until
  she is through it. That is deliberate, not a bug.
