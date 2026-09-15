import test from "node:test";
import assert from "node:assert/strict";
import { estimateParcel, parcelFor } from "./parcel-estimate.ts";
import { assignTier, SHIPPING_TIERS } from "./shipping-tiers.ts";

const tier = (category?: string | null, title?: string | null) => assignTier({ category, title }).id;

test("a measured piece is never overruled by a guess", () => {
 // The whole ordering: a tape measure beats a category every time.
 assert.equal(assignTier({ weightOz: 6, lengthIn: 9, widthIn: 6, heightIn: 2, category: "coats-jackets" }).id, "small");
 assert.equal(assignTier({ weightOz: 70, category: "jewelry" }).id, "large");
});

test("earrings and a shearling coat stop costing the same to post", () => {
 // Both were Medium (1400) before this. One was overcharged, the other lost money.
 assert.equal(tier("jewelry", "Gold drop earrings"), "small");
 assert.equal(tier("coats-jackets", "1980s shearling coat"), "large");
 assert.notEqual(SHIPPING_TIERS.find((t) => t.id === "small")!.priceCents, SHIPPING_TIERS.find((t) => t.id === "large")!.priceCents);
});

test("the heavy things that were losing money now buy the right label", () => {
 for (const [cat, title] of [
  ["coats-jackets", "Wool overcoat"], ["boots", "Leather knee-high boots"],
  ["bags", "Leather weekender bag"], ["coats-jackets", "Vintage puffer"],
 ] as const) {
  assert.equal(tier(cat, title), "large", `${title} must not ship on a Medium label`);
 }
});

test("the light things stop being overcharged", () => {
 for (const [cat, title] of [
  ["jewelry", "Pearl necklace"], ["tops", "Silk camisole"], ["scarves", "Silk scarf"],
  ["accessories", "Leather belt"], ["wallets", "Card holder"],
 ] as const) {
  assert.equal(tier(cat, title), "small", `${title} should not cost a Medium parcel`);
 }
});

test("a title outranks its shelf when the shelf is wrong about it", () => {
 // "bags" holds a coin purse and a leather weekender. The shelf cannot answer for both.
 assert.equal(tier("bags", "Chanel coin purse"), "small");
 assert.equal(tier("bags", "Leather weekender"), "large");
 // And an ordinary handbag still gets the shelf's own answer.
 assert.equal(tier("bags", "Vintage leather handbag"), "medium");
});

test("the messy category strings a Shopify import actually writes are understood", () => {
 for (const written of ["Coats & Jackets", "coats_jackets", "JACKETS", "Outerwear", "Shoes / Boots"]) {
  assert.ok(estimateParcel(written, ""), `"${written}" should resolve to something`);
 }
 assert.equal(tier("Coats & Jackets", ""), "large");
 assert.equal(tier("Sneakers", ""), "medium");
});

test("with nothing to go on it still answers Medium, exactly as before", () => {
 // This is the honest limit. No category, no telling word: no estimate, and the old safe middle.
 assert.equal(estimateParcel(null, null), null);
 assert.equal(estimateParcel("", "Untitled"), null);
 assert.equal(tier(null, null), "medium");
 assert.equal(assignTier(null).id, "medium");
 assert.equal(assignTier({}).id, "medium");
});

test("a category can be read out of the title when the field is empty", () => {
 // 1,060 live pieces have no category at all, and their titles are all we have.
 assert.equal(tier(null, "Wool coat"), "large");
 assert.equal(tier("", "Leather boots"), "large");
});

test("every estimate is a whole number and rounded up, never down", () => {
 // Over-estimating over-quotes a little; under-estimating buys too small a label and the carrier
 // re-weighs it and bills the difference. The asymmetry is the design.
 const seen = new Set<string>();
 for (const cat of ["tops","dresses","coats-jackets","boots","bags","jewelry","sneakers","heels","jeans","sweaters","scarves","wallets"]) {
  const e = estimateParcel(cat, "")!;
  assert.ok(e, cat);
  for (const v of [e.weightOz, e.lengthIn, e.widthIn, e.heightIn]) {
   assert.equal(Number.isInteger(v), true, `${cat} must be whole numbers`);
   assert.ok(v > 0, `${cat} must be positive`);
  }
  seen.add(cat);
 }
 assert.equal(seen.size, 12);
});

test("nothing here is written back as if it were measured", () => {
 // estimateParcel returns a value; it never mutates what it was given. isMeasured stays honest and
 // the seller is still asked for a tape.
 const item = { category: "coats-jackets", title: "Wool coat" };
 estimateParcel(item.category, item.title);
 assert.deepEqual(item, { category: "coats-jackets", title: "Wool coat" });
 const dims = { category: "boots", title: "Tall boots" };
 assignTier(dims);
 assert.deepEqual(dims, { category: "boots", title: "Tall boots" }, "assignTier must not fill dims in");
});

test("checkout no longer sells a coat with a small parcel's postage", () => {
 // The exact regression: `weightOz || 16, lengthIn || 12, widthIn || 9, heightIn || 3` is 16oz and
 // 24 girth, which are Small's two limits, so every unmeasured piece was charged 800.
 const coat = { category: "coats-jackets", title: "1980s shearling coat" };
 assert.equal(assignTier({ weightOz: 16, lengthIn: 12, widthIn: 9, heightIn: 3 }).id, "small", "the old defaults");
 assert.equal(assignTier(parcelFor(coat)).id, "large", "what it should have been");
});

test("a measured piece keeps every figure it has, and only gaps are filled", () => {
 // Half-measured is common: a seller weighs a piece and never boxes it.
 const p = parcelFor({ weightOz: 30, category: "coats-jackets", title: "Wool coat" });
 assert.equal(p.weightOz, 30, "her weight, untouched");
 assert.equal(p.lengthIn, 16, "the gap filled from what the piece is");
});

test("a bag of pieces adds up rather than shipping as one small parcel", () => {
 // Weights and heights sum; length and width take the largest. Three coats is not one coat.
 const ps = [
  parcelFor({ category: "coats-jackets", title: "Wool coat" }),
  parcelFor({ category: "boots", title: "Leather boots" }),
 ];
 const combined = {
  weightOz: ps.reduce((s, x) => s + x.weightOz, 0),
  lengthIn: Math.max(...ps.map((x) => x.lengthIn)),
  widthIn: Math.max(...ps.map((x) => x.widthIn)),
  heightIn: ps.reduce((s, x) => s + x.heightIn, 0),
 };
 assert.ok(combined.weightOz > 100, "a coat and boots together are heavy");
 assert.equal(assignTier(combined).id, "large");
});

test("a piece with nothing to go on still gets sendable numbers", () => {
 // Something has to go to the carrier. This is the one case that keeps the old defaults.
 assert.deepEqual(parcelFor({}), { weightOz: 16, lengthIn: 12, widthIn: 9, heightIn: 3 });
});
