import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeStorefrontCollectionItems } from "./collections-core.ts";

const src = (id: string) => ({ id, origin: "source" });
const own = (id: string) => ({ id, origin: "user" });

test("a rail synced from the seller's own site shows exactly what they filed there", () => {
 // Their "Dresses" rail holds 3 pieces. 300 more imported pieces happen to be categorised
 // "dresses" — those live in whatever rails the seller actually put them in, not this one.
 const assigned = [src("a"), src("b"), src("c")];
 const matched = [src("a"), src("x"), src("y"), src("z")];
 const out = mergeStorefrontCollectionItems(assigned, matched);
 assert.deepEqual(out.map((i) => i.id), ["a", "b", "c"]);
});

test("a piece the seller adds in the portal still lands in the rail it belongs to", () => {
 // The reason the category match exists: a seller-created listing has no source filing to follow.
 const assigned = [src("a"), src("b")];
 const matched = [own("new-1"), src("x")];
 const out = mergeStorefrontCollectionItems(assigned, matched);
 assert.deepEqual(out.map((i) => i.id), ["a", "b", "new-1"]);
});

test("nothing filed and only imported matches — the collection is empty, not guessed at", () => {
 // This used to fall back to the guess "so the shopper doesn't see an empty page", and it bypassed
 // the imported-pieces rule below to do it. On blummier that served 28 Gucci-branded pieces under a
 // collection she had filed nothing into, and did the same for 25 others. An imported piece already
 // carries her filing; if her filing says this collection is empty, ours says the same. The caller
 // then reads the captured page to see what really belonged there (see chooseCollectionItems).
 const out = mergeStorefrontCollectionItems([], [src("x"), src("y")]);
 assert.deepEqual(out.map((i) => i.id), []);
});

test("nothing filed, but the seller's own portal listings still land in the rail they belong to", () => {
 // The reason the guess exists at all, and the only case it was ever right for.
 const out = mergeStorefrontCollectionItems([], [src("imported"), own("added-in-portal")]);
 assert.deepEqual(out.map((i) => i.id), ["added-in-portal"]);
});

test("a piece is never listed twice", () => {
 const assigned = [src("a"), own("b")];
 const matched = [own("b"), own("c")];
 const out = mergeStorefrontCollectionItems(assigned, matched);
 assert.deepEqual(out.map((i) => i.id), ["a", "b", "c"]);
});

test("the seller's own order is preserved — assigned first, in their order", () => {
 const assigned = [src("c"), src("a"), src("b")];
 const out = mergeStorefrontCollectionItems(assigned, [own("z")]);
 assert.deepEqual(out.map((i) => i.id), ["c", "a", "b", "z"]);
});

test("an item with no origin recorded is treated as the seller's own, not the source's", () => {
 // Older rows predate the column's default; dropping them would hide real listings.
 const out = mergeStorefrontCollectionItems([src("a")], [{ id: "legacy" }]);
 assert.deepEqual(out.map((i) => i.id), ["a", "legacy"]);
});
