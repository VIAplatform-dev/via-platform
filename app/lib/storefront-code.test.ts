import { test } from "node:test";
import assert from "node:assert/strict";
import { storefrontScript, sanitizeCode, MAX_CODE } from "./storefront-code.ts";

test("code runs on the store's own origin", () => {
 assert.equal(storefrontScript("console.log(1)", true), "console.log(1)");
});

test("and NEVER on VYA's copy of the same storefront", () => {
 // The mirror shares an origin with the marketplace. Shipping the code there would undo exactly
 // the isolation that makes shipping it anywhere safe.
 assert.equal(storefrontScript("console.log(1)", false), "");
 assert.equal(storefrontScript("alert(document.cookie)", false), "");
});

test("nothing is emitted when a store has written nothing", () => {
 assert.equal(storefrontScript("", true), "");
 assert.equal(storefrontScript(null, true), "");
 assert.equal(storefrontScript("   \n  ", true), "");
});

test("a closing script tag can't cut the code in half", () => {
 const out = storefrontScript('const s = "</script><img src=x onerror=alert(1)>";', true);
 assert.ok(!/<\/script/i.test(out), "no literal closing tag survives");
 assert.match(out, /<\\\/script/);
 // Mixed case is the version people actually get caught by.
 assert.ok(!/<\/ScRiPt/i.test(storefrontScript('x = "</ScRiPt>"', true)));
});

test("a paste can't balloon every page of a shop", () => {
 assert.equal(sanitizeCode("x".repeat(MAX_CODE + 5000)).length, MAX_CODE);
 assert.equal(sanitizeCode(42 as never), "");
});
