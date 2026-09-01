# VYA owns the cart — one cart UI for every store, past and future

**Date:** 2026-08-26
**Status:** proposed
**Replaces:** `2026-08-26-derived-cart-templates-design.md`, which solved the wrong half of the problem

## The problem, stated honestly

Adding to a bag works on every store. **Displaying the bag** is what breaks, store by store, and it
breaks because it is the one surface where we run *someone else's program*.

Every other page we serve — home, collections, product — is HTML we render and hand over. The theme's
JavaScript decorates it but does not own it. The cart is the exception: the theme's JS owns the
drawer, asks us to re-render named sections, and swaps our HTML into its own DOM. To make that work
we must speak each theme's private contract:

| | Dawn (`loved-again`) | Horizon (`lamash`) |
|---|---|---|
| Drawer root | `#CartDrawer` | `<cart-drawer-component>` → `<dialog>` |
| Section asked for | `cart-drawer` | different set |
| Rows | server-rendered `<tr class="cart-item">` | client-cloned from `<template>` |
| Empty state | `.drawer__inner-empty` | `<template id="empty-cart-template">` + a heading |
| Remove control | `<cart-remove-button>` | unlabelled icon button |

That contract is **unbounded**. Two themes disagree on all five rows; the next theme will disagree
again. Reproducing an arbitrary theme's cart is not a problem that converges.

### Why the previous spec did not fix it

Derived cart templates generalised **"what markup goes in a row"** — and it works: it found Horizon's
row without knowing one class name. But nothing in it addresses **"how does this theme's JavaScript
behave"**, which is where every remaining failure lived. The wrong axis was generalised, and the
right one was patched by hand, per store, until the patches ran out.

## The decision

**VYA owns the cart UI.** One drawer and one cart page, rendered by us, styled from each store's own
colours, type and spacing, injected identically into every store.

We already have the evidence this holds: `app/lib/fallback-cart-page.ts` renders a working cart inside
any store's chrome and has never needed a per-store fix — because it reproduces nothing.

The work changes shape from **reproduce** to **neutralise**, and that asymmetry is the whole argument:

> Removing an element and intercepting a click is generic.
> Reproducing an unknown theme's cart is not.

### What we trade

The cart stops being pixel-native per theme. It wears the store's brand — their fonts, colours,
button shape — in our layout.

That is the right trade, and it should have been argued sooner:

- Fidelity earns money on the pages that **sell**. A shopper spends seconds in a cart.
- The status quo is native-looking on Dawn and **broken on Horizon**. "Slightly less native
  everywhere" beats "perfect on one theme, broken on the next" without argument.
- Four moving parts collapse into one component.

## Architecture

```text
SERVE (every page, every store)
  captured HTML
      │
      ├─ neutraliseThemeCart()     ← generic: stub the theme's cart DOM
      │     • replace the drawer's CONTENTS, keep its element + id as an inert stub
      │     • blank the cart page's cart section, keep its container
      │     • leave every other element untouched
      │
      ├─ injectVyaCart()           ← one component, styled from the store's tokens
      │     • drawer  (hidden by default)
      │     • cart page body, when the path is /cart
      │     • one click-capture listener: cart icon → open ours
      │
      └─ served page

THEME JS still runs, and must not throw
  /cart/add.js  → Shopify-shaped line  + `sections` that are well-formed but INERT
  /cart/change.js → same
  (the theme swaps inert HTML into a stub nobody sees; our UI updates itself)
```

### Why stubs rather than deletion

Deleting the elements a theme's JS queries makes it throw, and a thrown handler can take unrelated
page behaviour down with it. Keeping the **element and its id**, with empty contents, means every
`document.getElementById(...)` still resolves and every `innerHTML = …` still lands — into something
no one sees. The theme's cart code runs to completion and changes nothing.

Likewise `sections` stays in every cart response, well-formed, so the theme's callback completes.
`buildFallbackSection` already produces exactly this shape.

### Intercepting the cart icon

One capture-phase listener, added once:

```js
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-vya-cart-open]")) return;
  e.preventDefault(); e.stopPropagation();   // capture phase: the theme never sees it
  openVyaCart();
}, true);
```

`cart-badge.ts` already identifies each theme's header cart control reliably across the corpus — that
is where `data-vya-cart-open` gets stamped. It is the one piece of per-theme knowledge we keep, and
it is knowledge we already have and already test.

## Styling: the store's brand, our layout

The cart reads CSS custom properties resolved per store:

```
--vya-cart-bg      --vya-cart-text     --vya-cart-accent
--vya-cart-font    --vya-cart-heading  --vya-cart-radius
```

Sources, in order: tokens extracted from the capture → the seller's `captured-design.ts` overrides →
VYA neutral. The extraction reuses the matching machinery from `derive-cart-template.ts`, which is the
part of that work worth keeping.

## What is deleted

| Deleted | Lines |
|---|---|
| `app/lib/plan-b/cart-drawer.ts` | ~300 |
| `injectCartPage` + `applyCartChrome` in `site-capture.ts` | ~180 |
| `app/lib/plan-b/cart-sections.ts` per-theme builders | ~120 |
| `render-cart.ts`, `derive-cart-template.ts`, `cart-template-store.ts` | ~450 |
| The two-item capture in `captureCartTemplate` | ~40 |

Roughly **1,100 lines of per-theme machinery** replaced by one cart component plus a neutraliser.

`fallback-cart-page.ts` is promoted from fallback to **the** cart. `cart-badge.ts`, `cart-session.ts`,
`cart-json.ts`, `/cart/add.js`, `/cart/change.js`, `POST /cart` and `capture-path.ts` all stay — none
of them reproduce theme markup, and none of them have needed per-store fixes.

## The process fix, which matters as much as the design

**Every bug in this work reached the user because verification was one store, by hand, in a browser.**
The Horizon divergence was discoverable on day one by any check that ran over the whole corpus.

`scripts/verify-carts.mts` — one command, all captured stores, no browser:

```
STORE                 PLATFORM     ADD   VIEW  REMOVE  EMPTY  CHECKOUT
loved-again           shopify      ✓     ✓     ✓       ✓      ✓
lamash                shopify      ✓     ✓     ✓       ✓      ✓
…
21 stores: 21 pass, 0 fail
```

Per store it: picks a real variant from the store's own page → `POST /cart/add.js` → asserts
`/cart.js` count → fetches `/cart` and asserts **our** cart markers are present, the item appears, and
**no captured product text survives** → removes → asserts the empty state → asserts `POST /cart` with
`checkout` returns `303 → /checkout?cart=1`.

The "no captured product text survives" assertion is the one that would have caught the stray Prada
row, the duplicate Remove, and the empty drawer — all of them — before any of it was shown to anyone.

**No cart change ships without this at 100%.** That is the actual deliverable of this spec.

## Risks, honestly

1. **A theme whose cart icon `cart-badge.ts` cannot find.** Then our cart never opens. Mitigated: the
   harness fails that store loudly, and `/cart` still works as a page.
2. **A theme whose JS re-renders the header on navigation**, dropping our listener. Mitigated by the
   capture-phase listener on `document`, which survives any subtree replacement.
3. **Sellers who want their native cart.** Real objection, and the honest answer is that they cannot
   have it reliably — no one can reproduce an arbitrary theme's cart. They get their brand, not their
   markup.
4. **This deletes working code.** `injectCartPage` currently serves 16 stores acceptably. Mitigated by
   the harness: the new cart must pass on all 21 *before* the old path is removed, not after.
5. **Regression risk on non-cart surfaces**, since neutralisation edits every page. Mitigated by
   keeping neutralisation to the cart DOM only, and by the harness asserting each store's home,
   collection and product pages still render unchanged.

## Sequencing

| Phase | Work | Done when |
|---|---|---|
| 0 | `scripts/verify-carts.mts` over all 21 stores, run against **today's** code | We have a baseline: exactly which stores pass what, measured rather than assumed |
| 1 | Extract per-store cart tokens; render `fallback-cart-page` with them | A store's cart page wears its own brand |
| 2 | `neutraliseThemeCart()` + inert `sections` | Theme cart JS runs and changes nothing; no console errors on any store |
| 3 | VYA drawer + cart-icon interception | Harness green on all 21 |
| 4 | Delete the per-theme machinery above | Line count drops ~1,100; harness still green |

**Phase 0 ships first and changes no behaviour.** It tells us the true state of all 21 stores, which
nobody currently knows — including me, having claimed several times this week that things worked
based on one store.

## The one-line summary

> Stop reproducing each theme's cart. Neutralise it, and serve one VYA cart wearing the store's brand
> — then prove it on all 21 stores with a single command instead of one screenshot at a time.
