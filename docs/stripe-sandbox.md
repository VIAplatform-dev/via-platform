# Testing checkout against Stripe, without real money

Everything in the buying path — the connected account, the charge, VYA's fee, the payout schedule,
the webhook that turns a payment into an order, the refund — runs against Stripe. None of it can be
exercised locally without talking to Stripe, and all of it is worth exercising before a real buyer
does. This is how to do that safely.

The danger is **not** Stripe. It is the database.

## The one hazard

A Stripe connected account id is `acct_1Abc…` in test mode and `acct_1Abc…` in live mode. The string
carries no hint of which world it came from, and neither does the account: the key the server is
holding decides which world it is asking about.

So if you point a server holding **test** keys at the **production** database and onboard one store,
`seller_payments.stripe_account_id` now holds a test account id for a real seller. Production, still
running live keys, then tries to charge an account that does not exist there — and that store's
checkout, its Market Mode POS, and refunds against it all fail, with a Stripe error that reads like
a transient outage rather than the data problem it is.

Two things now make that hard to do by accident (`app/lib/stripe-mode.ts`):

- Every connected account is **stamped** with the mode of the key that created it
  (`seller_payments.stripe_mode`).
- Every money path — storefront checkout, cart, single item, Market Mode, refunds — resolves the
  account through `payableAccountId()`, which returns nothing for an account belonging to the other
  mode. The store simply reads as "can't take payments yet" rather than failing at Stripe.
- Onboarding a store that is already connected in the other mode is **refused**, not overwritten
  (`connectBlockedReason()`), because the row holds a single id and overwriting it is the
  destructive half of the accident.

Rows saved before the stamp existed have no mode and keep working — production has only ever run one
key, so they are live by definition. A sandbox never meets them, because a sandbox does not share
their database. Which is the next part.

## Setup

### 1. A database of its own

Neon branches instantly, so the sandbox gets a copy of the schema and data without touching the
original:

```
Neon console → the VYA project → Branches → New branch (from `main`, name it `sandbox`)
```

Copy that branch's connection string. Nothing you do on it can reach production data — test orders,
test accounts, test payouts all land on the branch. Re-branch whenever you want fresh data.

### 2. Stripe test keys

In the Stripe dashboard, switch to **test mode** (or create a dedicated Sandbox, which gets its own
keys) and take the two keys from Developers → API keys.

### 3. `.env.local`

Point the local server at both. Keep the live values somewhere safe first — you are overwriting
them:

```sh
DATABASE_URL=<the Neon sandbox branch connection string>

STRIPE_SECRET_KEY=sk_test_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…

# from `stripe listen`, step 4 — NOT the dashboard's live signing secret
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_…
STRIPE_WEBHOOK_SECRET=whsec_…
```

Sanity check before anything else — this must say `test`:

```sh
node --env-file=.env.local --experimental-strip-types -e \
  'import("./app/lib/stripe-mode.ts").then(m => console.log(m.currentStripeMode()))'
```

### 4. The Stripe CLI, for webhooks

A payment only becomes an order when `payment_intent.succeeded` arrives — that is where the order
row, the item going `sold`, the consignor credit and the buyer's email all happen. Stripe cannot
reach `localhost`, so the CLI forwards for you:

```sh
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-connect-to localhost:3333/api/webhooks/stripe-connect
```

It prints a `whsec_…` on start — that is the value for `STRIPE_CONNECT_WEBHOOK_SECRET` above, and it
changes each run. Leave it running in its own terminal; it logs every event it forwards, which is
the fastest way to see whether fulfillment fired.

Connected-account events (the ones that matter here) need `--forward-connect-to`. Add a second
listener with `--forward-to localhost:3333/api/webhooks/stripe` if you are also testing
platform-level events such as subscription billing.

## Walking the whole path

With the server running (`npm run dev`, port 3333):

**1. Onboard a store.** Open `/admin/payments` as the store, hit Set up payments. The embedded
Stripe onboarding appears; in test mode it accepts Stripe's own test identity — use `000-00-0000`
for the SSN, `Test` / `Person` for the name, any address, and the test bank account
`110000000` / `000123456789`. Charges should flip on within seconds.

**2. Check the payout schedule took.** This is the piece that cannot be verified any other way:

```sh
stripe accounts retrieve acct_…
```

Look at `settings.payouts.schedule.delay_days` in the response — it should equal the store's return window + 3 (17 for a store on
the 14-day default), or `minimum` for a final-sale store. Change the window in Settings → Returns and
retrieve again — it should move. See `app/lib/payout-schedule.ts`.

**3. Buy something.** On the store's own domain, add to cart and check out with `4242 4242 4242 4242`,
any future expiry, any CVC. Watch the CLI: `payment_intent.succeeded` should forward and the order
should appear in the store's Orders tab.

**4. Check the money split.** In the Stripe dashboard (test mode), the payment should show on the
**connected** account with an application fee to the platform — 1% of the subtotal plus the shipping
plus any consignor hold. That fee is VYA's whole revenue on the sale, so it is worth eyeballing once.

**5. Refund it.** From the order page. The buyer's refund, VYA's fee reversal and the item being
relisted all happen together; the dashboard should show the fee refunded too.

Other cards worth trying: `4000 0000 0000 9995` (declined, insufficient funds) to see the checkout
error path, and `4000 0025 0000 3155` for a 3D-Secure challenge.

## Getting back to production

Restore the original `DATABASE_URL`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and
both webhook secrets in `.env.local`, and stop the CLI listener. Nothing in the sandbox needs
cleaning up — it lived on its own branch. If you ever *do* run test keys against the production
database, the guards above mean the damage is a refused onboarding rather than a broken seller.
