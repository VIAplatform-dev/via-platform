import { test } from "node:test";
import assert from "node:assert/strict";
import {
 vestiaireCondition, vestiaireUniverse, vestiaireCategory,
 vestiaireMaterial, vestiaireColour, vestiaireEligibility, vestiaireTitle, vestiaireReadiness,
 vestiairePattern, vestiaireLength, vestiaireSize,
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
 // Jackets, not Coats: Vestiaire lists them as separate item types, and this used to collapse both
 // into Coats — which matched their dropdown by luck rather than by being right.
 assert.deepEqual(vestiaireCategory("", "Vintage Levi's denim jacket"), { category: "Clothing", subcategory: "Jackets" });
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

// ── readiness: what Vestiaire will refuse, said before the seller opens their site ──

const ready = {
 title: "Chanel Flap Bag", brand: "Chanel", category: "bags", condition: "excellent",
 material: "Leather", colour: "Black", size: "One size", description: "A lovely bag, no flaws.",
 priceCents: 400000, images: ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg"],
};

test("a complete piece is ready", () => {
 const r = vestiaireReadiness(ready);
 assert.equal(r.ready, true);
 assert.deepEqual(r.blocking, []);
});

test("one photo is named as one photo, not as 'not enough'", () => {
 // The seller should know how far off she is, not just that she's off.
 const r = vestiaireReadiness({ ...ready, images: ["https://x/1.jpg"] });
 assert.equal(r.ready, false);
 assert.match(r.blocking.join(" "), /Only 1 photo\. Vestiaire needs at least 3\./);
});

test("two photos still blocks, and says so in the plural", () => {
 const r = vestiaireReadiness({ ...ready, images: ["https://x/1.jpg", "https://x/2.jpg"] });
 assert.match(r.blocking.join(" "), /Only 2 photos/);
});

test("no photos at all reads differently from too few", () => {
 assert.match(vestiaireReadiness({ ...ready, images: [] }).blocking.join(" "), /No photos/);
 assert.match(vestiaireReadiness({ ...ready, images: null }).blocking.join(" "), /No photos/);
});

test("an unbranded piece is refused with Vestiaire's own reason", () => {
 const r = vestiaireReadiness({ ...ready, brand: "" });
 assert.equal(r.ready, false);
 assert.match(r.blocking.join(" "), /designer brand/);
});

test("a high-street brand is refused by name", () => {
 assert.match(vestiaireReadiness({ ...ready, brand: "Zara" }).blocking.join(" "), /doesn’t accept Zara/);
});

test("material can be inferred from the writing, and blocks only when nothing names one", () => {
 // Nothing anywhere says what it's made of.
 const bare = { ...ready, material: null, title: "Chanel Bag", description: "A bag." };
 assert.match(vestiaireReadiness(bare).blocking.join(" "), /No material/);
 // The description names it, so the form can be filled.
 const inferred = { ...bare, description: "Quilted lambskin leather with gold hardware." };
 assert.ok(!vestiaireReadiness(inferred).blocking.some((b) => /material/i.test(b)));
});

test("category, condition and price each block on their own", () => {
 assert.match(vestiaireReadiness({ ...ready, category: "" }).blocking.join(" "), /No category/);
 assert.match(vestiaireReadiness({ ...ready, condition: "" }).blocking.join(" "), /No condition/);
 assert.match(vestiaireReadiness({ ...ready, priceCents: 0 }).blocking.join(" "), /No price/);
});

test("advisories don't block — they're what a reviewer rejects, not what the form stops", () => {
 const r = vestiaireReadiness({ ...ready, size: "", description: "" });
 assert.equal(r.ready, true, "still listable");
 assert.equal(r.advisory.length >= 2, true);
});

test("three photos passes but still suggests the label and hardware shots", () => {
 const r = vestiaireReadiness(ready);
 assert.match(r.advisory.join(" "), /brand label and hardware/);
});

test("a colour the seller typed beats one guessed from the words", () => {
 // Before there was a field, this could only read the title and description — and "Silk dress"
 // names no colour, so Vestiaire's required field was unfillable however complete the listing was.
 assert.equal(vestiaireColour("Dress", "Silk dress"), "");
 assert.equal(vestiaireColour("Dress", "Silk dress", "Navy"), "Navy");
 // The words still work for pieces listed before the field existed.
 assert.equal(vestiaireColour("Black silk dress", null), "Black");
 // And a typed one wins even when the words say otherwise.
 assert.equal(vestiaireColour("Black silk dress", null, "Charcoal"), "Charcoal");
});

// Vestiaire's own item-type list, read off their form's <select id="preductAddCategory">.
const VESTIAIRE_ITEM_TYPES = [
 "Handbags", "Clutch bags", "Backpacks", "Travel bags", "Boots", "Trainers", "Flats", "Ballet flats",
 "Sandals", "Mules & Clogs", "Lace ups", "Heels", "Ankle boots", "Espadrilles", "Knitwear", "Tops",
 "Dresses", "Skirts", "Trousers", "Shorts", "Jumpsuits", "Jeans", "Jackets", "Coats",
];

test("every category we map to is a real option on their form", () => {
 // A subcategory that isn't in this list matches nothing in their dropdown, and the seller is left
 // on a step that won't advance with no idea why. "Shorts" mapped to "" and jeans to "Trousers"
 // before this was checked against the real thing.
 const cats = ["dresses", "skirts", "tops", "jeans", "shorts", "trousers", "jackets", "coats",
  "knitwear", "jumpsuits", "handbags", "clutch bags", "backpacks", "boots", "ankle boots",
  "trainers", "sandals", "heels", "loafers", "ballet flats"];
 for (const c of cats) {
  const { subcategory } = vestiaireCategory(c, "");
  assert.ok(VESTIAIRE_ITEM_TYPES.includes(subcategory), `${c} → ${JSON.stringify(subcategory)} isn't on their form`);
 }
});

test("the types they list separately aren't collapsed into one", () => {
 assert.equal(vestiaireCategory("jeans", "").subcategory, "Jeans");
 assert.equal(vestiaireCategory("shorts", "").subcategory, "Shorts");
 assert.equal(vestiaireCategory("jackets", "").subcategory, "Jackets");
 assert.equal(vestiaireCategory("coats", "").subcategory, "Coats");
 assert.equal(vestiaireCategory("clutch", "").subcategory, "Clutch bags");
 assert.equal(vestiaireCategory("sneakers", "").subcategory, "Trainers");
 // More specific wins: an ankle boot is its own type on their list, not a Boot.
 assert.equal(vestiaireCategory("ankle boots", "").subcategory, "Ankle boots");
});

test("a piece with no colour anywhere is refused before the seller opens their site", () => {
 // Vestiaire's Details step requires it. Without this the run reached their form, filled four
 // steps, and only then reported "Colour: nothing in VYA" — too late to be any use.
 const c = vestiaireReadiness({
  title: "Women's Dress", brand: "Chanel", category: "Dresses", condition: "Good",
  material: "Silk", size: "M", description: "A dress.", priceCents: 38000,
  images: ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg"],
 });
 assert.equal(c.ready, false);
 assert.ok(c.blocking.some((b) => /colou?r/i.test(b)), c.blocking.join(" | "));
});

test("a typed colour clears it, and so does one named in the title", () => {
 const base = {
  brand: "Chanel", category: "Dresses", condition: "Good", material: "Silk", size: "M",
  description: "A dress.", priceCents: 38000,
  images: ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg"],
 };
 assert.equal(vestiaireReadiness({ ...base, title: "Women's Dress", colour: "Ecru" }).ready, true);
 assert.equal(vestiaireReadiness({ ...base, title: "Black silk dress" }).ready, true);
});

test("pattern is read from the words, and 'plain' only when the piece is one colour", () => {
 // Every value has to be one of THEIR options or it matches nothing in the dropdown.
 const THEIRS = ["Plain", "Zebra", "Snakeskin", "Leopard", "Tartan", "Houndstooth", "Floral",
  "Polkadot", "Abstract", "Gingham", "Striped", "Crocodile", "Other"];
 for (const t of ["Leopard coat", "zebra top", "python bag", "floral dress", "tartan skirt",
  "gingham blouse", "polka dot dress", "striped tee", "paisley scarf", "houndstooth jacket"]) {
  const p = vestiairePattern(t, "", null);
  assert.ok(THEIRS.includes(p), `${t} → ${JSON.stringify(p)} isn't on their list`);
 }
 assert.equal(vestiairePattern("Leopard print silk dress", "", "Brown"), "Leopard");
 assert.equal(vestiairePattern("Striped cotton tee", "", null), "Striped");
 assert.equal(vestiairePattern("Python print bag", "", null), "Snakeskin", "their word, not ours");
 // One colour and nothing calling it a print → plain. Safe in a way a guessed fibre isn't.
 assert.equal(vestiairePattern("Silk dress", "A lovely dress.", "Navy"), "Plain");
 // Multicolour is a print by definition — don't call it plain.
 assert.equal(vestiairePattern("Silk dress", "", "Multicolour"), "");
 // No colour known and no pattern word → say nothing.
 assert.equal(vestiairePattern("Silk dress", "", null), "");
});

test("length only applies to pieces that have one", () => {
 assert.equal(vestiaireLength("dresses", "Maxi silk gown", ""), "Maxi");
 assert.equal(vestiaireLength("dresses", "Midi tea dress", ""), "Midi");
 assert.equal(vestiaireLength("dresses", "Mini shift", ""), "Mini");
 assert.equal(vestiaireLength("dresses", "Silk dress", ""), "", "no word for it → leave it");
 assert.equal(vestiaireLength("bags", "Maxi tote", ""), "", "a bag has no length");
});

test("a free-text size becomes their system plus a value", () => {
 assert.deepEqual(vestiaireSize("EU 40"), { system: "IT", value: "40" });
 assert.deepEqual(vestiaireSize("UK 10"), { system: "UK", value: "10" });
 assert.deepEqual(vestiaireSize("US 8"), { system: "US", value: "8" });
 assert.deepEqual(vestiaireSize("M"), { system: "International", value: "M" });
 assert.deepEqual(vestiaireSize("8"), { system: "US", value: "8" });
 assert.deepEqual(vestiaireSize(""), { system: "", value: "" });
});
