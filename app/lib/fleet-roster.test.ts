import { test } from "node:test";
import assert from "node:assert/strict";
import { fleetStores, EXCLUDED_STORES } from "./fleet-roster.ts";

test("the duplicate test copies are not part of the fleet", () => {
 // test-import is the-objects-of-affection and test-import-2 is bag-crush — the same two shops
 // imported twice. Checking both doubles the run, and every finding on a copy is counted again in
 // the census as though it were another seller's store.
 const all = ["bag-crush", "blummier", "test-import", "test-import-2", "the-objects-of-affection"];
 assert.deepEqual(fleetStores(all), ["bag-crush", "blummier", "the-objects-of-affection"]);
});

test("the real store is kept, never the copy", () => {
 // Deliberate: test-import PASSES while the-objects-of-affection fails on the one finding that
 // matters. Keeping the copy because it grades better would be hiding the problem.
 assert.ok(!EXCLUDED_STORES.has("the-objects-of-affection"));
 assert.ok(!EXCLUDED_STORES.has("bag-crush"));
 assert.ok(EXCLUDED_STORES.has("test-import"));
 assert.ok(EXCLUDED_STORES.has("test-import-2"));
});

test("every exclusion says why, so nobody has to guess later", () => {
 for (const [slug, why] of Object.entries(Object.fromEntries(EXCLUDED_STORES.entries?.() ?? []))) {
  assert.ok(typeof why === "string" && why.length > 10, slug);
 }
});

test("a store not on the list is always included", () => {
 assert.deepEqual(fleetStores(["some-new-store"]), ["some-new-store"]);
});

test("order is preserved", () => {
 assert.deepEqual(fleetStores(["c", "a", "b"]), ["c", "a", "b"]);
});
