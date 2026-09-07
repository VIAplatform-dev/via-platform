import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWords, DEFAULT_WORDS } from "./storefront-words.ts";

test("a store that has never set a word gets the standard ones", () => {
 assert.deepEqual(resolveWords(null), DEFAULT_WORDS);
 assert.deepEqual(resolveWords({}), DEFAULT_WORDS);
});

test("only what a store actually overrode changes", () => {
 const w = resolveWords({ sold: "Gone" });
 assert.equal(w.sold, "Gone");
 assert.equal(w.viewAll, DEFAULT_WORDS.viewAll);
});

test("whitespace is not an override — a blank box keeps the standard word", () => {
 assert.equal(resolveWords({ sold: "   " }).sold, DEFAULT_WORDS.sold);
});

test("a word is trimmed and can't run away with the layout", () => {
 assert.equal(resolveWords({ viewAll: "  See everything  " }).viewAll, "See everything");
 assert.equal(resolveWords({ sold: "x".repeat(80) }).sold.length, 40);
});
