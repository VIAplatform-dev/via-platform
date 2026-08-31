import { test } from "node:test";
import assert from "node:assert/strict";
import { pickupOffered, deliveryChoice, type PickupSettings } from "./pickup-core.ts";

const OPEN: PickupSettings = {
 enabled: true,
 address: { street1: "1234 Wisconsin Ave NW", city: "Washington", state: "DC", zip: "20007", country: "US" },
 instructions: "Wed–Sun, 11am–6pm. Ask for Scottie.",
};

test("a store that has set up pickup offers it", () => {
 assert.equal(pickupOffered(OPEN), true);
});

test("a store that has not turned it on does not offer it", () => {
 assert.equal(pickupOffered({ ...OPEN, enabled: false }), false);
 assert.equal(pickupOffered(null), false);
});

test("pickup with no address is not offered — a shopper cannot collect from nowhere", () => {
 // The likeliest way this breaks in practice: the toggle is on and the address was never filled in.
 assert.equal(pickupOffered({ ...OPEN, address: null }), false);
 assert.equal(pickupOffered({ ...OPEN, address: { city: "Washington" } }), false, "a partial address is not an address");
});

test("choosing pickup means no delivery address and nothing to pay for postage", () => {
 const c = deliveryChoice("pickup", { shippingCents: 1200, pickup: OPEN });
 assert.equal(c.method, "pickup");
 assert.equal(c.shippingCents, 0);
 assert.equal(c.needsAddress, false);
});

test("choosing delivery keeps the address and the postage", () => {
 const c = deliveryChoice("ship", { shippingCents: 1200, pickup: OPEN });
 assert.equal(c.method, "ship");
 assert.equal(c.shippingCents, 1200);
 assert.equal(c.needsAddress, true);
});

test("pickup cannot be chosen at a store that does not offer it", () => {
 // Never trust the choice the browser sends: a shopper who edits the request must not skip postage.
 const c = deliveryChoice("pickup", { shippingCents: 1200, pickup: null });
 assert.equal(c.method, "ship");
 assert.equal(c.shippingCents, 1200);
 assert.equal(c.needsAddress, true);
});

test("no choice made falls back to delivery", () => {
 assert.equal(deliveryChoice(undefined, { shippingCents: 800, pickup: OPEN }).method, "ship");
});

test("the collection address is passed on, so the shopper is told where to go", () => {
 const c = deliveryChoice("pickup", { shippingCents: 1200, pickup: OPEN });
 assert.match(c.collectFrom ?? "", /1234 Wisconsin Ave NW/);
 assert.match(c.collectFrom ?? "", /Washington/);
 assert.equal(c.instructions, "Wed–Sun, 11am–6pm. Ask for Scottie.");
});

test("a delivery order carries no collection details", () => {
 const c = deliveryChoice("ship", { shippingCents: 0, pickup: OPEN });
 assert.equal(c.collectFrom, null);
 assert.equal(c.instructions, null);
});
