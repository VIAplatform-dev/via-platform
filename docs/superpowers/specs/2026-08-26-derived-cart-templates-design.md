# Derived cart templates — rendering any theme's cart without knowing the theme

**Date:** 2026-08-26
**Status:** proposed
**Replaces:** the per-theme selector lists in `app/lib/plan-b/cart-drawer.ts` and `injectCartPage`

## The constraint everything else follows from

Shopify renders a theme's sections from **Liquid**, on their servers, from files we do not have.
When a theme's JavaScript adds an item to the cart it does not only POST — it also asks the server
to re-render named sections and swaps the returned HTML into the page:

```js
document.querySelector('#CartDrawer').innerHTML =
  new DOMParser().parseFromString(response.sections['cart-drawer'], 'text/html')
    .querySelector('#CartDrawer').innerHTML
```

We have no Liquid renderer, so we must produce that HTML ourselves. **That is the whole problem.**
Every cart bug we have — the empty drawer, the wrong row, the stale total — is a consequence of
having to reproduce markup we cannot render.

## Why the current approach cannot work

Both existing renderers hardcode the class names of one theme family:

- `injectCartPage` looks for `.cart-item`, `#main-cart-items`, `.totals__subtotal-value`
- `buildCartDrawerSection` looks for `#CartDrawer`, `#CartDrawer-CartItems`, `.drawer__inner-empty`

Those are **Dawn's** names. Measured against the real corpus:

| Store | Theme generation | Row class | Drawer root |
|---|---|---|---|
| `loved-again` | Dawn | `cart-item` | `#CartDrawer` |
| `lamash` | Horizon | `cart-items__table-row` | `<cart-drawer-component>` |

`lamash` has no `<form>` in its drawer at all, and its *table header* row is
`cart-items__table-row` — which matches the selector `tr[class*='cart-item']`, so the current code
clones the header ("Product image", "Product information") as if it were a product row.

Adding a Horizon branch fixes two stores and fails on the third theme. Shopify themes are arbitrary
markup, customisable per store; there is no finite list to enumerate. **Selector lists are the wrong
shape of solution.**

## The idea: let each store show us its own markup

We already put a real product into a cart on the source store at import time
(`captureCartTemplate`) and capture what the theme renders. That capture contains the answer — we
have simply been guessing at it with class names instead of reading it.

**Capture with two KNOWN products instead of one, and every slot identifies itself:**

- the **subtree that repeats twice** is the line-item template
- its **parent** is the items container
- the element whose text equals **known title A** is the title slot
- the `img` whose `src` matches **known image A** is the image slot
- the element whose text equals **known price A** is the unit price slot
- the element whose text equals **A + B** is the subtotal slot
- the element present when the cart is empty and absent when it is full is the **empty state**
- an element whose text equals **"2"** is a count badge

None of that names a class. It works on Dawn, on Horizon, and on a theme neither of us has seen,
because the store is showing us its own markup and we are reading it.

## Architecture

```text
IMPORT TIME (once per store)
  captureCartTemplate
    ├─ add known product A to the source cart      → capture /cart  (1 item)
    ├─ add known product B                          → capture /cart  (2 items)
    └─ capture /cart with an empty cart             → capture /cart  (0 items)
                  │
                  ▼
          deriveCartTemplate()          ← pure; three HTML strings in, a map out
                  │
                  ▼
          store CartTemplate as JSON alongside the capture
                  │
SERVE TIME (every request)             ▼
  renderCart(template, lines)  ← ONE generic renderer, no theme knowledge
    ├─ /cart page          (replaces injectCartPage's selector logic)
    ├─ cart-drawer section (replaces buildCartDrawerSection's selector logic)
    └─ any future section
```

### The derived template

```ts
/** Where a value goes inside the row, as a PATH from the row root — never a class name. */
type Slot = { path: number[]; kind: "text" | "attr"; attr?: string };

export type CartTemplate = {
  version: 1;
  rowHtml: string;          // the theme's own line-item markup, one copy
  itemsPath: number[];      // child-index path from the drawer/page root to the rows' container
  slots: {
    title?: Slot;
    price?: Slot;
    image?: Slot;           // kind: "attr", attr: "src"
    href?: Slot;            // kind: "attr", attr: "href"
    remove?: Slot;
  };
  subtotalPaths: number[][];  // every element whose text was the sum
  emptyPaths: number[][];     // elements present only when the cart is empty
  quantityPaths: number[][];  // steppers to neutralise (one-of-one stock)
  confidence: number;         // 0..1 — see below
};
```

Paths, not selectors: a child-index path is stable against class names we do not understand, and it
cannot accidentally match a table header the way `[class*='cart-item']` does.

### Derivation, in one pass

1. Parse the 1-item and 2-item captures.
2. Find every element whose text contains known title A. Take the **deepest common ancestor** of the
   A-matching set that does NOT contain title B — that is the row for A.
3. Verify: the same-shaped sibling containing title B exists. Two rows, one parent → the parent is
   the items container.
4. Within the row, locate slots by matching known values (title, price, image URL, product href).
5. Diff the empty capture against the 1-item capture: elements present only in the empty one are the
   empty state; elements present only in the full one are cart chrome that must be revealed.
6. Score confidence; refuse to store a template below threshold.

### Confidence and what we do without it

`confidence` is the fraction of slots found: a row plus title plus price is the minimum useful
template (0.6); image, href, subtotal and empty-state each add.

| Confidence | Behaviour |
|---|---|
| ≥ 0.6 | Use the derived template |
| < 0.6 | Fall back to `fallback-cart-page.ts` — VYA's own clean cart markup inside the store's chrome |

The fallback already exists and is already tested. **A derivation miss degrades to a working,
on-brand cart page — never to an empty drawer.** That is the property the current code lacks: today
a miss is silent and looks like a broken button.

Derivation failure is recorded as an import warning (`checks.ts`), so it surfaces at import time
rather than when a shopper clicks.

## What this replaces

| Today | After |
|---|---|
| `injectCartPage` — Dawn selectors, ~120 lines | `renderCart(template, lines)` |
| `buildCartDrawerSection` — Dawn selectors, ~90 lines | same function, different root |
| `buildKnownCartSections` — 3 hand-built Dawn section ids | derived, plus the icon bubble |
| a future Horizon renderer | *does not get written* |

`fallback-cart-page.ts` stays exactly as it is — it becomes the explicit low-confidence path rather
than only a missing-capture path.

## Scope boundaries

**In scope:** the cart page, the cart drawer, cart section re-renders, the count badge — for Shopify
themes of any generation.

**Not in scope:**

- **Squarespace.** It ships one storefront bundle shared by every Squarespace store, so it is already
  generic; `sqs-cart-json.ts` and `injectSqsCartPage` are unaffected.
- **Product pages, collection grids, search.** They have their own (working) live-injection path.
- **Themes that render the cart entirely client-side from JSON.** Derivation finds nothing, confidence
  is 0, the fallback serves. Explicitly accepted.

## Risks, honestly

1. **Two extra captures per import.** Mitigated: they are three fetches against a store we are already
   crawling for dozens of pages.
2. **A theme whose 2-item cart is not two sibling rows** (a grid, a `<ul>`, a virtualised list). The
   deepest-common-ancestor rule handles grids and lists; virtualised carts fail to the fallback.
3. **Child-index paths break if serve-time injection reorders nodes.** Mitigated by deriving and
   rendering against the same stored capture, and by re-deriving on every re-import.
4. **The known products could sell out** between capture passes, changing the cart under us. Detected:
   the 2-item capture must contain both titles or derivation is abandoned.
5. **This is a rewrite of a path that currently works for 16 stores.** Mitigated by keeping both
   renderers behind one interface and cutting over per-store on confidence, so a store only moves to
   the derived renderer when derivation actually succeeded for it.

## Testing

Pure functions, so unit tests carry most of it — but the fixtures must be **real captured HTML**, not
hand-written, or we would be testing our idea of a theme rather than a theme:

- `derive-cart-template.test.ts` — Dawn fixture (`loved-again`) and Horizon fixture (`lamash`) must
  each yield a template with the correct row, and **must not** select a table header row
- confidence scoring: a capture with no repeated subtree scores 0
- `render-cart.test.ts` — one template, one set of lines, correct output for page and drawer
- a regression test for the `?variant=` lookup bug (below)
- an end-to-end HTTP check per theme generation, using the `Host:`-header recipe — add an item, assert
  the returned `cart-drawer` section contains the title and the correct subtotal

**Two theme generations in the test corpus from day one.** The failure this design exists to prevent
was generalising from a sample of one.

## Sequencing

| Phase | Work | Evidence it worked |
|---|---|---|
| 0 | Fix `?variant=` in `sections_url` (strip the query before `getCapturePage`) and tighten the row selector so it cannot match a header | The drawer fills on `loved-again` for a URL carrying `?variant=` |
| 1 | `derive-cart-template.ts` + tests against both real fixtures | Correct row and slots on Dawn and Horizon |
| 2 | Capture the 2-item and empty passes at import; store the template | Re-import both stores; inspect the stored template |
| 3 | `renderCart()`; drawer reads the derived template when confidence ≥ 0.6 | Drawer correct on `lamash` |
| 4 | Cart page reads it too; delete the Dawn selector lists | 16 stores unchanged; `lamash` fixed |

Phase 0 is independent and ships first — it is a live bug on every theme, including the ones that
otherwise work.

## Open question for the reader

Phase 4 deletes `injectCartPage`'s selector logic, which today serves 16 working stores. The safer
alternative is to leave it as a second fallback tier below derivation and above
`fallback-cart-page.ts`. That is three tiers to reason about instead of two. **Recommendation: delete
it**, once derivation is proven on both theme generations — three tiers is how the current mess
started.
