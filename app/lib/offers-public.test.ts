import { test } from "node:test";
import assert from "node:assert/strict";
import { publicOffer, type Offer } from "./offers-db.ts";

// publicOffer is a security boundary: /api/storefront/offer/[token] is reachable by anyone
// holding the emailed token, so whatever this returns is effectively published. These pin the
// allowlist — widen it and the test fails loudly instead of the leak shipping quietly.

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
