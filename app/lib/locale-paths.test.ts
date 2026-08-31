import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesGenuinelyMissing } from "./locale-paths.ts";

test("a translated copy of a page we already have is not a missing page", () => {
 // ascensio-demo's sitemap lists 456 pages and we captured 431. All 47 of the "missing" ones are
 // /ja/… — the Japanese rendering of pages we hold in English. The seller has one shop, not two.
 const missing = pagesGenuinelyMissing(
  ["/ja/collections/heels", "/ja/collections/menswear", "/ja/products/x"],
  new Set(["/collections/heels", "/collections/menswear", "/products/x"]),
 );
 assert.deepEqual(missing, []);
});

test("a page that is genuinely not copied is still reported", () => {
 const missing = pagesGenuinelyMissing(["/pages/streams"], new Set(["/collections/all"]));
 assert.deepEqual(missing, ["/pages/streams"]);
});

test("a translated page whose original we do NOT have is still missing", () => {
 // Excusing it would hide a real gap behind a language prefix.
 const missing = pagesGenuinelyMissing(["/ja/pages/lookbook"], new Set(["/collections/all"]));
 assert.deepEqual(missing, ["/ja/pages/lookbook"]);
});

test("language-and-region prefixes are understood too", () => {
 const have = new Set(["/collections/bags"]);
 assert.deepEqual(pagesGenuinelyMissing(["/en-gb/collections/bags", "/pt-br/collections/bags"], have), []);
});

test("a real path that merely looks short is not mistaken for a language", () => {
 // A collection called "/eu" or a page called "/uk" is a page, not a locale prefix. It only counts
 // as a locale when stripping it reveals a page we actually hold.
 assert.deepEqual(pagesGenuinelyMissing(["/eu"], new Set(["/collections/all"])), ["/eu"]);
 assert.deepEqual(pagesGenuinelyMissing(["/uk/pages/about"], new Set(["/collections/all"])), ["/uk/pages/about"]);
});

test("the homepage in another language is not a missing page", () => {
 assert.deepEqual(pagesGenuinelyMissing(["/ja"], new Set(["/"])), []);
});

test("trailing slashes do not change the answer", () => {
 assert.deepEqual(pagesGenuinelyMissing(["/ja/collections/heels/"], new Set(["/collections/heels"])), []);
});
