import { test } from "node:test";
import assert from "node:assert/strict";
import { groupIntoParcels, parcelStatus, parcelsToPost, parcelKey, shouldSendParcelEmail, parcelsToPostLabel } from "./parcels-core.ts";

const o = (id: string, p: Partial<{ status: string; paymentIntent: string | null; buyerEmail: string | null; paidAt: string | null; deliveryMethod: "ship" | "pickup"; itemTitle: string; amountCents: number; trackingNumber: string | null; trackingEmailSentAt: string | null; labelUrl: string | null }> = {}) => ({
 id, status: p.status ?? "paid", paymentIntent: p.paymentIntent === undefined ? `pi_${id}` : p.paymentIntent, buyerEmail: p.buyerEmail ?? "ana@example.com",
 paidAt: p.paidAt ?? "2026-09-07T10:00:00.000Z", deliveryMethod: p.deliveryMethod ?? "ship", itemTitle: p.itemTitle ?? `Piece ${id}`, amountCents: p.amountCents ?? 1000,
 currency: "GBP", trackingNumber: p.trackingNumber ?? null, trackingEmailSentAt: p.trackingEmailSentAt ?? null, labelUrl: p.labelUrl ?? null,
});

test("orders paid on one PaymentIntent are one parcel, in the order they arrived", () => {
 const parcels = groupIntoParcels([o("a", { paymentIntent: "pi_1" }), o("b", { paymentIntent: "pi_1" }), o("c", { paymentIntent: "pi_2" }), o("d", { paymentIntent: "pi_1" })]);
 assert.equal(parcels.length, 2);
 assert.deepEqual(parcels[0].orders.map((x) => x.id), ["a", "b", "d"]);
 assert.equal(parcels[0].pieces, 3);
 assert.equal(parcels[0].amountCents, 3000);
 assert.deepEqual(parcels[1].orders.map((x) => x.id), ["c"]);
});

test("without a payment id, the same buyer paying within two minutes for the same delivery is one parcel", () => {
 const parcels = groupIntoParcels([
  o("a", { paymentIntent: null, paidAt: "2026-09-07T10:00:00Z" }),
  o("b", { paymentIntent: null, paidAt: "2026-09-07T10:01:30Z" }),
  o("c", { paymentIntent: null, paidAt: "2026-09-07T10:05:00Z" }),
  o("d", { paymentIntent: null, paidAt: "2026-09-07T10:00:30Z", deliveryMethod: "pickup" }),
  o("e", { paymentIntent: null, paidAt: "2026-09-07T10:00:40Z", buyerEmail: "bo@example.com" }),
 ]);
 assert.deepEqual(parcels.map((p) => p.orders.map((x) => x.id)), [["a", "b"], ["c"], ["d"], ["e"]]);
});

test("a parcel's status is its least-advanced piece; a refunded piece drops out of the parcel", () => {
 assert.equal(parcelStatus([o("a", { status: "shipped" }), o("b", { status: "paid" })]), "paid");
 assert.equal(parcelStatus([o("a", { status: "shipped" }), o("b", { status: "delivered" })]), "shipped");
 assert.equal(parcelStatus([o("a", { status: "refunded" }), o("b", { status: "delivered" })]), "delivered");
 assert.equal(parcelStatus([o("a", { status: "refunded" })]), "refunded");
 const parcels = groupIntoParcels([o("a", { paymentIntent: "pi_1", status: "refunded" }), o("b", { paymentIntent: "pi_1" })]);
 assert.equal(parcels.length, 1);
 assert.equal(parcels[0].pieces, 1);
 assert.equal(parcels[0].status, "paid");
});

test("'to post' counts parcels going by post, not pieces and not collections", () => {
 const parcels = groupIntoParcels([
  o("a", { paymentIntent: "pi_1" }), o("b", { paymentIntent: "pi_1" }), o("c", { paymentIntent: "pi_1" }),
  o("d", { paymentIntent: "pi_2" }),
  o("e", { paymentIntent: "pi_3", deliveryMethod: "pickup" }),
  o("f", { paymentIntent: "pi_4", status: "shipped" }),
 ]);
 assert.equal(parcelsToPost(parcels).length, 2);
 assert.equal(parcelsToPostLabel(0), "Nothing to ship");
 assert.equal(parcelsToPostLabel(1), "1 package to ship");
 assert.equal(parcelsToPostLabel(2), "2 packages to ship");
});

test("a parcel carries the tracking and label of whichever piece has them", () => {
 const parcels = groupIntoParcels([o("a", { paymentIntent: "pi_1", trackingNumber: "TRK1", labelUrl: "https://l/1.pdf" }), o("b", { paymentIntent: "pi_1" })]);
 assert.equal(parcels[0].trackingNumber, "TRK1");
 assert.equal(parcels[0].labelUrl, "https://l/1.pdf");
 assert.equal(parcels[0].key, parcelKey(parcels[0].orders[0]));
});

test("one tracking email per parcel: not once any piece of it has been told", () => {
 assert.equal(shouldSendParcelEmail([o("a", { trackingNumber: "TRK1" }), o("b")]), true);
 assert.equal(shouldSendParcelEmail([o("a", { trackingNumber: "TRK1", trackingEmailSentAt: "2026-09-07T11:00:00Z" }), o("b")]), false);
 assert.equal(shouldSendParcelEmail([o("a"), o("b", { trackingEmailSentAt: "2026-09-07T11:00:00Z" })]), false);
 // Nothing to track → nothing to send.
 assert.equal(shouldSendParcelEmail([o("a"), o("b")]), false);
});
