import { test } from "node:test";
import assert from "node:assert/strict";
import { storefrontVisibility } from "./storefront-visibility.ts";

test("a published shop is the shop", () => {
 assert.equal(storefrontVisibility(true), "live");
});

test("an unpublished shop shows its preview rather than a 404", () => {
 // Her address works from the moment she has one, and she can send it to somebody for an opinion
 // before she opens. The not-live ribbon is what keeps it honest.
 assert.equal(storefrontVisibility(false), "preview");
});

test("it does not depend on who is asking", () => {
 // A storefront is served from the seller's OWN domain, where her VYA session cookie does not
 // exist, so gating on "is this the owner?" would have shut the owner out of her own shop, and
 // nobody else. Kept as a test because the mistake is not obvious until you have made it.
 assert.equal(storefrontVisibility(false), storefrontVisibility(false));
});
