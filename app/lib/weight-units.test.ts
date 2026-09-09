import { test } from "node:test";
import assert from "node:assert/strict";
import { toOz, fromOz, weightUnitFor } from "./weight-units.ts";

test("a US store weighs in ounces, everyone else in grams", () => {
 assert.equal(weightUnitFor({ country: "US" }), "oz");
 assert.equal(weightUnitFor({ country: "GB" }), "g");
 assert.equal(weightUnitFor({ country: "FR" }), "g");
});

test("currency decides it before the country is known", () => {
 assert.equal(weightUnitFor({ currency: "USD" }), "oz");
 assert.equal(weightUnitFor({ currency: "GBP" }), "g");
 assert.equal(weightUnitFor({}), "g");
});

test("ounces pass through untouched", () => {
 assert.equal(toOz(40, "oz"), 40);
 assert.equal(fromOz(40, "oz"), 40);
});

test("a kilo coat is about 35 ounces, and survives the round trip", () => {
 assert.equal(toOz(1000, "g"), 35);
 assert.ok(Math.abs(fromOz(35, "g") - 1000) < 20, "back to roughly a kilo");
});

test("a real garment converts to the weight the tiers expect", () => {
 // 500g blouse → ~18oz, which the shipping ladder should read as Medium, not Small.
 const oz = toOz(500, "g");
 assert.ok(oz > 16 && oz < 20, `got ${oz}`);
});

test("a tiny weight never rounds away to nothing", () => {
 // 10 grams is a pair of earrings. Rounding it to 0 would make the parcel weightless.
 assert.ok(toOz(10, "g") >= 1);
});

test("nothing typed is nothing, not a guess", () => {
 for (const bad of [0, -5, null, undefined, "", "abc"]) {
  assert.equal(toOz(bad as number, "g"), 0);
  assert.equal(fromOz(bad as number, "g"), 0);
 }
});
