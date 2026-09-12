import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOffer } from "./settings-core.ts";

// A piece the seller marks "rent only" (alsoForSale: false) must never be buyable — REGARDLESS of
// whether the store has switched rentals on yet. Found while wiring imported rent-only pieces
// (Venus Vintage): the product page computed `buyable = !rentable || alsoForSale !== false`, so a
// store that hasn't enabled rentals made `rentable` false and `buyable` true no matter what the
// item's own terms said — a rent-only piece with priceCents 0 would show a live $0 Buy button.

test("rentals off, no terms at all — an ordinary piece is buyable", () => {
 assert.deepEqual(resolveOffer(false, null), { rentable: false, buyable: true });
});

test("rentals off, but this item is marked rent-only — NEVER buyable, whatever the store's rentals toggle says", () => {
 assert.deepEqual(resolveOffer(false, { tiersCount: 1, alsoForSale: false }), { rentable: false, buyable: false });
});

test("rentals on, item is rent-only — rentable, not buyable", () => {
 assert.deepEqual(resolveOffer(true, { tiersCount: 1, alsoForSale: false }), { rentable: true, buyable: false });
});

test("rentals on, item rents AND sells — both offered", () => {
 assert.deepEqual(resolveOffer(true, { tiersCount: 1, alsoForSale: true }), { rentable: true, buyable: true });
});

test("rentals on, but this item has no priced tiers — nothing to rent, so it just sells", () => {
 assert.deepEqual(resolveOffer(true, { tiersCount: 0, alsoForSale: false }), { rentable: false, buyable: true });
});

test("terms row exists but alsoForSale is left at its column default (true) — buyable", () => {
 assert.deepEqual(resolveOffer(true, { tiersCount: 2, alsoForSale: true }), { rentable: true, buyable: true });
});
