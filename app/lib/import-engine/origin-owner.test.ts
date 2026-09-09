import { test } from "node:test";
import assert from "node:assert/strict";
import { originKey, conflictingOwner, type OriginClaim } from "./origin-owner.ts";

// Importing a shop that already belongs to ANOTHER store is the wrong-store-selected mistake, and it
// is expensive: it copies that shop's pages, products and collections into a seller's account and
// deletes whatever the seller had. The job row that caught it read
// `gianna-marie-raucher | https://tesselizabethvintage.com/`, which is unambiguous.

const claims: OriginClaim[] = [
 { slug: "tesselizabethvintage", origin: "https://tesselizabethvintage.com" },
 { slug: "blummier", origin: "https://blummier.com" },
];

test("the same shop, held by another store, is refused", () => {
 assert.equal(conflictingOwner("https://tesselizabethvintage.com/", "gianna-marie-raucher", claims), "tesselizabethvintage");
});

test("re-importing your OWN shop is always allowed — that is the repair path", () => {
 assert.equal(conflictingOwner("https://tesselizabethvintage.com/", "tesselizabethvintage", claims), null);
});

test("a shop nobody has captured is allowed", () => {
 assert.equal(conflictingOwner("https://brandnewshop.com", "gianna-marie-raucher", claims), null);
});

test("www, scheme, port, case and trailing slash do not let it through", () => {
 for (const u of [
  "http://www.tesselizabethvintage.com",
  "HTTPS://TessElizabethVintage.com/",
  "https://www.tesselizabethvintage.com:443/collections/all",
  "tesselizabethvintage.com",
 ]) {
  assert.equal(conflictingOwner(u, "gianna-marie-raucher", claims), "tesselizabethvintage", u);
 }
});

test("a different subdomain is a different shop, not the same one", () => {
 // shop.x.com and x.com are routinely separate storefronts; refusing one because of the other
 // would block legitimate imports.
 assert.equal(conflictingOwner("https://shop.tesselizabethvintage.com", "gianna-marie-raucher", claims), null);
});

test("force is the deliberate override, for scripts and genuine re-assignment", () => {
 assert.equal(conflictingOwner("https://tesselizabethvintage.com", "gianna-marie-raucher", claims, true), null);
});

test("junk in never blocks — URL validation is somebody else's job", () => {
 assert.equal(conflictingOwner("not a url", "gianna-marie-raucher", claims), null);
 assert.equal(conflictingOwner("", "gianna-marie-raucher", claims), null);
});

test("a claim with an unreadable origin is skipped rather than throwing", () => {
 const bad: OriginClaim[] = [{ slug: "broken", origin: "" }, { slug: "ok", origin: "https://ok.com" }];
 assert.equal(conflictingOwner("https://ok.com", "someone", bad), "ok");
});

test("originKey normalises to one comparable form", () => {
 assert.equal(originKey("https://www.Example.com/path?q=1"), "example.com");
 assert.equal(originKey("http://example.com:8080"), "example.com");
 assert.equal(originKey("example.com"), "example.com");
 assert.equal(originKey("  "), null);
 assert.equal(originKey("http://"), null);
});
