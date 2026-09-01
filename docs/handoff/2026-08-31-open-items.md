# Open items — end of 2026-08-31

> **SUPERSEDED — see `2026-09-01-handoff.md`.** Several items below are wrong: the bag-crush
> recommendations strip is not a bug (her own site has none either), "fourteen stores never
> repaired" was three and all three are fake, in-store pickup is built, and capture history now
> exists. Read §7 of the new document before acting on anything here.


Ordered by what a shopper loses, not by what is interesting.

## 1. The "you may also like" strip is empty on bag-crush  ← DO THIS FIRST

**Held deliberately**: this is serve-path code, and a shopper walk-through was running when it was
found. Editing the serve path mid-run invalidates the run — that has already happened twice today.

What is known:
- The strip is NOT in the served HTML. It is filled at runtime by `/api/plan-b/recommendations`.
- That endpoint answers **"Not found"** for bag-crush.
- bag-crush has **31 active pieces against 251 sold**, so the pool may be filtering to nothing —
  but "Not found" is a 404, not an empty list, so check the route's own guard first.
- The harness reports it as `recommend FAIL`: "a block exists but holds no pieces". Believe that one
  — it was verified by hand.

Start at `app/api/plan-b/recommendations/route.ts` and `app/lib/plan-b/recommendation-pool.ts`.

## 2. Fourteen stores have never been repaired

Only seven ran: bag-crush, shop-vintage-charm, chill-boutique, feathers-boutique-vintage,
we-thieves, ascensio-demo, thenicheshop. Every other store still orders its collections and rails
from the crawl-day photograph, and its collections are unstamped.

Proof it matters: hachi-archive shows `members_synced_at` on **0 of 28** collections, and its
`/collections/bags-1` is missing 4 pieces her site shows — with **zero** sold pieces in it, so
staleness is the only explanation left.

    node --env-file=.env.local --import tsx scripts/repair-store.mts <slug>

## 3. DECIDED — active pieces come before sold ones  ← DO THIS SECOND

**The seller's call, made 2026-08-31: a shopper should see what she can buy first.**

The problem it fixes: feathers' `new-arrivals` holds 250 pieces — 224 active, 26 sold. bag-crush's
`crush-collective` holds 270 — **28 active and 242 sold**. We show sold pieces marked "Sold out";
her own collection feed drops them entirely. So our first page spent its slots on stock nobody can
buy, and about 12 of her live pieces fell onto page two.

The change: order `active` ahead of `sold` everywhere a collection is listed for a shopper, keeping
the seller's own order WITHIN each group. Sold pieces are still shown — this is about what she meets
first, not about hiding the archive.

Where it lives: `listCollectionItemsForStorefront` / `listCollectionItems` in
`app/lib/db/collections.ts` (the storefront path orders by `item_collections.position ASC NULLS
LAST` today). Note the existing comment there about the archive being part of browsing — this
refines that rule rather than reversing it.

Held only because a shopper walk-through was running and this is serve-path code.

Test it with: bag-crush `/collections/crush-collective` should open with its 28 active bags, not
with sold ones.

## 4. The shopper walk needs a clean re-run

Serve-path code changed twice DURING the run (the cart-pill reachability fix), so rows walked before
those changes describe code that no longer exists. Two columns are additionally unreliable:

- `header` — the first version ignored links below 400px, and one store's header is 42px taller on
  our copy than on hers, so a link visible on both was reported missing. Fixed; not yet re-run.
- `product` — it read the FIRST `<h1>`, which on some themes is the site logo. Fixed; not yet re-run.

    node --env-file=.env.local --experimental-strip-types scripts/shopper-journey.mts

## 5. Accounts do not work on storefront-builder sites — and would leak between sellers

Imported stores are served from `app/site/[slug]/**`; builder sites from `app/s/[handle]/**`. The
account panel is only injected into the former. Three things are needed, and only the last is UI:

1. **`resolveStore` cannot see builder sites.** It derives the store from the HOST and requires
   `<slug>.<STORE_HOST_SUFFIX>`, explicitly refusing VYA's own hosts. A builder site at
   `vyaplatform.com/s/<handle>`, or on a connected custom domain rewritten to `/s/by-domain`,
   resolves to null — so signin/verify/signout/orders all answer "Unknown store".
2. **The session cookie would span sellers.** It is deliberately host-only, and that is exactly what
   makes a shopper one seller's customer. Two builder stores on ONE host share a cookie, so signing
   in at `/s/alice` would sign the shopper in at `/s/bob` and the orders endpoint would hand over
   the wrong seller's orders. Scope by path, or put the store in the cookie name, and check the
   token's store against the store in the URL (`readShopperToken` already takes the store).
3. The React panel itself.

**Do this after merging the other developer's 15 commits** — they substantially rewrite
`app/s/StoreChrome.tsx`, `StorefrontView.tsx` and `Blocks.tsx`, which is exactly where this lands.

## 6. Not started

- **In-store pickup** — `app/lib/pickup-core.ts` (logic + tests) exists; the checkout screen, the
  seller's settings and recording the method on the order do not. An agent was building this.
- **Storefront builder wired to a fresh import** — the `?edit=1` editor exists; nothing connects a
  newly imported store to it. An agent was building this.
- **Captured pages have no history.** `site_captures` is one row per page, overwritten in place. An
  edit or a re-import destroys the previous version irrecoverably.

## 7. Git

`.gitignore` now covers `.verify/` (~300MB), `.next-pop/` and scratch probes; junk paths in
`git status`: 0. Around 211 real paths remain uncommitted across six days.

The other developer is **15 commits ahead** on `main`; we are 3 ahead on `import/m0-capture-shim`.
**12 files overlap**, and four need real attention: `db/schema.ts`, `db/inventory.ts`,
`next.config.ts`, and **`vercel.json`** — both sides added crons, and a careless resolution silently
drops one side's schedules. Do NOT `git pull` onto the dirty tree: commit first, then merge.
