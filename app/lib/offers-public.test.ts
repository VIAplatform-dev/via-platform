import { test } from "node:test";
import assert from "node:assert/strict";
import { publicOffer, type Offer } from "./offers-db.ts";

// publicOffer is a security boundary: /api/storefront/offer/[token] is reachable by anyone
// holding the emailed token, so whatever this returns is effectively published. These pin the
// allowlist: widen it and the test fails loudly instead of the leak shipping quietly.

const sample: Offer = {
 id: 7,
 storeSlug: "lei-vintage",
 itemId: "item_123",
 itemTitle: "Cavalli slip dress",
 buyerName: "Jordan T.",
 buyerEmail: "jordan@example.com",
 token: "1f0a9c2e-0000-4000-8000-000000000000",
 listPriceCents: 42000,
 amountCents: 35000,
 status: "accepted",
 lastActor: "store",
 binding: true,
 consumedAt: null,
 consumedOrderId: "ord_987",
 createdAt: "2026-08-01T00:00:00.000Z",
 updatedAt: "2026-08-02T00:00:00.000Z",
 expiresAt: "2026-08-04T00:00:00.000Z",
};

test("publicOffer exposes exactly the buyer-facing fields", () => {
 assert.deepEqual(Object.keys(publicOffer(sample)).sort(), [
 "amountCents",
 "binding",
 "expiresAt",
 "itemId",
 "itemTitle",
 "lastActor",
 "listPriceCents",
 // Whether the money went through, and nothing about the order behind it. A binding offer whose
 // card declined is accepted but not paid, and the buyer's page has to be able to tell her so.
 "paid",
 "status",
 "storeSlug",
 ]);
});

test("publicOffer withholds contact details and internal bookkeeping", () => {
 const out = publicOffer(sample) as Record<string, unknown>;
 for (const secret of ["buyerEmail", "buyerName", "token", "consumedOrderId", "consumedAt", "id"]) {
 assert.equal(secret in out, false, `${secret} must not be served to the buyer page`);
 }
 // Serializing must not smuggle them back in either.
 const wire = JSON.stringify(publicOffer(sample));
 assert.equal(wire.includes("jordan@example.com"), false);
 assert.equal(wire.includes("Jordan T."), false);
 assert.equal(wire.includes(sample.token), false);
});

test("publicOffer still carries what the page renders", () => {
 const o = publicOffer(sample);
 assert.equal(o.status, "accepted");
 assert.equal(o.amountCents, 35000);
 assert.equal(o.listPriceCents, 42000);
 assert.equal(o.binding, true);
 assert.equal(o.itemId, "item_123");
 assert.equal(o.lastActor, "store");
});

test("paid says whether the money went through, not whether it was accepted", () => {
 // An accepted binding offer whose card declined is held, not sold. Saying "paid" there tells a
 // buyer who still owes money that she is done, and she finds out when the piece doesn't arrive.
 assert.equal(publicOffer({ ...sample, status: "accepted", binding: true, consumedAt: null } as never).paid, false);
 assert.equal(publicOffer({ ...sample, status: "accepted", binding: true, consumedAt: "2026-09-14T10:00:00Z" } as never).paid, true);
});

test("a binding offer's card and address never reach the public shape", () => {
 // The offer page is reachable by anyone holding the emailed token, and emails get forwarded. A
 // binding offer now carries a Stripe customer, a payment method and a home address; none of it is
 // anybody's business but the shop's.
 const o = {
  storeSlug: "s", itemId: "i", itemTitle: "t", listPriceCents: 10000, amountCents: 8000,
  status: "accepted", lastActor: "store", binding: true, expiresAt: "2026-01-01",
  id: 1, buyerName: "Ada", buyerEmail: "ada@example.com", token: "tok",
  consumedAt: null, consumedOrderId: null, createdAt: "", updatedAt: "",
  stripeCustomerId: "cus_123", stripePaymentMethodId: "pm_456",
  shipTo: { line1: "1 High St", city: "London", zip: "N1 1AA", country: "GB" },
 } as never;
 const pub = publicOffer(o) as Record<string, unknown>;
 for (const secret of ["stripeCustomerId", "stripePaymentMethodId", "shipTo", "buyerEmail", "buyerName", "consumedOrderId"]) {
  assert.equal(pub[secret], undefined, `${secret} must not be published`);
 }
 assert.equal(JSON.stringify(pub).includes("High St"), false);
 assert.equal(JSON.stringify(pub).includes("cus_123"), false);
 // And the things the buyer's own page legitimately needs still come through.
 assert.equal(pub.amountCents, 8000);
 assert.equal(pub.binding, true);
});
