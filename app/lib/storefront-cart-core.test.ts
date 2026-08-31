import { test } from "node:test";
import assert from "node:assert/strict";
import { bagStoreSlug, emptyBagMessage } from "./storefront-cart-core.ts";

test("an empty bag is called empty", () => {
 assert.equal(emptyBagMessage(0), "Your bag is empty.");
 assert.equal(emptyBagMessage(0, ["Gucci Nylon Loop Shoulder Bag"]), "Your bag is empty.");
});

test("a bag whose piece SOLD says so — not 'your bag is empty'", () => {
 // The bug this fixes: the shopper remembers adding it, the page says the bag is empty, and the one
 // fact that explains it (someone else bought it) is the fact we were sitting on.
 const m = emptyBagMessage(1, ["Gucci Nylon Loop Shoulder Bag"]);
 assert.match(m, /Gucci Nylon Loop Shoulder Bag/);
 assert.match(m, /sold/);
 assert.ok(!m.includes("bag is empty"));
});

test("several gone at once reads naturally", () => {
 const m = emptyBagMessage(2, ["A Coat", "A Bag"]);
 assert.match(m, /pieces in your bag sold/);
});

test("pieces gone without names still explain themselves", () => {
 const m = emptyBagMessage(2, []);
 assert.match(m, /no longer available/);
 assert.ok(!m.includes("bag is empty"));
});

test("a hosted storefront's own host decides whose bag it is", () => {
 assert.equal(bagStoreSlug("love-again-vintage", null), "love-again-vintage");
});

test("the host wins over any ?store= on the request", () => {
 // The seller's own JavaScript runs on their domain. If a query parameter could override the host,
 // one store's page could read (and check out) a shopper's bag at another store.
 assert.equal(bagStoreSlug("love-again-vintage", "montrose-edit"), "love-again-vintage");
});

test("VYA's own domain has no host to read, so the page says which store it is showing", () => {
 assert.equal(bagStoreSlug(null, "montrose-edit"), "montrose-edit");
 assert.equal(bagStoreSlug(null, "MONTROSE-EDIT"), "montrose-edit");
});

test("an unusable ?store= is ignored rather than trusted", () => {
 assert.equal(bagStoreSlug(null, "../../etc/passwd"), null);
 assert.equal(bagStoreSlug(null, "a slug with spaces"), null);
 assert.equal(bagStoreSlug(null, ""), null);
 assert.equal(bagStoreSlug(null, null), null);
});

test("knowing nothing means the whole bag — exactly the behaviour before bags were per-store", () => {
 assert.equal(bagStoreSlug(null, undefined), null);
});
