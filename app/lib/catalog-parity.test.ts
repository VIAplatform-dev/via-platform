import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMissing, type FeedProduct } from "./catalog-parity.ts";

const p = (over: Partial<FeedProduct>): FeedProduct => ({
 handle: "h", title: "T", images: [{ src: "a.jpg" }],
 variants: [{ available: true, price: "100.00" }], ...over,
});

test("a piece a shopper could buy, and we don't have, is missing", () => {
 const got = classifyMissing([p({ handle: "in-stock" })], new Set());
 assert.deepEqual(got.missing.map((x) => x.handle), ["in-stock"]);
 assert.equal(got.noPhoto.length, 0);
});

test("a sold piece is not missing from our store", () => {
 // Every single "missing product" on bag-crush was one of these: a piece she has sold and not
 // deleted, or a pre-order she never photographed. Calling that "a product missing from your
 // store" and grading it BLOCKING failed six stores over things no shopper could ever buy.
 const sold = p({ handle: "sold", variants: [{ available: false, price: "150.00" }] });
 const got = classifyMissing([sold], new Set());
 assert.equal(got.missing.length, 0);
 assert.deepEqual(got.unsellable.map((x) => x.handle), ["sold"]);
});

test("a piece with no price is not missing either", () => {
 const noPrice = p({ handle: "np", variants: [{ available: false, price: "0.00" }] });
 assert.equal(classifyMissing([noPrice], new Set()).missing.length, 0);
});

test("in stock and priced but with no photo is its own answer, not 'missing'", () => {
 // feathers-boutique-vintage's seven are real, in stock, £188–£695 — and have no photo on HER
 // site. We cannot render a card without an image, so this is hers to fix, not ours, and it must
 // read as that rather than as a product we dropped.
 const bare = p({ handle: "nophoto", images: [] });
 const got = classifyMissing([bare], new Set());
 assert.equal(got.missing.length, 0);
 assert.deepEqual(got.noPhoto.map((x) => x.handle), ["nophoto"]);
});

test("anything we already have is never reported", () => {
 const got = classifyMissing([p({ handle: "have" })], new Set(["have"]));
 assert.equal(got.missing.length + got.noPhoto.length + got.unsellable.length, 0);
});

test("a variant that is available at a price counts, even among sold ones", () => {
 const one = p({ handle: "mixed", variants: [
  { available: false, price: "100.00" }, { available: true, price: "100.00" },
 ] });
 assert.deepEqual(classifyMissing([one], new Set()).missing.map((x) => x.handle), ["mixed"]);
});

test("a product with no variants at all is unsellable, not missing", () => {
 assert.equal(classifyMissing([p({ handle: "none", variants: [] })], new Set()).missing.length, 0);
});

test("missing pieces come back with enough to act on", () => {
 // A count is not actionable. "9 products missing" cost an afternoon precisely because nothing
 // recorded WHICH, so every reader had to re-derive it from the seller's feed.
 const got = classifyMissing([p({ handle: "act", title: "Gucci bag" })], new Set());
 assert.equal(got.missing[0].handle, "act");
 assert.equal(got.missing[0].title, "Gucci bag");
});
