import { test } from "node:test";
import assert from "node:assert/strict";
import { shopperOrderView } from "./shopper-orders.ts";

const row = {
 id: "ord_1",
 orderNo: 3,
 itemTitle: "1990s Prada nylon shoulder bag",
 amountCents: 42000,
 currency: "usd",
 status: "paid",
 buyerEmail: "buyer@example.com",
 feeCents: 2800,
 costCents: 11000,
 shippingPaidCents: 1200,
 createdAt: new Date("2026-08-01T10:00:00Z"),
 trackingNumber: "1Z999",
 trackingUrl: "https://track.example/1Z999",
};

test("a shopper sees her own order the way she'd describe it", () => {
 const [v] = shopperOrderView([row]);
 assert.equal(v.title, "1990s Prada nylon shoulder bag");
 assert.equal(v.total, "$420.00");
 assert.equal(v.status, "Paid");
 assert.equal(v.orderNo, 3);
});

test("the seller's private numbers never leave the server", () => {
 // What VYA charged, what the piece cost the seller, and the buyer's own address on file are the
 // seller's business. A shopper's account panel is a public page — anything here is public.
 const [v] = shopperOrderView([row]);
 const keys = Object.keys(v);
 for (const secret of ["feeCents", "costCents", "buyerEmail"]) {
  assert.ok(!keys.includes(secret), `${secret} must not be sent to the browser`);
 }
 assert.doesNotMatch(JSON.stringify(v), /11000|2800|buyer@example\.com/);
});

test("tracking is shown once there is something to track", () => {
 const [with_] = shopperOrderView([{ ...row, status: "shipped" }]);
 assert.equal(with_.tracking?.number, "1Z999");
 const [without] = shopperOrderView([{ ...row, trackingNumber: null, trackingUrl: null }]);
 assert.equal(without.tracking, null);
});

test("statuses are written for a shopper, not for the database", () => {
 const say = (s: string) => shopperOrderView([{ ...row, status: s }])[0].status;
 assert.equal(say("paid"), "Paid");
 assert.equal(say("shipped"), "On its way");
 assert.equal(say("delivered"), "Delivered");
 assert.equal(say("refunded"), "Refunded");
 assert.equal(say("return_requested"), "Return requested");
 // An unknown status must read as something, never as a blank or a raw enum.
 assert.equal(say("some_new_state"), "Some new state");
});

test("a missing item title still reads as a line, not an empty row", () => {
 const [v] = shopperOrderView([{ ...row, itemTitle: null }]);
 assert.equal(v.title, "Item no longer listed");
});

test("currency is respected, not assumed to be dollars", () => {
 assert.equal(shopperOrderView([{ ...row, currency: "gbp" }])[0].total, "£420.00");
 assert.equal(shopperOrderView([{ ...row, currency: "eur" }])[0].total, "€420.00");
});


