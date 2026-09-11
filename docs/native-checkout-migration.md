# Moving checkout off Shopify and onto VYA

**Status:** planned, not started. Written 11 Sept 2026 so the shape is settled before the first
store is migrated, not during.

Today the stores are Shopify collabs, so the app hands a buyer to `vyaplatform.com/store/{slug}/cart`
in a browser sheet (`mobile/app/(tabs)/cart.tsx`, `mobile/app/product/[id].tsx`). That is the only
reason the marketplace side of the app still opens the web at all — the seller side no longer does.

When stores move to VYA we host the checkout, which removes the browser sheet **and** unlocks the
thing Shopify can never do: one basket across several stores, paid once.

---

## 1. What already exists

Worth knowing before designing anything, because most of it does not need rebuilding.

| Piece | Where | State |
|---|---|---|
| Native checkout | `app/api/checkout/route.ts` | Works. **One item, one seller.** |
| Cart storage | `app/lib/cart-db.ts` | Rows already carry `store_slug` — multi-store ready |
| Shipping price | `app/lib/shipping-tiers.ts`, `shipping-zones.ts` | Flat tiers, per-store zones + overrides |
| Free-shipping rule | `app/lib/checkout-delivery.ts` | `freeShippingFor(settings, subtotal)` — **per store** |
| Label purchase | `app/api/store/orders/[id]` `buy_label` | Per order, from that store's ship-from |
| Tax | Stripe Tax on each seller's connected account | Per store |
| Discounts | `validateDiscount(slug, code)` | Per store |

The buyer pays a **flat tier** (small $8 / medium $14 / large $24); VYA buys the real discounted
label and keeps the spread. That spread is why the application fee includes the shipping the buyer
paid — VYA holds it to fund the label later.

---

## 2. The one hard constraint

`/api/checkout` opens a **direct charge on the seller's connected account**, which makes the seller
the merchant of record. That is deliberate: the seller owns the sale, the tax and the chargeback.

**A direct charge cannot span two connected accounts.** So "one basket, several stores, one card"
is not a bigger version of what exists — it is a different payment topology, and there are only two
honest answers:

### Option A — one card, N payment intents (recommended)

Collect the card once (Stripe `PaymentSheet` / a `SetupIntent`), then confirm **one PaymentIntent
per store**, each a direct charge on that store's account.

- Keeps every store the merchant of record. Tax, refunds, chargebacks and payouts are unchanged.
- Each store's discount, free-shipping threshold and tax are evaluated against **its own** lines,
  which is what the existing helpers already do.
- The cost: **partial failure is real.** Store A succeeds, store B's card declines. This needs a
  decided rule before a line of code — see §5.

### Option B — one payment to VYA, then transfers

One PaymentIntent on VYA's platform account, then `transfer_data` / separate transfers out.

- One charge, no partial-failure problem.
- **VYA becomes the merchant of record** for every sale. VYA owns chargebacks, refunds, and the
  sales-tax registration in every state where buyers are — a business and legal change, not an
  engineering one. It also makes the existing per-store Stripe Tax setup redundant.

**DECIDED (11 Sept, Hana): Option A.** Each store stays the merchant of record; the buyer enters a
card once and VYA confirms one PaymentIntent per store.

---

## 3. Shipping across several stores

A basket from three stores is **three parcels from three addresses**, so it is three of everything:
three tier calculations, three labels, three tracking numbers.

The rule:

1. **Group the cart by `store_slug`.** Every calculation below is per group, never on the basket.
2. **Per group, pick one tier** from that group's combined weight and girth — three tops from one
   store is one parcel, and it may be a size up from any single item.
3. **Per group, price that tier against that store's zones** (`shipping-zones.ts`), which may
   override the standard tier price for the buyer's zone. A store that does not ship to that zone
   fails the whole basket at validation, not at payment.
4. **Evaluate free shipping per group — unless VYA funds a basket-level threshold.** As written,
   `freeShippingFor` takes a subtotal and it must be *that store's* subtotal. **This is the trap:**
   passing the basket total gives free shipping on a £40 order because the buyer also spent £200
   somewhere else, and the store eats a label it never agreed to.

   Hana has raised wanting a basket-wide offer anyway ("free shipping over $500 of the total cart"),
   which is a good offer and a real conversion lever. It is possible — it just cannot be free. One
   of these has to be true, and it is a business decision, not a technical one:

   - **VYA funds it.** The store is still paid its shipping; VYA absorbs the tiers as a marketing
     cost. Cleanest for sellers, and the cost is predictable — it is the tier table, not a live rate.
   - **Stores opt in.** A store choosing to join basket-level free shipping waives its own shipping
     on qualifying baskets. Needs a per-store switch and a line in the seller agreement.
   - **Split proportionally.** Each store waives shipping in proportion to its share of the basket.
     Fairest on paper, hardest to explain on a payout statement — not recommended.

   Until that is answered, build per-store. The basket-level rule is a layer ON TOP, and it is much
   easier to add one than to unpick it.
5. **Sum for display**, but keep the per-store breakdown on screen. "Shipping £22" on a three-store
   basket looks wrong; "£8 + £8 + £6 from three shops" reads as obviously correct.

Labels are still bought per store-order afterwards, unchanged — each store buys its own from its own
ship-from, exactly as it does now.

**Pickup is per store too.** A basket where one store offers collection and two do not cannot have a
single delivery choice; it is a per-group choice or it is wrong.

---

## 4. What gets built

Roughly in order. None of it is started.

1. **`POST /api/cart/quote`** — basket in, per-store groups out: subtotal, tier, shipping, free-shipping
   state, tax, discount, total. Pure enough to unit test, which matters because this is the
   arithmetic a buyer disputes.
2. **`POST /api/checkout/basket`** — replaces the single-item route for native stores. Creates one
   PaymentIntent per store group, returns them with the client secret set for a single card entry.
3. **Order creation per store.** One VYA order per store group, as today, so fulfilment, labels and
   the seller's Orders screen need no change at all.
4. **Mobile cart + checkout screens** — replacing the browser sheet in `(tabs)/cart.tsx` and
   `product/[id].tsx`. Stripe's native `PaymentSheet` is **already in the app** and already taking
   card payments in market mode, so the payment half is solved.
5. **Delete the browser sheets** once every store is native (see §6 — the two must coexist first).

---

## 5. Partial failure — decide before building

Three stores, two charges succeed, one declines. The basket is not atomic and pretending otherwise
will produce the worst bug in the system.

The rule to agree on:

- **Charge per store, confirm all, then report.** The buyer gets "two of three went through" with
  the failed store still in the basket, its items still held.
- **Never roll back a successful charge** to make the basket look clean. That store made a sale; a
  refund to tidy a screen is a refund the seller has to explain.
- **Hold the failed store's stock** for the length of the retry window, not indefinitely.

**DECIDED (11 Sept, Hana): charge per store.** The basket is not atomic and the screen will say so.
No successful charge is ever reversed to make the basket look tidy.

---

## 6. Migrating a store, one at a time

Shopify-collab and native stores must coexist — no flag day.

- A store gains a boolean, e.g. `checkoutMode: "shopify" | "vya"`. The mobile cart reads it per item.
- A basket that mixes the two is split on screen: native items check out in-app, Shopify items keep
  the browser sheet, and the screen says why rather than failing.
- Move stores in ones and twos. Reconcile the first live orders by hand before the next.
- When the last store flips, remove the sheet and the `checkoutMode` field with it.

---

## 7. Open questions

- ~~Partial failure rule~~ — decided: charge per store (§5).
- ~~Merchant of record~~ — decided: Option A, the seller (§2).
- **Who funds basket-level free shipping** (§3.4) — VYA, opt-in stores, or split. Open.
- **One tier per store, or per parcel?** A store shipping two heavy coats may genuinely want two
  parcels. Today's model says one order, one parcel; a multi-item basket makes that assumption
  visible for the first time.
- **Refunds across a split basket** — refunding "the order" means refunding one store's charge.
  The buyer thinks in baskets; the system thinks in stores. The UI has to speak the buyer's language.
