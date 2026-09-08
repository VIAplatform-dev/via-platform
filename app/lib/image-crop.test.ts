import { test } from "node:test";
import assert from "node:assert/strict";
import { cropRect, CARD_ASPECT } from "./image-crop.ts";

const ratio = (c: { width: number; height: number }) => c.width / c.height;

test("an untouched crop takes the biggest card-shaped rectangle, centred", () => {
 const c = cropRect({ width: 2000, height: 1500 }); // landscape
 assert.equal(c.height, 1500);
 assert.equal(c.width, Math.round(1500 * CARD_ASPECT));
 assert.ok(Math.abs(ratio(c) - CARD_ASPECT) < 0.01);
 assert.equal(c.top, 0);
 assert.equal(c.left, Math.round((2000 - c.width) / 2)); // centred
});

test("a tall photo keeps its full width and crops the height", () => {
 const c = cropRect({ width: 1000, height: 2000 });
 assert.equal(c.width, 1000);
 assert.equal(c.height, Math.round(1000 / CARD_ASPECT));
});

test("zooming in takes less of the original, so the subject gets bigger", () => {
 const one = cropRect({ width: 2000, height: 2000 }, { zoom: 1 });
 const two = cropRect({ width: 2000, height: 2000 }, { zoom: 2 });
 assert.ok(two.width < one.width && two.height < one.height);
 assert.ok(Math.abs(ratio(two) - CARD_ASPECT) < 0.01);
});

test("panning slides the crop and never leaves the image", () => {
 const img = { width: 2000, height: 1500 };
 const left = cropRect(img, { panX: -1 });
 const right = cropRect(img, { panX: 1 });
 assert.equal(left.left, 0);
 assert.equal(right.left + right.width, img.width);
});

test("a pan past the edge is clamped, not wrapped", () => {
 const img = { width: 2000, height: 1500 };
 assert.deepEqual(cropRect(img, { panX: -9 }), cropRect(img, { panX: -1 }));
 assert.deepEqual(cropRect(img, { panY: 9 }), cropRect(img, { panY: 1 }));
});

test("a photo already the frame's shape has nothing to slide", () => {
 const img = { width: 820, height: 1000 }; // exactly CARD_ASPECT
 assert.deepEqual(cropRect(img, { panX: 1 }), cropRect(img, { panX: -1 }));
});

test("the crop is always inside the image", () => {
 for (const img of [{ width: 3000, height: 400 }, { width: 400, height: 3000 }, { width: 999, height: 1001 }]) {
  for (const zoom of [1, 1.7, 4]) {
   for (const pan of [-1, 0, 1]) {
    const c = cropRect(img, { zoom, panX: pan, panY: pan });
    assert.ok(c.left >= 0 && c.top >= 0, "origin inside");
    assert.ok(c.left + c.width <= img.width, `width fits ${JSON.stringify({ img, c })}`);
    assert.ok(c.top + c.height <= img.height, `height fits ${JSON.stringify({ img, c })}`);
   }
  }
 }
});
