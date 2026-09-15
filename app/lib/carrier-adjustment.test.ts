import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCarrierAdjustment, looksLikeAdjustment, adjustedTotalCents } from "./carrier-adjustment.ts";

test("an EasyPost shipment invoice is read, whichever shape it uses", () => {
 // The two event names are documented; the ShipmentInvoice body is not, so every plausible spelling
 // of the amount is accepted rather than one being guessed at.
 const stated = parseCarrierAdjustment({
  description: "shipment.invoice.updated",
  result: { shipment_id: "shp_123", adjustment_amount: "4.20", adjustment_reason: "Weight correction" },
 });
 assert.equal(stated?.provider, "easypost");
 assert.equal(stated?.shipmentId, "shp_123");
 assert.equal(stated?.adjustmentCents, 420);
 assert.equal(stated?.reason, "Weight correction");

 // Only a final total, no stated delta.
 const total = parseCarrierAdjustment({ description: "shipment.invoice.created", result: { shipment_id: "shp_9", final_amount: 31.07 } });
 assert.equal(total?.finalCents, 3107);
 assert.equal(total?.adjustmentCents, null);
});

test("a Shippo transaction update is read as a restated total", () => {
 // Shippo has no adjustment event at all: transaction_created, transaction_updated, track_updated,
 // batch_created, batch_purchased. A re-rate can only arrive as a changed amount.
 const a = parseCarrierAdjustment({ event: "transaction_updated", data: { object_id: "tx_77", amount: "18.95" } });
 assert.equal(a?.provider, "shippo");
 assert.equal(a?.shipmentId, "tx_77");
 assert.equal(a?.finalCents, 1895);
 assert.equal(a?.adjustmentCents, null);
});

test("the shape Shippo actually sends: the cost hangs off rate, not the top level", () => {
 // Taken from shippo.ts buyLabel, which reads tx.rate.amount as the label cost. A transaction has
 // no top-level `amount` of its own, so a parser that only looked there would read every re-rate
 // as unreadable and quietly bill nobody.
 const a = parseCarrierAdjustment({
  event: "transaction_updated",
  data: { object_id: "tx_abc", status: "SUCCESS", rate: { amount: "24.60", currency: "USD" } },
 });
 assert.equal(a?.provider, "shippo");
 assert.equal(a?.shipmentId, "tx_abc");
 assert.equal(a?.finalCents, 2460);

 // Shippo posts the object bare on some subscriptions, with no event wrapper at all.
 const bare = parseCarrierAdjustment({ object_id: "tx_bare", rate: { amount: "9.00" } });
 assert.equal(bare?.finalCents, 900);
});

test("a tracking update is not an adjustment", () => {
 // The ordinary case. Most of what a carrier sends is tracking, and null is the right answer.
 assert.equal(parseCarrierAdjustment({ event: "track_updated", data: { tracking_number: "1Z" } }), null);
 assert.equal(looksLikeAdjustment({ event: "track_updated" }), false);
 for (const junk of [null, undefined, "", 42, [], {}]) assert.equal(parseCarrierAdjustment(junk), null, JSON.stringify(junk));
});

test("an adjustment we cannot read is still recognisable as one", () => {
 // THE POINT OF THIS PAIR. An unrecognised ShipmentInvoice must be logged loudly, not dropped
 // silently: it decides whether a seller gets billed, and the shape is undocumented.
 const weird = { description: "shipment.invoice.updated", result: { shipment_id: "shp_1", surprise_field: "4.20" } };
 assert.equal(parseCarrierAdjustment(weird), null);
 assert.equal(looksLikeAdjustment(weird), true);
});

test("only an increase becomes a debt", () => {
 const stated = { provider: "easypost" as const, shipmentId: "s", finalCents: null, adjustmentCents: 420, reason: null };
 assert.equal(adjustedTotalCents(stated, 1000), 1420);

 // Carriers issue CREDITS too, and a refund is not something to bill a seller for.
 const credit = { ...stated, adjustmentCents: -300 };
 assert.equal(adjustedTotalCents(credit, 1000), null);

 // A restated total below what we already paid is a credit by another name.
 const lower = { provider: "shippo" as const, shipmentId: "s", finalCents: 800, adjustmentCents: null, reason: null };
 assert.equal(adjustedTotalCents(lower, 1000), null);
 assert.equal(adjustedTotalCents({ ...lower, finalCents: 1900 }, 1000), 1900);

 // And nothing usable writes nothing.
 assert.equal(adjustedTotalCents({ ...lower, finalCents: null }, 1000), null);
});

test("an unknown recorded cost does not turn the whole label into a debt", () => {
 // A stated delta is still a delta. Without a recorded cost it is all we know, and it is correct.
 const stated = { provider: "easypost" as const, shipmentId: "s", finalCents: null, adjustmentCents: 420, reason: null };
 assert.equal(adjustedTotalCents(stated, null), 420);
});
