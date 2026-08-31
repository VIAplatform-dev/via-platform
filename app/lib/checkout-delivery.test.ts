import { test } from "node:test";
import assert from "node:assert/strict";
import {
 resolveDelivery,
 chargedTotalCents,
 deliveryMetadata,
 deliveryFromMetadata,
 type ShipPolicy,
} from "./checkout-delivery.ts";
import type { PickupSettings } from "./pickup-core.ts";

const OPEN: PickupSettings = {
 enabled: true,
 address: { street1: "1234 Wisconsin Ave NW", city: "Washington", state: "DC", zip: "20007", country: "US" },
 instructions: "Wed–Sun, 11am–6pm. Ask for Scottie.",
};

/** A store that charges the buyer postage and offers collection. */
const BUYER_PAYS: ShipPolicy = { mode: "buyer_pays", freeThresholdCents: null, pickup: OPEN };
/** The same store with nowhere to collect from. */
const NO_ADDRESS: ShipPolicy = { mode: "buyer_pays", freeThresholdCents: null, pickup: { enabled: true, address: null, instructions: "Come by!" } };
/** A store that does not do collection at all. */
const SHIP_ONLY: ShipPolicy = { mode: "buyer_pays", freeThresholdCents: null, pickup: null };

const BAG = { subtotalCents: 9000, parcelShipCents: 1200 };

test("a store with a collection address offers it, and collecting costs no postage", () => {
 const d = resolveDelivery({ claimed: "pickup", ...BAG, settings: BUYER_PAYS });
 assert.equal(d.pickupAvailable, true);
 assert.equal(d.method, "pickup");
 assert.equal(d.shippingCents, 0);
 assert.equal(d.needsAddress, false);
 assert.match(d.collectFrom ?? "", /1234 Wisconsin Ave NW/);
 assert.equal(d.instructions, "Wed–Sun, 11am–6pm. Ask for Scottie.");
});

test("delivery at the same store still costs the flat parcel rate", () => {
 const d = resolveDelivery({ claimed: "ship", ...BAG, settings: BUYER_PAYS });
 assert.equal(d.method, "ship");
 assert.equal(d.shippingCents, 1200);
 assert.equal(d.needsAddress, true);
 assert.equal(d.collectFrom, null);
});

// ── The one that matters: the price is decided here, never by the browser ──────────────────

test("a forged pickup at a store that does not offer it falls back to delivery WITH the postage", () => {
 const d = resolveDelivery({ claimed: "pickup", ...BAG, settings: SHIP_ONLY });
 assert.equal(d.method, "ship");
 assert.equal(d.shippingCents, 1200, "the shopper must not be able to delete the shipping charge");
 assert.equal(d.needsAddress, true);
 assert.equal(d.pickupAvailable, false);
});

test("pickup toggled on with no address is not an offer — the postage stands", () => {
 const d = resolveDelivery({ claimed: "pickup", ...BAG, settings: NO_ADDRESS });
 assert.equal(d.pickupAvailable, false, "a toggle with nowhere to collect from is not an offer");
 assert.equal(d.method, "ship");
 assert.equal(d.shippingCents, 1200);
});

test("the postage is re-derived from the store's own policy, never read off the request", () => {
 // Anything the browser might smuggle in is simply not an input to this function.
 const forged = { claimed: "pickup", shippingCents: 0, shippingCostCents: 0, free: true } as unknown as { claimed: string };
 const d = resolveDelivery({ claimed: forged.claimed, ...BAG, settings: SHIP_ONLY });
 assert.equal(d.shippingCents, 1200);
 // And an unrecognised method is delivery, not a free ride.
 assert.equal(resolveDelivery({ claimed: "collect-somehow", ...BAG, settings: BUYER_PAYS }).method, "ship");
 assert.equal(resolveDelivery({ claimed: undefined, ...BAG, settings: BUYER_PAYS }).shippingCents, 1200);
});

test("a seller who switches collection off mid-cart gets the postage back on the next quote", () => {
 // The shopper chose collection a minute ago; the seller has since turned it off. Nothing is
 // remembered from the earlier quote — the charge is re-derived from the settings as they are NOW.
 const before = resolveDelivery({ claimed: "pickup", ...BAG, settings: BUYER_PAYS });
 assert.equal(before.shippingCents, 0);
 const off: ShipPolicy = { ...BUYER_PAYS, pickup: { ...OPEN, enabled: false } };
 const after = resolveDelivery({ claimed: "pickup", ...BAG, settings: off });
 assert.equal(after.method, "ship");
 assert.equal(after.shippingCents, 1200, "collection is gone, so the postage is owed again");
 assert.equal(after.pickupAvailable, false);
});

// ── Free shipping ─────────────────────────────────────────────────────────────────────────

test("a store that absorbs postage charges nothing either way", () => {
 const s: ShipPolicy = { mode: "store_pays", freeThresholdCents: null, pickup: OPEN };
 const shipped = resolveDelivery({ claimed: "ship", ...BAG, settings: s });
 assert.equal(shipped.shippingCents, 0);
 assert.equal(shipped.freeShipping, true);
 // Collection is still worth offering — it is same-day, and it still says where to go.
 const collected = resolveDelivery({ claimed: "pickup", ...BAG, settings: s });
 assert.equal(collected.method, "pickup");
 assert.equal(collected.shippingCents, 0);
 assert.equal(collected.needsAddress, false);
 assert.match(collected.collectFrom ?? "", /Washington/);
});

test("free over a threshold: charged below it, free at and above it", () => {
 const s: ShipPolicy = { mode: "free_over", freeThresholdCents: 15000, pickup: OPEN };
 assert.equal(resolveDelivery({ claimed: "ship", subtotalCents: 14999, parcelShipCents: 1200, settings: s }).shippingCents, 1200);
 assert.equal(resolveDelivery({ claimed: "ship", subtotalCents: 15000, parcelShipCents: 1200, settings: s }).shippingCents, 0);
 // A free-shipping bag collected in store is still a collection — the seller prints no label.
 const d = resolveDelivery({ claimed: "pickup", subtotalCents: 15000, parcelShipCents: 1200, settings: s });
 assert.equal(d.method, "pickup");
 assert.equal(d.shippingCents, 0);
});

test("a free_over store with no threshold set charges normally", () => {
 const s: ShipPolicy = { mode: "free_over", freeThresholdCents: null, pickup: null };
 assert.equal(resolveDelivery({ claimed: "ship", ...BAG, settings: s }).shippingCents, 1200);
});

// ── What gets recorded, and what a refund gives back ───────────────────────────────────────

test("the order carries the method the SERVER decided, with where to collect", () => {
 const d = resolveDelivery({ claimed: "pickup", ...BAG, settings: BUYER_PAYS });
 const md = deliveryMetadata(d);
 assert.equal(md.delivery, "pickup");
 assert.match(md.collect_from, /1234 Wisconsin Ave NW/);
 const back = deliveryFromMetadata(md);
 assert.equal(back.method, "pickup");
 assert.match(back.collectFrom ?? "", /Washington/);
 assert.equal(back.instructions, "Wed–Sun, 11am–6pm. Ask for Scottie.");
});

test("a delivery order records no collection details", () => {
 const md = deliveryMetadata(resolveDelivery({ claimed: "ship", ...BAG, settings: BUYER_PAYS }));
 assert.equal(md.delivery, "ship");
 assert.equal(md.collect_from, undefined);
 const back = deliveryFromMetadata(md);
 assert.equal(back.method, "ship");
 assert.equal(back.collectFrom, null);
});

test("an order with no delivery stamp at all is a delivery — every order placed before this existed", () => {
 const back = deliveryFromMetadata({});
 assert.equal(back.method, "ship");
 assert.equal(back.collectFrom, null);
});

test("metadata claiming pickup is only read back, never re-authorised — it is our own stamp", () => {
 // Stripe metadata is written by the server after resolveDelivery, so reading it back is safe.
 // What must NOT happen is a *shopper-supplied* field reaching an order: deliveryMetadata is the
 // only way in, and it takes a resolved Delivery, not a string.
 const forged = deliveryFromMetadata({ delivery: "pickup", collect_from: "" });
 assert.equal(forged.method, "pickup");
 assert.equal(forged.collectFrom, null, "an empty address is no address");
});

test("a very long collection address is truncated rather than failing the payment", () => {
 // Stripe refuses a metadata value over 500 chars — and would refuse the whole PaymentIntent with it.
 const long: PickupSettings = { enabled: true, address: { street1: "A".repeat(300), city: "B".repeat(300) }, instructions: "C".repeat(600) };
 const md = deliveryMetadata(resolveDelivery({ claimed: "pickup", ...BAG, settings: { mode: "buyer_pays", freeThresholdCents: null, pickup: long } }));
 assert.ok(md.collect_from.length <= 480, "the address must fit in Stripe metadata");
 assert.ok(md.collect_instructions.length <= 480);
});

test("refunding a collected order gives back the item price and no phantom postage", () => {
 const collected = { amountCents: 9000, shippingPaidCents: 0 };
 assert.equal(chargedTotalCents(collected), 9000);
 // The same piece, posted: the buyer paid postage too, so the refund is larger.
 assert.equal(chargedTotalCents({ amountCents: 9000, shippingPaidCents: 1200 }), 10200);
 assert.equal(chargedTotalCents({ amountCents: 9000, shippingPaidCents: null }), 9000);
});
