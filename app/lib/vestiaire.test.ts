import { test } from "node:test";
import assert from "node:assert/strict";
import {
 vestiaireCondition, vestiaireUniverse, vestiaireCategory,
 vestiaireMaterial, vestiaireColour, vestiaireEligibility, vestiaireTitle,
} from "./vestiaire.ts";

test("Vestiaire's own condition wording, not Depop's", () => {
 assert.equal(vestiaireCondition("BNWT"), "Never worn, with tag");
 assert.equal(vestiaireCondition("Never worn"), "Never worn");
 assert.equal(vestiaireCondition("Excellent"), "Very good condition");
 assert.equal(vestiaireCondition("Good"), "Good condition");
 assert.equal(vestiaireCondition("Some wear"), "Fair condition");
});

test("its top tier separates tagged from merely unworn", () => {
 assert.equal(vestiaireCondition("new with tags"), "Never worn, with tag");
 assert.equal(vestiaireCondition("unworn"), "Never worn");
});

test("unlabelled vintage defaults down, never up", () => {
 // Overstating condition is what gets a piece returned.
 assert.equal(vestiaireCondition(null), "Good condition");
 assert.equal(vestiaireCondition(""), "Good condition");
});

test("universe comes from the text, defaulting to womenswear", () => {
 assert.equal(vestiaireUniverse("Men's wool blazer", null), "Men");
 assert.equal(vestiaireUniverse("Silk slip dress", null), "Women");
});

test("categories map to Vestiaire's own tree", () => {
 assert.deepEqual(vestiaireCategory("handbags", null), { category: "Bags", subcategory: "Handbags" });
 assert.deepEqual(vestiaireCategory("dresses", null), { category: "Clothing", subcategory: "Dresses" });
 assert.deepEqual(vestiaireCategory("boots", null), { category: "Shoes", subcategory: "Boots" });
 assert.deepEqual(vestiaireCategory("jewelry", null), { category: "Jewellery", subcategory: "Jewellery" });
});

test("a wallet is an accessory, not a bag", () => {
 // Vestiaire files small leather goods separately, and the category drives the fee.
 assert.equal(vestiaireCategory("bags", "Gucci card holder").category, "Accessories");
});

test("the title falls back to the category when VYA's is unhelpful", () => {
 assert.deepEqual(vestiaireCategory("", "Vintage Levi's denim jacket"), { category: "Clothing", subcategory: "Coats" });
});

test("materials are read from the text, most specific first", () => {
 assert.equal(vestiaireMaterial(null, "Patent leather pumps", null), "Patent leather");
 assert.equal(vestiaireMaterial(null, "Black leather jacket", null), "Leather");
 assert.equal(vestiaireMaterial("cashmere", null, null), "Cashmere");
 assert.equal(vestiaireMaterial(null, "Prada Re-Nylon bag", null), "Synthetic");
});

test("no material named stays blank rather than guessing", () => {
 // The intake prompt tells the AI to leave material null rather than guess a fibre from a photo.
 // Filling the required field anyway would launder an honest blank into a false claim.
 assert.equal(vestiaireMaterial(null, "Black evening gown", null), "");
 assert.equal(vestiaireMaterial(null, null, null), "");
});

test("colours use Vestiaire's list, including the ones Depop lacks", () => {
 assert.equal(vestiaireColour("Navy wool coat", null), "Navy");
 assert.equal(vestiaireColour("Burgundy velvet dress", null), "Burgundy");
 assert.equal(vestiaireColour("Ecru linen shirt", null), "Ecru");
 assert.equal(vestiaireColour("Plain dress", null), "");
});

test("an unbranded piece is refused with a reason", () => {
 // Vestiaire is curated — queueing this wastes the seller's afternoon.
 const r = vestiaireEligibility(null);
 assert.equal(r.ok, false);
 if (!r.ok) assert.match(r.reason, /designer brand/i);
});

test("high-street brands are refused by name", () => {
 const r = vestiaireEligibility("Zara");
 assert.equal(r.ok, false);
 if (!r.ok) assert.match(r.reason, /Zara/);
});

test("anything unrecognised is allowed through", () => {
 // Wrongly blocking a real designer is the worse error, so unknown brands pass.
 assert.equal(vestiaireEligibility("Prada").ok, true);
 assert.equal(vestiaireEligibility("Sies Marjan").ok, true);
});

test("titles trim on a word, not mid-word", () => {
 const t = vestiaireTitle("Alexander McQueen Fall 2001 Palazzo Trousers In Black Wool", 50);
 assert.ok(t.length <= 50);
 assert.ok(!t.endsWith(" "));
 assert.ok(/\w$/.test(t), "should not end mid-space");
 assert.equal(vestiaireTitle("Short title", 50), "Short title");
});
