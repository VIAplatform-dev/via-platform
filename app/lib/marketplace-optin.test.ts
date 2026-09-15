import { test } from "node:test";
import assert from "node:assert/strict";
import { describeOptIn, includesInMarketplace, DEFAULT_OPT_IN } from "./marketplace-optin.ts";

test("a store is not on the marketplace until it says so", () => {
 assert.equal(DEFAULT_OPT_IN.listed, false);
 assert.equal(includesInMarketplace(DEFAULT_OPT_IN), false);
 assert.equal(includesInMarketplace(null), false);
 assert.equal(includesInMarketplace(undefined), false);
 assert.equal(includesInMarketplace({ listed: true, decidedAt: null }), true);
});

test("what the seller is told it is doing", () => {
 assert.match(describeOptIn(DEFAULT_OPT_IN, 120), /stay on your own shop/);
 // On, but nothing listed yet: a decision, not a fault.
 assert.match(describeOptIn({ listed: true, decidedAt: null }, 0), /Nothing to show yet/);
 assert.match(describeOptIn({ listed: true, decidedAt: null }, 1), /1 live piece is/);
 assert.match(describeOptIn({ listed: true, decidedAt: null }, 42), /42 live pieces are/);
});
