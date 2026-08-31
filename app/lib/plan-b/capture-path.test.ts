import { test } from "node:test";
import assert from "node:assert/strict";
import { capturePathFor } from "./capture-path.ts";

// The bug this exists to prevent: a theme sends the page it is on as `sections_url`, and on a
// product page with a variant selected that string carries `?variant=…`. Captures are stored under
// a bare path, so the lookup missed, the drawer was never built, and the shopper saw an empty bag
// after a successful add. It broke every theme, including ones that otherwise worked.
test("drops the query string a product page carries", () => {
 assert.equal(capturePathFor("/products/fendi-baguette?variant=57266943197515"), "/products/fendi-baguette");
 assert.equal(capturePathFor("/collections/bags?sort_by=price-descending"), "/collections/bags");
});

test("drops a hash fragment too", () => {
 assert.equal(capturePathFor("/products/x#reviews"), "/products/x");
 assert.equal(capturePathFor("/products/x?variant=1#reviews"), "/products/x");
});

test("keeps a plain path exactly as it is", () => {
 assert.equal(capturePathFor("/products/louis-vuitton-pochette"), "/products/louis-vuitton-pochette");
 assert.equal(capturePathFor("/"), "/");
});

// Themes send the absolute URL as often as the relative one.
test("reduces an absolute url to its path", () => {
 assert.equal(capturePathFor("https://loved-again.vyasites.com/products/x?variant=9"), "/products/x");
 assert.equal(capturePathFor("http://lamash.vyasites.test:3333/collections/bags"), "/collections/bags");
});

test("gives a leading slash to a path that lacks one", () => {
 assert.equal(capturePathFor("products/x"), "/products/x");
});

test("empty or junk input resolves to the home page rather than throwing", () => {
 assert.equal(capturePathFor(""), "/");
 assert.equal(capturePathFor(null), "/");
 assert.equal(capturePathFor(undefined), "/");
 assert.equal(capturePathFor("?variant=1"), "/");
});

// Case is preserved: captures are stored under the path the crawler saw, and lowercasing here would
// turn a hit into a miss on any store with a capitalised handle.
test("preserves case", () => {
 assert.equal(capturePathFor("/Products/Fendi-Baguette?variant=1"), "/Products/Fendi-Baguette");
});

test("leaves a trailing slash alone — both forms are stored and the caller retries", () => {
 assert.equal(capturePathFor("/collections/bags/?page=2"), "/collections/bags/");
});
