import { test } from "node:test";
import assert from "node:assert/strict";
import { overridePct } from "./price-suggestions-db.ts";

// Override drift is the first signal that comes out of closing the loop: if sellers in a category
// consistently price ABOVE our suggestion, we are pricing that category low.
test("overridePct is positive when the seller prices above our suggestion", () => {
 assert.equal(overridePct(20000, 26000), 30, "seller published $260 on a $200 suggestion");
});

test("overridePct is negative when the seller prices below our suggestion", () => {
 assert.equal(overridePct(20000, 15000), -25);
});

test("overridePct is null when either side is missing or zero", () => {
 assert.equal(overridePct(0, 26000), null);
 assert.equal(overridePct(20000, 0), null);
});
