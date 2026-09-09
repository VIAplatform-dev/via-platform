import { test } from "node:test";
import assert from "node:assert/strict";
import { mayReclaimReservation, bagRefusal } from "./bag-reclaim-core.ts";

// The bag re-tries a checkout by releasing the buyer's OWN earlier reservation on each piece.
// It used to release ANY reservation — including "hold:Ana", the seller keeping a piece back
// for a named customer — and then sell the piece to whoever pressed Pay. Only the bag's own
// token may be reclaimed; everything else is someone else's claim on the piece.

test("a bag may reclaim the reservation it made itself", () => {
 assert.equal(mayReclaimReservation("bag-abc", "bag-abc"), true);
});

test("a hold for a named customer is never reclaimed by a bag", () => {
 assert.equal(mayReclaimReservation("hold:Ana", "bag-abc"), false);
 assert.equal(mayReclaimReservation("hold:", "bag-abc"), false);
});

test("another buyer's checkout, an accepted offer, or no reservation row: not ours", () => {
 assert.equal(mayReclaimReservation("bag-xyz", "bag-abc"), false);
 assert.equal(mayReclaimReservation("offer-t0k3n", "bag-abc"), false);
 assert.equal(mayReclaimReservation("checkout", "bag-abc"), false);
 assert.equal(mayReclaimReservation(null, "bag-abc"), false);
});

test("adding to the bag says why a piece cannot be bagged, in the storefront's words", () => {
 assert.equal(bagRefusal("reserved"), "This piece is on hold for someone.");
 assert.equal(bagRefusal("sold"), "This piece has sold.");
 assert.equal(bagRefusal("draft"), "That piece is no longer available.");
 assert.equal(bagRefusal("active"), null);
});
