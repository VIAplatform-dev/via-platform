import { test } from "node:test";
import assert from "node:assert/strict";
import { unavailableLabel, reasonFromImport, reasonForVanished, storefrontAvailability, type UnavailableReason } from "./unavailable-label.ts";

test("a piece the seller's own platform reported sold out says so", () => {
 assert.equal(unavailableLabel("sold_out"), "Sold out");
});

test("a piece that merely disappeared does not claim to have sold", () => {
 // We cannot tell a sale from a deletion or an unpublish — the seller's site says only that it is
 // gone. blummier's nine were all dead links on her own store. Saying "Sold" asserts a sale we have
 // no evidence for.
 assert.equal(unavailableLabel("vanished"), "No longer available");
});

test("an unlabelled piece keeps the old wording rather than inventing a new claim", () => {
 // Rows written before the reason was recorded. "Sold out" is what they have always said; changing
 // it on no evidence would be the same mistake in the other direction.
 assert.equal(unavailableLabel(null), "Sold out");
 assert.equal(unavailableLabel(undefined), "Sold out");
});

test("an unrecognised reason is treated as unlabelled, never rendered raw", () => {
 assert.equal(unavailableLabel("something_new" as UnavailableReason), "Sold out");
});

test("the importer records what the platform actually said", () => {
 // available === false is the platform's own statement; anything else is not a claim about stock.
 assert.equal(reasonFromImport(false), "sold_out");
 assert.equal(reasonFromImport(true), null);
 assert.equal(reasonFromImport(undefined), null);
});

test("the sweep records that it inferred, not that it was told", () => {
 assert.equal(reasonForVanished(), "vanished");
});

test("a held piece stays on the shelf, unbuyable, badged On hold — never Sold", () => {
 assert.equal(unavailableLabel("on_hold"), "On hold");
 assert.deepEqual(storefrontAvailability({ status: "reserved", unavailableReason: null }), { available: false, unavailableReason: "on_hold" });
 // A reserved row never carries a recorded reason; even if one leaked in, the hold wins.
 assert.deepEqual(storefrontAvailability({ status: "reserved", unavailableReason: "vanished" }), { available: false, unavailableReason: "on_hold" });
});

test("a sold piece keeps whatever reason was recorded; a live one is simply available", () => {
 assert.deepEqual(storefrontAvailability({ status: "sold", unavailableReason: "vanished" }), { available: false, unavailableReason: "vanished" });
 assert.deepEqual(storefrontAvailability({ status: "sold" }), { available: false, unavailableReason: null });
 assert.deepEqual(storefrontAvailability({ status: "active", unavailableReason: "sold_out" }), { available: true, unavailableReason: null });
});
