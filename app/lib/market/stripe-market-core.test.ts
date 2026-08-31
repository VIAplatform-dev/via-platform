import { test } from "node:test";
import assert from "node:assert/strict";
import { marketSessionParams, marketIntentParams, reconcileDecision, MARKET_METADATA_CHANNEL } from "./stripe-market-core.ts";

const checkout = { id: "ck-1", itemId: "it-1", sellerId: "se-1", amountCents: 8500, currency: "USD", tender: "qr" as const, createdAt: "2026-08-28T10:00:00.000Z", expiresAt: "2026-08-28T10:15:00.000Z" };
const item = { title: "Vintage Levi's 501", image: "https://x/y.jpg" };

test("a market Checkout Session is card-only, fee-bearing, address-free and tagged for the webhook", () => {
 const p = marketSessionParams({ checkout, item, base: "https://vyaplatform.com", feeCents: 85, now: new Date("2026-08-28T10:00:00Z") });
 assert.equal(p.mode, "payment");
 assert.deepEqual(p.payment_method_types, { 0: "card" });
 assert.equal(Array.isArray(p.line_items), false); // the form-encoder can't take arrays
 assert.equal(p.line_items[0].price_data.unit_amount, 8500);
 assert.equal(p.line_items[0].price_data.currency, "usd");
 assert.equal(p.line_items[0].price_data.product_data.name, "Vintage Levi's 501");
 assert.equal(p.payment_intent_data.application_fee_amount, 85);
 assert.equal(p.metadata.channel, MARKET_METADATA_CHANNEL);
 assert.equal(p.metadata.market_checkout_id, "ck-1");
 assert.equal(p.payment_intent_data.metadata.market_checkout_id, "ck-1");
 assert.equal(p.success_url, "https://vyaplatform.com/pay/done");
 assert.equal(p.expires_at, Math.floor(new Date("2026-08-28T10:30:00Z").getTime() / 1000)); // Stripe's 30-min minimum
 assert.equal("shipping_address_collection" in p, false);
});

test("a cart becomes one Stripe line per item at its SALE price (discounts included), as an indexed object", () => {
 const p = marketSessionParams({ checkout: { ...checkout, amountCents: 11650 }, item, items: [{ title: "Jacket", image: null, saleCents: 7650 }, { title: "Scarf", image: "https://x/s.jpg", saleCents: 4000 }], base: "https://vyaplatform.com", feeCents: 117, now: new Date() });
 assert.equal(Array.isArray(p.line_items), false);
 assert.equal(p.line_items[0].price_data.unit_amount, 7650);
 assert.equal(p.line_items[1].price_data.unit_amount, 4000);
 assert.equal(p.line_items[1].price_data.product_data.name, "Scarf");
 assert.equal(p.line_items[2], undefined);
});

test("a zero fee omits application_fee_amount (Stripe rejects 0)", () => {
 const p = marketSessionParams({ checkout, item, base: "https://vyaplatform.com", feeCents: 0, now: new Date() });
 assert.equal("application_fee_amount" in p.payment_intent_data, false);
});

test("a keyed PaymentIntent carries the same tag so the same webhook branch finalizes it", () => {
 const p = marketIntentParams({ checkout: { ...checkout, tender: "keyed" }, feeCents: 85 });
 assert.equal(p.amount, 8500);
 assert.deepEqual(p.payment_method_types, { 0: "card" });
 assert.equal(p.metadata.channel, MARKET_METADATA_CHANNEL);
 assert.equal(p.metadata.tender, "keyed");
});

test("reconcile: a paid Session finalizes; an unpaid one past the hold expires; a fresh one waits", () => {
 assert.equal(reconcileDecision({ status: "awaiting_payment", tender: "qr", expiresAt: "2026-08-28T10:15:00Z", createdAt: "2026-08-28T10:00:00Z" }, { paid: true, paymentIntent: "pi_1" }, new Date("2026-08-28T10:05:00Z")), "finalize");
 assert.equal(reconcileDecision({ status: "awaiting_payment", tender: "qr", expiresAt: "2026-08-28T10:15:00Z", createdAt: "2026-08-28T10:00:00Z" }, { paid: false, paymentIntent: null }, new Date("2026-08-28T10:16:00Z")), "expire");
 assert.equal(reconcileDecision({ status: "awaiting_payment", tender: "qr", expiresAt: "2026-08-28T10:15:00Z", createdAt: "2026-08-28T10:00:00Z" }, { paid: false, paymentIntent: null }, new Date("2026-08-28T10:05:00Z")), "wait");
});

test("reconcile: a payment that lands after expiry still finalizes (money is the fact)", () => {
 assert.equal(reconcileDecision({ status: "expired", tender: "qr", expiresAt: "2026-08-28T10:15:00Z", createdAt: "2026-08-28T10:00:00Z" }, { paid: true, paymentIntent: "pi_1" }, new Date("2026-08-28T10:20:00Z")), "finalize");
 assert.equal(reconcileDecision({ status: "paid", tender: "qr", expiresAt: "2026-08-28T10:15:00Z", createdAt: "2026-08-28T10:00:00Z" }, { paid: true, paymentIntent: "pi_1" }, new Date()), "none");
});

test("reconcile: a cash checkout never asks Stripe", () => {
 assert.equal(reconcileDecision({ status: "awaiting_payment", tender: "cash", expiresAt: "2026-08-28T10:15:00Z", createdAt: "2026-08-28T10:00:00Z" }, null, new Date("2026-08-28T10:05:00Z")), "wait");
 assert.equal(reconcileDecision({ status: "awaiting_payment", tender: "cash", expiresAt: "2026-08-28T10:15:00Z", createdAt: "2026-08-28T10:00:00Z" }, null, new Date("2026-08-28T10:16:00Z")), "expire");
});
