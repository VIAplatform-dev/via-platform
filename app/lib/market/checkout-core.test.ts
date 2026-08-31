import { test } from "node:test";
import assert from "node:assert/strict";
import {
 canCheckoutTransition,
 allowedFromForPaid,
 checkoutExpired,
 MARKET_CHECKOUT_TTL_SECONDS,
 checkoutExpiry,
 isOpenCheckout,
 type MarketCheckoutStatus,
} from "./checkout-core.ts";

test("an awaiting checkout can be paid, canceled, expired or failed", () => {
 assert.equal(canCheckoutTransition("awaiting_payment", "paid"), true);
 assert.equal(canCheckoutTransition("awaiting_payment", "canceled"), true);
 assert.equal(canCheckoutTransition("awaiting_payment", "expired"), true);
 assert.equal(canCheckoutTransition("awaiting_payment", "failed"), true);
});

test("a paid checkout is terminal", () => {
 for (const to of ["awaiting_payment", "canceled", "expired", "failed", "paid"] as MarketCheckoutStatus[]) {
 assert.equal(canCheckoutTransition("paid", to), false, `paid → ${to}`);
 }
});

test("a late payment can still mark a canceled or expired checkout paid", () => {
 assert.equal(canCheckoutTransition("canceled", "paid"), true);
 assert.equal(canCheckoutTransition("expired", "paid"), true);
 assert.equal(canCheckoutTransition("failed", "paid"), false);
});

test("the paid claim lists exactly the statuses a payment may arrive from", () => {
 assert.deepEqual([...allowedFromForPaid()].sort(), ["awaiting_payment", "canceled", "expired"]);
});

test("a paid checkout whose item vanished becomes a conflict, never silently paid", () => {
 assert.equal(canCheckoutTransition("paid", "paid_conflict"), true);
 assert.equal(canCheckoutTransition("awaiting_payment", "paid_conflict"), false);
});

test("only awaiting checkouts are open", () => {
 assert.equal(isOpenCheckout("awaiting_payment"), true);
 assert.equal(isOpenCheckout("paid"), false);
 assert.equal(isOpenCheckout("canceled"), false);
});

test("a market checkout holds the item for 15 minutes", () => {
 assert.equal(MARKET_CHECKOUT_TTL_SECONDS, 15 * 60);
 const from = new Date("2026-08-28T10:00:00Z");
 assert.equal(checkoutExpiry(from).toISOString(), "2026-08-28T10:15:00.000Z");
 assert.equal(checkoutExpired(checkoutExpiry(from), new Date("2026-08-28T10:14:59Z")), false);
 assert.equal(checkoutExpired(checkoutExpiry(from), new Date("2026-08-28T10:15:00Z")), true);
});
