import { test } from "node:test";
import assert from "node:assert/strict";
import { accountUsableHere, connectBlockedReason, currentStripeMode, payableAccountId } from "./stripe-mode.ts";

const TEST_ENV = { STRIPE_SECRET_KEY: "sk_test_51AbcDEF" } as NodeJS.ProcessEnv;
const LIVE_ENV = { STRIPE_SECRET_KEY: "sk_live_51AbcDEF" } as NodeJS.ProcessEnv;
const NO_ENV = {} as NodeJS.ProcessEnv;

test("the running key decides which Stripe world we are in", () => {
 assert.equal(currentStripeMode(TEST_ENV), "test");
 assert.equal(currentStripeMode(LIVE_ENV), "live");
 assert.equal(currentStripeMode({ STRIPE_SECRET_KEY: "rk_test_x" } as NodeJS.ProcessEnv), "test");
 assert.equal(currentStripeMode(NO_ENV), null);
 assert.equal(currentStripeMode({ STRIPE_SECRET_KEY: "garbage" } as NodeJS.ProcessEnv), null, "a malformed key fails closed");
});

const connected = (mode: "test" | "live" | null) => ({ stripeAccountId: "acct_1Abc", chargesEnabled: true, stripeMode: mode });

test("a live account is never charged by a server holding test keys — the whole point", () => {
 // Both ids read `acct_…`, so without the stamp this is indistinguishable from a working account
 // and the charge fails at Stripe with an error that looks like an outage.
 assert.equal(payableAccountId(connected("live"), TEST_ENV), null);
 assert.equal(payableAccountId(connected("test"), LIVE_ENV), null);
});

test("an account matching the running key is charged as normal", () => {
 assert.equal(payableAccountId(connected("live"), LIVE_ENV), "acct_1Abc");
 assert.equal(payableAccountId(connected("test"), TEST_ENV), "acct_1Abc");
});

test("accounts connected before the stamp existed keep working", () => {
 // Every one of them is live — production has only ever run one key — and refusing them would take
 // every existing seller's checkout down the moment this shipped.
 assert.equal(payableAccountId(connected(null), LIVE_ENV), "acct_1Abc");
 assert.equal(accountUsableHere(null, TEST_ENV), true);
});

test("a store that can't take payments yet is still refused, mode or no mode", () => {
 assert.equal(payableAccountId(null, LIVE_ENV), null);
 assert.equal(payableAccountId({ stripeAccountId: null, chargesEnabled: false }, LIVE_ENV), null);
 assert.equal(payableAccountId({ stripeAccountId: "acct_1Abc", chargesEnabled: false, stripeMode: "live" }, LIVE_ENV), null, "onboarding unfinished");
});

test("connecting is refused when it would overwrite the other mode's account", () => {
 const why = connectBlockedReason(connected("live"), TEST_ENV);
 assert.match(why || "", /live mode/);
 assert.match(why || "", /test keys/);
});

test("connecting is allowed for a store that has no account, or one in this mode", () => {
 assert.equal(connectBlockedReason(null, TEST_ENV), null);
 assert.equal(connectBlockedReason({ stripeAccountId: null }, TEST_ENV), null);
 assert.equal(connectBlockedReason(connected("test"), TEST_ENV), null);
 assert.equal(connectBlockedReason(connected(null), TEST_ENV), null, "an unstamped legacy row is not blocked");
});
