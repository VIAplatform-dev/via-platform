import { test } from "node:test";
import assert from "node:assert/strict";
import { groupIntoParcels, parcelsToPost, parcelsToCollect, parcelStatus, parcelsToPostLabel } from "./parcels.ts";

// Mirror of app/lib/parcels-core.ts — the same cases, so the phone and the web count the same bags.

const o = (id: string, p: Partial<{ status: string; paymentIntent: string | null; buyerEmail: string | null; paidAt: string | null; deliveryMethod: "ship" | "pickup"; amountCents: number; trackingNumber: string | null; labelUrl: string | null }> = {}) => ({
  id, status: p.status ?? "paid", paymentIntent: p.paymentIntent === undefined ? `pi_${id}` : p.paymentIntent, buyerEmail: p.buyerEmail ?? "ana@example.com",
  paidAt: p.paidAt ?? "2026-09-07T10:00:00.000Z", deliveryMethod: p.deliveryMethod ?? "ship", itemTitle: `Piece ${id}`, amountCents: p.amountCents ?? 1000,
  currency: "GBP", orderNo: 1, trackingNumber: p.trackingNumber ?? null, labelUrl: p.labelUrl ?? null,
});

test("orders on one payment are one parcel, in arrival order", () => {
  const parcels = groupIntoParcels([o("a", { paymentIntent: "pi_1" }), o("b", { paymentIntent: "pi_1" }), o("c", { paymentIntent: "pi_2" }), o("d", { paymentIntent: "pi_1" })]);
  assert.deepEqual(parcels.map((p) => p.orders.map((x) => x.id)), [["a", "b", "d"], ["c"]]);
  assert.equal(parcels[0].pieces, 3);
  assert.equal(parcels[0].amountCents, 3000);
});

test("no payment id: same buyer, same way home, within two minutes", () => {
  const parcels = groupIntoParcels([
    o("a", { paymentIntent: null, paidAt: "2026-09-07T10:00:00Z" }),
    o("b", { paymentIntent: null, paidAt: "2026-09-07T10:01:30Z" }),
    o("c", { paymentIntent: null, paidAt: "2026-09-07T10:05:00Z" }),
    o("d", { paymentIntent: null, paidAt: "2026-09-07T10:00:30Z", deliveryMethod: "pickup" }),
  ]);
  assert.deepEqual(parcels.map((p) => p.orders.map((x) => x.id)), [["a", "b"], ["c"], ["d"]]);
});

test("status is the least-advanced piece; refunded pieces leave the bag", () => {
  assert.equal(parcelStatus([o("a", { status: "shipped" }), o("b", { status: "paid" })]), "paid");
  assert.equal(parcelStatus([o("a", { status: "refunded" }), o("b", { status: "delivered" })]), "delivered");
  const parcels = groupIntoParcels([o("a", { paymentIntent: "pi_1", status: "refunded" }), o("b", { paymentIntent: "pi_1" })]);
  assert.equal(parcels[0].pieces, 1);
});

test("to post counts bags by post; the Home line says parcels", () => {
  const parcels = groupIntoParcels([o("a", { paymentIntent: "pi_1" }), o("b", { paymentIntent: "pi_1" }), o("c", { paymentIntent: "pi_2" }), o("d", { paymentIntent: "pi_3", deliveryMethod: "pickup" }), o("e", { paymentIntent: "pi_4", status: "shipped" })]);
  assert.equal(parcelsToPost(parcels).length, 2);
  assert.equal(parcelsToPostLabel(0), "Nothing to post");
  assert.equal(parcelsToPostLabel(1), "1 parcel to post");
  assert.equal(parcelsToPostLabel(3), "3 parcels to post");
});

test("a parcel carries whichever piece's label and tracking", () => {
  const parcels = groupIntoParcels([o("a", { paymentIntent: "pi_1" }), o("b", { paymentIntent: "pi_1", trackingNumber: "TRK", labelUrl: "https://l" })]);
  assert.equal(parcels[0].trackingNumber, "TRK");
  assert.equal(parcels[0].labelUrl, "https://l");
});

test("collections are the paid pickups — the bags waiting at the counter, not in the post", () => {
  const parcels = groupIntoParcels([o("a", { paymentIntent: "pi_1" }), o("d", { paymentIntent: "pi_3", deliveryMethod: "pickup" }), o("f", { paymentIntent: "pi_5", deliveryMethod: "pickup", status: "fulfilled" })]);
  assert.deepEqual(parcelsToCollect(parcels).map((p) => p.orders[0].id), ["d"]);
});
