import { test } from "node:test";
import assert from "node:assert/strict";
import { dropIndex, moveItem, movePhoto, perRowFor, removeItem, removePhoto } from "./photo-order.ts";

const L = ["a", "b", "c", "d"];

test("a photo comes out and goes back in, in both directions", () => {
  assert.deepEqual(moveItem(L, 3, 0), ["d", "a", "b", "c"]); // the good shot becomes the cover
  assert.deepEqual(moveItem(L, 0, 3), ["b", "c", "d", "a"]);
  assert.deepEqual(moveItem(L, 1, 2), ["a", "c", "b", "d"]);
});

test("a move that isn't one leaves the array alone, identity included", () => {
  assert.equal(moveItem(L, 2, 2), L);
  assert.equal(moveItem(L, -1, 0), L);
  assert.equal(moveItem(L, 9, 0), L);
  // Dragged past the end: it lands on the end rather than vanishing.
  assert.deepEqual(moveItem(L, 0, 99), ["b", "c", "d", "a"]);
  assert.deepEqual(moveItem(L, 3, -5), ["d", "a", "b", "c"]);
});

test("removing", () => {
  assert.deepEqual(removeItem(L, 0), ["b", "c", "d"]);
  assert.deepEqual(removeItem(L, 3), ["a", "b", "c"]);
  assert.equal(removeItem(L, 4), L);
});

/* ── the two arrays ────────────────────────────────────────────────────── */

test("uploaded URLs move with the files they came from", () => {
  const before = { photos: ["f0", "f1", "f2"], imageUrls: ["u0", "u1", "u2"] };
  assert.deepEqual(movePhoto(before, 2, 0), {
    photos: ["f2", "f0", "f1"],
    imageUrls: ["u2", "u0", "u1"],
  });
  assert.deepEqual(removePhoto(before, 1), { photos: ["f0", "f2"], imageUrls: ["u0", "u2"] });
});

test("before the upload there is nothing to keep in step, and a mismatch is never guessed at", () => {
  // Capture and Details: photos exist, URLs don't.
  assert.deepEqual(movePhoto({ photos: ["f0", "f1"], imageUrls: [] }, 1, 0), {
    photos: ["f1", "f0"],
    imageUrls: [],
  });
  // A stale list of a different length is left exactly as it was rather than scrambled.
  const stale = { photos: ["f0", "f1", "f2"], imageUrls: ["u0"] };
  assert.deepEqual(movePhoto(stale, 2, 0).imageUrls, ["u0"]);
  assert.deepEqual(removePhoto(stale, 0).imageUrls, ["u0"]);
});

/* ── the drag ──────────────────────────────────────────────────────────── */

const GRID = { perRow: 4, pitch: 100, count: 8 };

test("a thumbnail swaps once it passes halfway across its neighbour", () => {
  assert.equal(dropIndex(0, 0, 0, GRID), 0);
  assert.equal(dropIndex(0, 49, 0, GRID), 0);   // not yet
  assert.equal(dropIndex(0, 51, 0, GRID), 1);   // now
  assert.equal(dropIndex(3, -51, 0, GRID), 2);
});

test("dragging down a row moves it a whole row on", () => {
  assert.equal(dropIndex(0, 0, 100, GRID), 4);
  assert.equal(dropIndex(5, 100, -100, GRID), 2); // up a row and one to the right
});

test("dragging off the right edge parks at the end of the row, it does not wrap under her finger", () => {
  assert.equal(dropIndex(0, 900, 0, GRID), 3);
  assert.equal(dropIndex(4, -900, 0, GRID), 4);
});

test("it can never land outside the photos she actually has", () => {
  assert.equal(dropIndex(0, 0, 900, GRID), 7);
  assert.equal(dropIndex(7, 0, -900, GRID), 3);
  // A 6-photo grid four across: the last row is short, and the drop clamps to the real last photo.
  assert.equal(dropIndex(0, 300, 900, { perRow: 4, pitch: 100, count: 6 }), 5);
});

test("a grid that hasn't been measured yet does not divide by nothing", () => {
  assert.equal(dropIndex(2, 40, 40, { perRow: 0, pitch: 100, count: 8 }), 2);
  assert.equal(dropIndex(2, 40, 40, { perRow: 4, pitch: 0, count: 8 }), 2);
  assert.equal(dropIndex(2, 40, 40, { perRow: 4, pitch: 100, count: 0 }), 2);
});

test("how many fit across", () => {
  assert.equal(perRowFor(360, 80, 8), 4);   // 4*80 + 3*8 = 344, a fifth would need 432
  assert.equal(perRowFor(88, 80, 8), 1);
  // Unmeasured, or narrower than one cell: one per row, never zero.
  assert.equal(perRowFor(0, 80, 8), 1);
  assert.equal(perRowFor(40, 80, 8), 1);
});
