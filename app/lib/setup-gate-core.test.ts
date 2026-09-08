import { test } from "node:test";
import assert from "node:assert/strict";
import { shipFromGate, publishRefusal, SHIP_FROM_MESSAGE } from "./setup-gate-core.ts";
import { setupSteps, type SetupInput } from "./setup-core.ts";

// Option J on one step: the ship-from address bites on Inventory (drafts can't go live) and on
// Orders (labels can't be bought). The page shows the gate; the publish routes enforce it.

const NONE: SetupInput = { shipFromSet: false, paymentsConnected: false, chargesEnabled: false, shippingConfigured: false, servedZoneCount: 0, liveListings: 0, policySet: false, customDomain: null };

test("no ship-from address: the gate names the consequence and where to fix it", () => {
 const gate = shipFromGate(setupSteps(NONE));
 assert.deepEqual(gate, { message: "Pieces can't go live yet. Add the address you ship from.", href: "/admin/settings/locations", verb: "Add address" });
 assert.equal(gate?.message, SHIP_FROM_MESSAGE);
});

test("with the address set there is no gate; with no steps at all there is no gate either", () => {
 assert.equal(shipFromGate(setupSteps({ ...NONE, shipFromSet: true })), null);
 assert.equal(shipFromGate([]), null);
 assert.equal(shipFromGate(null), null);
 assert.equal(shipFromGate(undefined), null);
});

test("the gate follows the step's own link, so a phone base rewrites it too", () => {
 assert.equal(shipFromGate(setupSteps(NONE, "https://getvya.ai/admin"))?.href, "https://getvya.ai/admin/settings/locations");
});

test("publishing without a ship-from address is refused with a 409 and the same words", () => {
 assert.deepEqual(publishRefusal(false), { status: 409, error: SHIP_FROM_MESSAGE });
 assert.equal(publishRefusal(true), null);
});
