import test from "node:test";
import assert from "node:assert/strict";
import { planOfferCharge, offerChargeMetadata, offerIdempotencyKey, type ChargeableOffer } from "./offer-charge-core.ts";

const base = (over: Partial<ChargeableOffer> = {}): ChargeableOffer => ({
 binding: true,
 itemId: "itm_1",
 token: "tok_abc",
 amountCents: 8000,
 buyerName: "Ada",
 buyerEmail: "ada@example.com",
 stripeCustomerId: "cus_1",
 stripePaymentMethodId: "pm_1",
 shipTo: { line1: "1 High St", city: "London", zip: "N1 1AA", country: "GB" },
 ...over,
});

test("a non-binding offer is never charged", () => {
 // Accepting one of these emails a link and leaves the piece on sale. That is the default, and the
 // only thing standing between it and someone's card is this line.
 const plan = planOfferCharge(base({ binding: false }));
 assert.equal(plan.ok, false);
 assert.equal(plan.ok === false && plan.reason, "not-binding");
 assert.equal(planOfferCharge(base({ binding: null })).ok, false);
});

test("a binding offer with no saved card falls back rather than charging", () => {
 for (const missing of ["stripePaymentMethodId", "stripeCustomerId", "shipTo", "itemId"] as const) {
  const plan = planOfferCharge(base({ [missing]: null }));
  assert.equal(plan.ok, false, `${missing} missing must block`);
  assert.equal(plan.ok === false && plan.reason, "no-card");
 }
});

test("an offer already redeemed is not charged twice", () => {
 // The webhook stamps consumedAt when the sale lands. Accept pressed again a week later is past
 // Stripe's idempotency window, so this is the only thing that stops a second charge.
 const plan = planOfferCharge(base({ consumedAt: "2026-09-01T00:00:00Z" }));
 assert.equal(plan.ok === false && plan.reason, "already-sold");
});

test("a complete binding offer is chargeable", () => {
 const plan = planOfferCharge(base());
 assert.equal(plan.ok, true);
 if (plan.ok) assert.equal(plan.offer.stripePaymentMethodId, "pm_1");
});

test("the metadata is exactly what the webhook reads", () => {
 // These keys are the contract with app/api/webhooks/stripe-connect. One spelled differently is a
 // sale that takes the money and never ships.
 const m = offerChargeMetadata(base(), "sel_9");
 assert.equal(m.itemId, "itm_1");
 assert.equal(m.sellerId, "sel_9");
 assert.equal(m.offer_token, "tok_abc");
 assert.equal(m.sale_price_cents, "8000");
 assert.equal(m.ship_line1, "1 High St");
 assert.equal(m.ship_country, "GB");
 assert.equal(m.buyer_email, "ada@example.com");
 // The buyer agreed a price for the piece, not for the piece plus postage.
 assert.equal(m.shipping_paid_cents, "0");
 // Every value a string: Stripe rejects metadata that isn't.
 for (const [k, v] of Object.entries(m)) assert.equal(typeof v, "string", `${k} must be a string`);
});

test("the shipping name falls back to the buyer's name", () => {
 // The address form can be submitted without a name on it; the label still needs one.
 assert.equal(offerChargeMetadata(base({ shipTo: { line1: "1 High St" } }), "s").ship_name, "Ada");
 assert.equal(offerChargeMetadata(base({ shipTo: { line1: "x", name: "A Shop" } }), "s").ship_name, "A Shop");
});

test("a missing country defaults to US rather than empty", () => {
 // An empty country is a label Shippo will refuse to buy.
 assert.equal(offerChargeMetadata(base({ shipTo: { line1: "1 Main" } }), "s").ship_country, "US");
});

test("the idempotency key is per offer, so Accept can be pressed twice", () => {
 assert.equal(offerIdempotencyKey("tok_abc"), "offer-accept-tok_abc");
 assert.notEqual(offerIdempotencyKey("a"), offerIdempotencyKey("b"));
});
