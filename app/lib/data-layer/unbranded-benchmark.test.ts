import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBrand } from "./unbranded-benchmark-db.ts";

test("classifyBrand separates unbranded / lesser-known / known", () => {
 // explicit no-brand markers → unbranded
 assert.equal(classifyBrand(null), "unbranded");
 assert.equal(classifyBrand(""), "unbranded");
 assert.equal(classifyBrand("Unbranded"), "unbranded");
 assert.equal(classifyBrand("No Brand"), "unbranded");
 assert.equal(classifyBrand("Vintage"), "unbranded");
 // a curated well-known designer → known (excluded from the golden set)
 assert.equal(classifyBrand("Gucci"), "known");
 assert.equal(classifyBrand("Chanel"), "known");
 // a real but non-canonical name → lesser-known (part of the golden set)
 assert.equal(classifyBrand("Aurora Vintage Label"), "lesser-known");
 assert.equal(classifyBrand("Some Etsy Maker"), "lesser-known");
});
