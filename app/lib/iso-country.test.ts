import { test } from "node:test";
import assert from "node:assert/strict";
import { isoCountry } from "./ship-from-core.ts";

test("the spelled-out names two live stores actually had saved", () => {
 // These were real values in store_shipping — and they made every rate lookup come back empty.
 assert.equal(isoCountry("United States"), "US");
 assert.equal(isoCountry("United Kingdom"), "GB");
});

test("a code that's already a code is left alone", () => {
 assert.equal(isoCountry("US"), "US");
 assert.equal(isoCountry("gb"), "GB");
});

test("the ways people write their own country", () => {
 for (const s of ["USA", "usa", "  united states  ", "America", "U.S.A."]) assert.equal(isoCountry(s), "US", s);
 for (const s of ["UK", "England", "Great Britain"]) assert.equal(isoCountry(s), "GB", s);
});

test("nothing saved falls back to the home market, as it always did", () => {
 assert.equal(isoCountry(""), "US");
 assert.equal(isoCountry(null), "US");
 assert.equal(isoCountry(undefined), "US");
});

test("something unrecognised is passed on, not swallowed", () => {
 // A wrong code the carrier rejects by name beats an empty one nobody can trace.
 assert.equal(isoCountry("Wakanda"), "WAKANDA");
});
