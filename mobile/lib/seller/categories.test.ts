import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_GROUPS, CATEGORY_SLUGS, CATEGORY_LABELS, categoryLabel, isCanonicalCategory } from "./categories.ts";
import { templateFor } from "./measurements.ts";

test("every offered category has a label, and no slug is offered twice", () => {
  for (const slug of CATEGORY_SLUGS) {
    assert.ok(CATEGORY_LABELS[slug], `${slug} has no label`);
  }
  assert.equal(new Set(CATEGORY_SLUGS).size, CATEGORY_SLUGS.length);
  assert.ok(CATEGORY_GROUPS.every((g) => g.slugs.length > 0));
});

// THE ONE THAT MATTERS. Choosing a category is only worth asking for because it decides which
// measurements the piece is asked for later, so every category this app offers has to land on the
// template the web would give it. A slug added here without a template falls through to the
// generic length/width pair, and the buyer of a dress never sees a waist.
test("every offered category measures the way the web measures it", () => {
  const TOP = ["pitToPit", "shoulder", "sleeve", "length"];
  const DRESS = ["pitToPit", "waist", "hip", "length"];
  const TROUSERS = ["waist", "hip", "rise", "inseam"];
  const SKIRT = ["waist", "hip", "length"];
  const SHOE = ["insole"];
  const BAG = ["width", "height", "depth", "strapDrop"];
  const FLAT = ["length", "width"];
  // Copied from BY_SLUG in app/lib/measurements-core.ts. The web's answer for each of these.
  const expected: Record<string, string[]> = {
    tops: TOP, sweaters: TOP, "coats-jackets": TOP, "other-clothing": TOP,
    dresses: DRESS, jumpsuits: DRESS, lingerie: DRESS, swimwear: DRESS,
    pants: TROUSERS, jeans: TROUSERS, shorts: TROUSERS,
    skirts: SKIRT,
    boots: SHOE, heels: SHOE, sneakers: SHOE, sandals: SHOE, flats: SHOE, shoes: SHOE,
    handbags: BAG, totes: BAG, clutches: BAG, "crossbody-bags": BAG, bags: BAG,
    // Not in the web's map, so the web falls through to its generic pair, as this must.
    wallets: FLAT, accessories: FLAT, belts: FLAT, scarves: FLAT, home: FLAT,
    // Nothing worth measuring on any of these.
    jewelry: [], hats: [], sunglasses: [],
  };
  for (const slug of CATEGORY_SLUGS) {
    assert.deepEqual(templateFor(slug), expected[slug], `${slug} measures wrong`);
  }
});

test("a stored category prints as its label, or as the seller's own words", () => {
  assert.equal(categoryLabel("coats-jackets"), "Coats & Jackets");
  assert.equal(categoryLabel("crossbody-bags"), "Crossbody");
  // Typed before there was a list: shown as written rather than dropped.
  assert.equal(categoryLabel("Vintage tea towels"), "Vintage tea towels");
  assert.equal(categoryLabel(""), "");
  assert.equal(categoryLabel(null), "");
  assert.equal(isCanonicalCategory("jeans"), true);
  assert.equal(isCanonicalCategory("Jeans"), false);
  assert.equal(isCanonicalCategory(null), false);
});
