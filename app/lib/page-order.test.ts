import test from "node:test";
import assert from "node:assert/strict";
import { applyPageOrder, movePage, sanitizePageOrder } from "./page-order.ts";

// The merge is the whole risk here. A saved order is a snapshot of pages that existed when she
// dragged them, and the real list keeps moving: import a new collection, delete an old one. Get it
// wrong and either a new page is invisible to her, or a dead thumbnail opens nothing.

test("her order is kept", () => {
 const actual = ["/", "/collections/all", "/journal"];
 assert.deepEqual(applyPageOrder(["/journal", "/", "/collections/all"], actual), ["/journal", "/", "/collections/all"]);
});

test("with no saved order the caller's order stands", () => {
 // Which is what keeps "not live" pages sorted last until she moves something herself.
 const actual = ["/", "/collections/all", "/collections/retired"];
 assert.deepEqual(applyPageOrder(null, actual), actual);
 assert.deepEqual(applyPageOrder([], actual), actual);
});

test("a page added since she last dragged anything still appears", () => {
 // Appended, not inserted — anywhere else would shuffle the row she deliberately set.
 const out = applyPageOrder(["/journal", "/"], ["/", "/journal", "/collections/new-in"]);
 assert.deepEqual(out, ["/journal", "/", "/collections/new-in"]);
});

test("a page deleted since is dropped, not left as a dead thumbnail", () => {
 const out = applyPageOrder(["/journal", "/gone", "/"], ["/", "/journal"]);
 assert.deepEqual(out, ["/journal", "/"]);
});

test("a duplicate in the saved order cannot duplicate the thumbnail", () => {
 const out = applyPageOrder(["/", "/", "/journal"], ["/", "/journal"]);
 assert.deepEqual(out, ["/", "/journal"]);
});

test("every page comes out exactly once, whatever the saved order says", () => {
 const actual = ["/", "/a", "/b", "/c"];
 const out = applyPageOrder(["/c", "/zzz", "/c", "/a"], actual);
 assert.equal(out.length, actual.length);
 assert.deepEqual([...out].sort(), [...actual].sort());
});

test("moving a page puts it where it was dropped", () => {
 assert.deepEqual(movePage(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
 assert.deepEqual(movePage(["a", "b", "c", "d"], 3, 0), ["d", "a", "b", "c"]);
 assert.deepEqual(movePage(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
});

test("a nonsense move changes nothing rather than losing a page", () => {
 const o = ["a", "b", "c"];
 for (const [f, t] of [[-1, 1], [1, -1], [5, 0], [0, 9]] as [number, number][]) {
  assert.deepEqual(movePage(o, f, t), o, `${f}->${t}`);
 }
});

test("what gets stored is checked, because it arrives from a browser", () => {
 const actual = ["/", "/journal"];
 assert.deepEqual(sanitizePageOrder(["/journal", "/"], actual), ["/journal", "/"]);
 assert.deepEqual(sanitizePageOrder(["/journal", "/not-a-page", "/journal"], actual), ["/journal"]);
 assert.deepEqual(sanitizePageOrder([1, null, {}, "/"], actual), ["/"]);
 assert.deepEqual(sanitizePageOrder("nope", actual), []);
 assert.deepEqual(sanitizePageOrder(null, actual), []);
});

test("the stored order is capped — an unbounded array from a client is an unbounded row", () => {
 const actual = Array.from({ length: 20 }, (_, i) => `/p${i}`);
 assert.equal(sanitizePageOrder(actual, actual, 5).length, 5);
});
