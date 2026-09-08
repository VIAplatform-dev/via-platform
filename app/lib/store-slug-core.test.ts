import { test } from "node:test";
import assert from "node:assert/strict";
import { pickStoreSlug } from "./store-slug-core.ts";

// One seller, two identities: her curated-marketplace slug in the hardcoded email map, and her
// hosted store's slug in store_users. The web resolver decided long ago that store_users wins
// (see resolveStoreSlug); the phone had it backwards, so the app signed her into the marketplace
// identity and showed "Nothing listed yet" over 1,477 pieces.

test("the store_users row wins over the hardcoded map", () => {
 assert.equal(pickStoreSlug({ dbSlug: "sourcedbyscottie", staticSlug: "sourced-by-scottie" }), "sourcedbyscottie");
});

test("with no store_users row, the hardcoded map still signs curated sellers in", () => {
 assert.equal(pickStoreSlug({ dbSlug: null, staticSlug: "sourced-by-scottie" }), "sourced-by-scottie");
});

test("neither means not a store", () => {
 assert.equal(pickStoreSlug({ dbSlug: null, staticSlug: null }), null);
});
