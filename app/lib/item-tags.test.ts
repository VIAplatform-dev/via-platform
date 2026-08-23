import { test } from "node:test";
import assert from "node:assert/strict";
import { toCategorySlug, categoryTagLabel, categoryValueLabel, categoryFamily, isCanonicalCategory, CATEGORY_SLUGS, ITEM_STATUSES, STATUS_TONE, OTHER_FAMILY } from "./item-tags.ts";

test("canonical slugs and display labels round-trip", () => {
 for (const slug of CATEGORY_SLUGS) {
  assert.equal(toCategorySlug(slug), slug, `slug ${slug} should map to itself`);
  assert.equal(toCategorySlug(categoryTagLabel(slug)), slug, `label for ${slug} should map back`);
 }
});

test("folds the free-text categories the AI intake and Shopify imports actually write", () => {
 const cases: [string, string][] = [
  ["accessories", "accessories"],
  ["swimwear", "swimwear"],
  ["jackets", "coats-jackets"],   // intake writes "jackets"; taxonomy calls it coats-jackets
  ["Coats & Jackets", "coats-jackets"],
  ["shoes", "shoes"],
  ["bags", "bags"],
  ["dresses", "dresses"],
  ["denim", "jeans"],
  ["Ready-to-Wear", "other-clothing"],
  ["home decor", "home"],
  ["  Belts  ", "belts"],         // whitespace + case are not significant
 ];
 for (const [raw, expected] of cases) assert.equal(toCategorySlug(raw), expected, `${raw} → ${expected}`);
});

test("subcategories win over their catch-all family", () => {
 assert.equal(toCategorySlug("ankle boots"), "boots");
 assert.equal(toCategorySlug("leather tote"), "totes");
 assert.equal(toCategorySlug("belt bag"), "crossbody-bags"); // a bag, not a belt
 assert.equal(toCategorySlug("sunglasses"), "sunglasses");   // not the accessories catch-all
});

test("unrecognised input is null, not a guess", () => {
 for (const raw of ["", "   ", "widgets", "misc", null, undefined]) {
  assert.equal(toCategorySlug(raw), null, `${JSON.stringify(raw)} should not resolve`);
 }
 // Object.prototype keys must not leak through the slug lookup.
 assert.equal(toCategorySlug("constructor"), null);
 assert.equal(toCategorySlug("toString"), null);
});

test("canonical vs custom categories are told apart", () => {
 for (const slug of CATEGORY_SLUGS) assert.ok(isCanonicalCategory(slug), `${slug} is canonical`);
 // Free text the seller typed under "Other" must never be mistaken for a taxonomy slug —
 // that's what keeps it out of the Boots filter and in its own group.
 for (const raw of ["Deadstock band tees", "boots ", "Boots", "", null, undefined]) {
  assert.equal(isCanonicalCategory(raw), false, `${JSON.stringify(raw)} is not canonical`);
 }
 assert.equal(categoryValueLabel("coats-jackets"), "Coats & Jackets");
 assert.equal(categoryValueLabel("Deadstock band tees"), "Deadstock band tees");
});

test("a custom category lands in the Other family", () => {
 assert.equal(categoryFamily("totes"), "Bags");
 assert.equal(categoryFamily("Deadstock band tees"), OTHER_FAMILY);
});

test("every status has a pill tone", () => {
 for (const s of ITEM_STATUSES) assert.ok(STATUS_TONE[s], `status ${s} needs a tone`);
});
