import test from "node:test";
import assert from "node:assert/strict";
import { adaptForEbay, recoverSize, missingSizeMessage } from "./ebay-adapt.ts";

// The decision order is the product here: what she wrote, then what she wrote elsewhere, then a
// fact about the piece, then — and only then — a question. Every one of these is a listing a buyer
// sees, so the tests care as much about what it REFUSES to invent as what it fills in.

// A stand-in for eBay's own list. Anything not on it is rejected, exactly as eBay does.
const EBAY = ["XS", "S", "M", "L", "XL", "6", "8", "10", "12", "28", "30", "One Size"];
const standardize = (raw: string) => EBAY.find((v) => v.toLowerCase() === raw.trim().toLowerCase()) ?? null;
const opts = { standardize, allowedSizes: EBAY, sizeRequired: true };

test("what she wrote wins, when eBay takes it", () => {
 const r = adaptForEbay({ size: "M", material: "Wool" }, opts);
 assert.equal(r.size, "M");
 assert.equal(r.material, "Wool");
 assert.equal(r.sizeSource, "given");
 assert.equal(r.movedSizeToMaterial, false);
});

test("a fabric in the Size box becomes the material instead of being thrown away", () => {
 // Before, this was rejected AND discarded: the listing failed and the one true fact she had
 // written went nowhere.
 const r = adaptForEbay({ size: "Leather", title: "Miu Miu skirt", category: "skirts" }, opts);
 assert.equal(r.material, "Leather");
 assert.equal(r.movedSizeToMaterial, true);
});

test("a fabric in Size never overwrites a material she actually set", () => {
 const r = adaptForEbay({ size: "Leather", material: "Suede", category: "skirts" }, opts);
 assert.equal(r.material, "Suede");
 assert.equal(r.movedSizeToMaterial, true);
});

test("a size she wrote in the title is found", () => {
 const r = adaptForEbay({ title: "1990s silk slip dress size M", category: "dresses" }, opts);
 assert.equal(r.size, "M");
 assert.equal(r.sizeSource, "recovered");
});

test("a size written as a region is found", () => {
 assert.equal(adaptForEbay({ title: "Vintage boots US 8", category: "boots" }, opts).size, "8");
 assert.equal(adaptForEbay({ description: "Fits like a UK 12", category: "dress" }, opts).size, "12");
});

test("a waist measurement counts as a size on trousers", () => {
 const r = adaptForEbay({ title: "Levi's 501", measurements: "Waist 28 · Inseam 32", category: "trousers" }, opts);
 assert.equal(r.size, "28");
 assert.equal(r.sizeSource, "recovered");
});

test("a decade in the title is NOT a size", () => {
 // "1970s wool coat" must never become size 19 or 70. A wrong size on a garment is a return.
 for (const title of ["1970s wool coat", "70s trench", "Y2K 2000s top"]) {
  assert.equal(recoverSize({ title }), null, title);
 }
});

test("a loose letter in a title is not a size either", () => {
 // "S" and "M" appear inside ordinary words constantly; only the Size field's own value counts.
 assert.equal(recoverSize({ title: "Small pocket M&S midi skirt" }), null);
 assert.equal(recoverSize({ size: "M", title: "anything" }), "M");
});

test("bags and jewellery are one size, because that is true of them", () => {
 for (const category of ["bags", "handbag", "jewellery", "scarves", "belts", "sunglasses"]) {
  const r = adaptForEbay({ category, title: "a piece" }, opts);
  assert.equal(r.size, "One Size", category);
  assert.equal(r.sizeSource, "one-size", category);
 }
});

test("a piece that says one size is taken at its word", () => {
 assert.equal(adaptForEbay({ size: "One Size", category: "dress" }, opts).size, "One Size");
 assert.equal(adaptForEbay({ size: "OSFA", category: "dress" }, opts).size, "One Size");
});

test("a garment with no size anywhere is NOT guessed at", () => {
 // The whole point. A dress with no size stays unlisted and she is asked, rather than a buyer
 // receiving a Small labelled Medium.
 const r = adaptForEbay({ title: "1990s silk slip dress", category: "dresses" }, opts);
 assert.equal(r.size, null);
 assert.equal(r.sizeSource, null);
});

test("a size eBay doesn't accept for the category is not forced through", () => {
 // 14 is a real size and not on this category's list. Sending it anyway fails at publish with a
 // worse message than admitting we don't have one.
 const r = adaptForEbay({ size: "14", category: "dresses" }, opts);
 assert.equal(r.size, null);
});

test("the message names the field when a fabric was rescued out of Size", () => {
 const input = { size: "Leather", category: "skirts", title: "Miu Miu skirt" };
 const adapted = adaptForEbay(input, opts);
 const msg = missingSizeMessage(input, adapted);
 assert.match(msg, /Size field/);
 assert.match(msg, /material/);
});

test("nothing here mutates the seller's own listing", () => {
 const input = { size: "Leather", material: null, title: "Miu Miu skirt", category: "skirts" };
 const before = JSON.stringify(input);
 adaptForEbay(input, opts);
 assert.equal(JSON.stringify(input), before, "adaptForEbay changed its input");
});
