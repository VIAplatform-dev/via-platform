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

test("an in-person sale carries its sales tax", () => {
 // IN-PERSON WAS THE ONE CHANNEL THAT CHARGED NONE. A dress sold across a table in a state with
 // sales tax is as taxable as the same dress posted from the same shop.
 const c = { id: "co_1", itemId: "i1", sellerId: "s1", amountCents: 12000, currency: "usd", tender: "qr" } as never;
 const p = marketSessionParams({
  checkout: c, item: { title: "Silk slip", image: null }, base: "https://getvya.ai",
  feeCents: 120, now: new Date(), taxCents: 990, taxCalculationId: "taxcalc_1",
 });
 // Its own line, so the buyer sees what it is rather than a rounder number.
 const lines = Object.values(p.line_items) as { price_data: { unit_amount: number; product_data: { name: string } } }[];
 assert.equal(lines.length, 2);
 assert.equal(lines[1].price_data.unit_amount, 990);
 assert.equal(lines[1].price_data.product_data.name, "Sales tax");
 // And the calculation travels, so the webhook can file the transaction once the money is taken.
 assert.equal(p.metadata.tax_calculation, "taxcalc_1");
 assert.equal(p.metadata.tax_cents, "990");
});

test("no tax, no line and no metadata", () => {
 // Most sellers have no registrations, so Stripe calculates nothing and nothing should appear.
 const c = { id: "co_2", itemId: "i1", sellerId: "s1", amountCents: 12000, currency: "usd", tender: "qr" } as never;
 const p = marketSessionParams({ checkout: c, item: { title: "Silk slip", image: null }, base: "https://getvya.ai", feeCents: 120, now: new Date() });
 assert.equal(Object.values(p.line_items).length, 1);
 assert.equal(p.metadata.tax_calculation, undefined);
});

test("a keyed sale puts the tax on the amount, having no line items to hang it off", () => {
 const c = { id: "co_3", itemId: "i1", sellerId: "s1", amountCents: 12000, currency: "usd", tender: "keyed" } as never;
 const p = marketIntentParams({ checkout: c, feeCents: 120, taxCents: 990, taxCalculationId: "taxcalc_2" });
 assert.equal(p.amount, 12990);
 assert.equal(p.metadata.tax_calculation, "taxcalc_2");
 // And without tax it is untouched, never 12000 plus undefined.
 assert.equal(marketIntentParams({ checkout: c, feeCents: 120 }).amount, 12000);
});
