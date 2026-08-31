// Which Stripe world a connected account belongs to — test or live — and the rule that keeps the
// two from ever being mixed.
//
// WHY THIS EXISTS. A Stripe connected account id is `acct_1Abc…` in BOTH test and live mode: the
// string carries no hint of which world made it. Nothing else does either — the account lives in
// one Stripe mode, and the key the server happens to be holding decides which mode it is asking
// about. Point a server with test keys at the production database, onboard one store, and
// `seller_payments.stripe_account_id` now holds a TEST account id for a real seller. Production,
// running live keys, then tries to charge an account that does not exist in live mode: that store's
// checkout is dead, its Market Mode POS is dead, and refunds on it fail — with a Stripe error that
// reads like a transient outage rather than the data problem it is.
//
// Nothing in the app noticed which mode it was in before this file. `stripeConfigured()` only ever
// asked whether a key was present.
//
// THE RULE. Stamp the mode when an account is saved, and treat an account from the other mode as if
// the store had never connected at all — the seller-facing message is the one that already exists
// ("this store can't take payments yet"), and no charge, refund or transfer is attempted against an
// id the current key cannot see. A sandbox then cannot corrupt live data even when it is pointed at
// the live database, which is the one mistake worth engineering against.
//
// Pure: the key is read from an env object the caller passes (defaulting to process.env), so the
// rules are testable without a Stripe key anywhere.

export type StripeMode = "test" | "live";

/**
 * The mode the server's own secret key belongs to, or null when no key is configured.
 *
 * Stripe's test keys are prefixed `sk_test_` / `rk_test_`; everything else it issues is live. A
 * malformed key resolves to null rather than guessing "live", so a broken environment fails closed.
 */
export function currentStripeMode(env: NodeJS.ProcessEnv = process.env): StripeMode | null {
 const key = (env.STRIPE_SECRET_KEY || "").trim();
 if (!key) return null;
 if (/^(sk|rk)_test_/.test(key)) return "test";
 if (/^(sk|rk)_live_/.test(key)) return "live";
 return null;
}

/**
 * Is this stored account usable with the key the server is holding?
 *
 * A row saved before this column existed has no mode (`null`). Those are treated as usable: they
 * are the accounts every store connected before the stamp existed, they are live by definition
 * (there has only ever been one production key), and refusing them would take every existing
 * seller's checkout down. A sandbox never sees them, because a sandbox never shares their database.
 */
export function accountUsableHere(accountMode: StripeMode | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
 if (!accountMode) return true;
 return accountMode === currentStripeMode(env);
}

/** The connected account to charge, or null when there is nothing safe to charge. Every money path
 *  — storefront checkout, cart, Market Mode, refunds — resolves its account through this. */
export function payableAccountId(
 pay: { stripeAccountId?: string | null; chargesEnabled?: boolean; stripeMode?: StripeMode | null } | null | undefined,
 env: NodeJS.ProcessEnv = process.env,
): string | null {
 if (!pay?.stripeAccountId || !pay.chargesEnabled) return null;
 return accountUsableHere(pay.stripeMode, env) ? pay.stripeAccountId : null;
}

/**
 * Why an onboarding attempt is being refused, or null when it may go ahead.
 *
 * Creating a second account would overwrite the store's real one — the row holds a single id — so a
 * store already connected in the other mode is refused rather than reconnected. This is the check
 * that makes a sandbox pointed at the live database annoying instead of destructive.
 */
export function connectBlockedReason(
 pay: { stripeAccountId?: string | null; stripeMode?: StripeMode | null } | null | undefined,
 env: NodeJS.ProcessEnv = process.env,
): string | null {
 if (!pay?.stripeAccountId || !pay.stripeMode) return null;
 const here = currentStripeMode(env);
 if (pay.stripeMode === here) return null;
 return `This store is already connected to Stripe in ${pay.stripeMode} mode, but the server is running ${here || "no"} keys. `
  + `Connecting now would overwrite the ${pay.stripeMode}-mode account. Use a sandbox database, or switch keys.`;
}
