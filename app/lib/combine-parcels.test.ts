import { test } from "node:test";
import assert from "node:assert/strict";
import { combineParcels } from "./parcel-core.ts";
import { assignTier } from "./shipping-tiers.ts";

const TEE = { weightOz: 6, lengthIn: 10, widthIn: 8, heightIn: 1 };
const BAG = { weightOz: 40, lengthIn: 16, widthIn: 12, heightIn: 8 };

test("a t-shirt and a big bag ship as the big parcel, not the t-shirt's", () => {
 const p = combineParcels([TEE, BAG]);
 assert.equal(p.weightOz, 46);   // both, on the scale
 assert.equal(p.lengthIn, 16);   // the bag's footprint
 assert.equal(p.heightIn, 9);    // stacked
 // 46oz over a 37in girth is a genuine Medium — the point isn't that adding anything reaches
 // Large, it's that the parcel is never quoted as the smaller of the two things in it.
 assert.ok(assignTier(p).priceCents > assignTier(TEE).priceCents, "must cost more than the tee alone");
 assert.ok(assignTier(p).priceCents >= assignTier(BAG).priceCents, "never less than the bag alone");
});

test("enough in the box does reach the top tier", () => {
 const p = combineParcels([BAG, BAG]);   // 80oz
 assert.equal(assignTier(p).id, "large");
});

test("one item is exactly the single-item answer", () => {
 assert.deepEqual(combineParcels([BAG]), { weightOz: 40, lengthIn: 16, widthIn: 12, heightIn: 8 });
});

test("weight adds up across the bag", () => {
 assert.equal(combineParcels([TEE, TEE, TEE]).weightOz, 18);
});

test("things go IN a box — length and width don't queue end to end", () => {
 // Two bags, so the floor doesn't mask the arithmetic: a box holding both is as long and wide as
 // one of them and twice as tall. Not 32 inches long.
 const p = combineParcels([BAG, BAG]);
 assert.equal(p.lengthIn, 16);  // not 32
 assert.equal(p.widthIn, 12);   // not 24
 assert.equal(p.heightIn, 16);  // but they do stack
});

test("an unmeasured piece in the bag still adds size, rather than nothing", () => {
 const withUnknown = combineParcels([BAG, {}]);
 assert.ok(withUnknown.weightOz > 40, "the unknown piece has to weigh something");
 assert.ok(withUnknown.heightIn > 8);
});

test("an empty order falls back rather than declaring a zero parcel", () => {
 const p = combineParcels([]);
 assert.ok(p.weightOz > 0 && p.lengthIn > 0 && p.widthIn > 0 && p.heightIn > 0);
});

test("a combined parcel is never cheaper than its largest single item", () => {
 for (const set of [[TEE, BAG], [BAG, BAG], [TEE, TEE, BAG]]) {
  const combined = assignTier(combineParcels(set)).priceCents;
  const biggest = Math.max(...set.map((i) => assignTier(i).priceCents));
  assert.ok(combined >= biggest, `combined ${combined} < biggest single ${biggest}`);
 }
});
