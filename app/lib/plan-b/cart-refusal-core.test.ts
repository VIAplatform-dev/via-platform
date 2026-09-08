import { test } from "node:test";
import assert from "node:assert/strict";
import { hostedCartRefusal, SELLABLE_STATUSES } from "./cart-refusal-core.ts";

// The seller's own Add-to-cart button, driving VYA's bag, used to say "has sold" for every piece it
// refused — including one the seller was keeping back for a named customer. A hold is not a sale.

test("a held piece is refused as on hold, never as sold", () => {
 assert.equal(hostedCartRefusal({ title: "Silk skirt", status: "reserved", unavailableReason: null }), "Silk skirt is on hold.");
});

test("a sold piece says what the shelf says: sold out, or no longer available when that is all we know", () => {
 assert.equal(hostedCartRefusal({ title: "Coat", status: "sold", unavailableReason: "sold_out" }), "Coat is sold out.");
 assert.equal(hostedCartRefusal({ title: "Coat", status: "sold", unavailableReason: null }), "Coat is sold out.");
 assert.equal(hostedCartRefusal({ title: "Coat", status: "sold", unavailableReason: "vanished" }), "Coat is no longer available.");
});

test("a live or native draft piece goes in; a removed one is no longer available", () => {
 assert.equal(hostedCartRefusal({ title: "Coat", status: "active" }), null);
 assert.equal(hostedCartRefusal({ title: "Coat", status: "draft" }), null);
 assert.equal(hostedCartRefusal({ title: "Coat", status: "removed" }), "Coat is no longer available.");
 assert.deepEqual([...SELLABLE_STATUSES], ["active", "draft"]);
});
