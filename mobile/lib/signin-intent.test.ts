import { test } from "node:test";
import assert from "node:assert/strict";
import { destinationFor } from "./signin-intent.ts";

test("a store owner lands in her own app", () => {
 assert.deepEqual(destinationFor("hanas-store", "store"), { route: "/(seller)" });
 // Even if she came in through the shopper button — the address is what decides, not the wording.
 assert.deepEqual(destinationFor("hanas-store", "shop"), { route: "/(seller)" });
 assert.deepEqual(destinationFor("hanas-store", null), { route: "/(seller)" });
});

test("a shopper lands in the marketplace", () => {
 assert.deepEqual(destinationFor(null, "shop"), { route: "/(tabs)" });
 assert.deepEqual(destinationFor(null, null), { route: "/(tabs)" });
 assert.deepEqual(destinationFor("", null), { route: "/(tabs)" });
});

test("asking for a shop and having none is answered, not ignored", () => {
 // THE BUG THIS EXISTS FOR. Pressing "Sign in as a store" and arriving in the shopper marketplace
 // with nothing said is indistinguishable from the app being broken. She IS signed in; she just has
 // no shop on that address, and that is a sentence, not a redirect.
 assert.deepEqual(destinationFor(null, "store", "helster@bu.edu"), { route: "/auth/no-store", email: "helster@bu.edu" });
 assert.deepEqual(destinationFor(null, "store"), { route: "/auth/no-store", email: null });
});
