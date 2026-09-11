import { test } from "node:test";
import assert from "node:assert";
import { inferCategoryFromTitle as cat, categoryFor, familyOf, OVERRIDE_FAMILY_TO_SLUG } from "./categorize-core.ts";
import { bagsSlugs, accessoriesSlugs, clothingSlugs, shoesSlugs } from "./categoryMap.ts";
import { CATEGORY_GROUPS } from "./item-tags.ts";

// The taxonomy is an ORDERED keyword list, so every fix is one reordering away from being
// undone. These are the decisions that were actually got wrong in production, pinned so a
// later keyword edit has to break a test rather than a category page.

test("wallets and small leather goods are BAGS, not accessories", () => {
  for (const title of [
    "Gucci Jackie Long Wallet",
    "Salvatore Ferragamo Brown Lizard Bi-Fold Wallet",
    "Bottega Veneta Intrecciato Zip-Around Wallet",
    "Coach Signature Canvas Trifold Wallet Black Contrast Stitch",
    "Cartier Card Holder",
    "Chanel Caviar Card Holder",
    "Gucci GG Marmont Pink Card Case",
    "Vivienne Westwood Ribbed Thin Card Holder – Black",
    "Chanel Caviar Leather Key Case – Black | 7 Series",
    "LV Key Pouch",
    "Louis Vuitton Pochette Cles",
    "4 Ring Key Holder",
  ]) {
    assert.equal(cat(title), "wallets", title);
    assert.ok(bagsSlugs.has("wallets"), "wallets must sit in the bags family");
  }
});

test("a wallet WITH a strap is a bag, not a wallet", () => {
  // A Chanel WOC is carried like a bag and priced like one. These must beat the wallet rule.
  assert.equal(cat("Chanel Wallet on Chain Caviar"), "bags");
  assert.equal(cat("Chanel chain wallet black"), "bags");
});

test("charms, keyrings, watches and gloves stay accessories", () => {
  for (const title of [
    "Louis Vuitton Confidence Tortoise Bag Charm & Key Holder",
    "Hermès Rodeo PM Charm",
    "Bag Charm (with 18k plated charms)",
    "vivienne westwood orange orb keychain",
    "Tiffany & Co. Sterling Silver Horseshoe Keychain Round Tag",
    "Tag Heuer 2000 Professional Quartz Dive Watch 200m",
    "Prada Red Leather Gloves",
  ]) {
    assert.equal(cat(title), "accessories", title);
  }
});

test("a bag named after a jewelry word is still a bag", () => {
  for (const title of ["Gucci Bracelet Bag", "Ring Handle Bag", "Charm Bag", "Necklace Bag"]) {
    assert.ok(bagsSlugs.has(cat(title)), `${title} → ${cat(title)}`);
  }
});

test("real jewelry is still jewelry", () => {
  for (const title of ["gold ring", "Pearl Necklace", "Art Deco Sapphire Clip", "Gold Cuff"]) {
    assert.ok(accessoriesSlugs.has(cat(title)), `${title} → ${cat(title)}`);
  }
});

test("bag subcategories beat the generic bags bucket", () => {
  assert.equal(cat("Leather Tote"), "totes");
  assert.equal(cat("Beaded Evening Clutch"), "clutches");
  assert.equal(cat("Quilted Crossbody"), "crossbody-bags");
  assert.equal(cat("Suede Shoulder Bag"), "bags");
});

test("garments are not stolen by material or detail words", () => {
  assert.equal(cat("Denim Skirt"), "skirts");
  assert.equal(cat("Beaded Dress Pants"), "pants");
  assert.equal(cat("Gucci Bamboo Leather Detail Skirt"), "skirts");
  assert.equal(cat("Gucci Horsebit Loafers"), "flats");
  assert.equal(cat("Pearl Accent Button Up"), "tops");
  for (const t of ["Silk Blouse", "Wool Cardigan", "Pleated Midi Skirt"]) {
    assert.ok(clothingSlugs.has(cat(t)), `${t} → ${cat(t)}`);
  }
});

test("shoe subcategories resolve to the shoes family", () => {
  for (const t of ["Ankle Boots", "Kitten Heel Pump", "Ballet Flats", "Thong Sandals", "Leather Sneakers"]) {
    assert.ok(shoesSlugs.has(cat(t)), `${t} → ${cat(t)}`);
  }
});

test("every keyword resolves to a slug the families know about", () => {
  // A slug that belongs to no family is invisible: it has a label but no category page
  // lists it. This is the failure mode a new slug hits, and it is silent.
  const known = new Set([
    ...bagsSlugs, ...accessoriesSlugs, ...clothingSlugs, ...shoesSlugs,
    "other-clothing", "home",
  ]);
  for (const title of [
    "Gucci Long Wallet", "Leather Tote", "Ankle Boots", "Silk Blouse",
    "Pearl Necklace", "Vintage Watch", "Ceramic Vase", "something unrecognisable",
  ]) {
    assert.ok(known.has(cat(title)), `${cat(title)} belongs to no display family`);
  }
});

// ── Corrections ──────────────────────────────────────────────────────────────

test("an override moves an item to the corrected family", () => {
  // The title reads as a wallet; a human says it is really an accessory.
  assert.equal(categoryFor("Gucci Jackie Long Wallet", "accessories"), "accessories");
  assert.equal(categoryFor("Silk Blouse", "home"), "home");
  assert.equal(categoryFor("Ankle Boots", "bags"), "bags");
  // ...but "bags" on a wallet changes nothing: wallets IS the bags family already, and the
  // specific slug beats the generic bucket (see the next test).
  assert.equal(categoryFor("Gucci Jackie Long Wallet", "bags"), "wallets");
});

test("an override that agrees keeps the SPECIFIC slug", () => {
  // Confirming a tote is a bag must not flatten it out of the Totes filter.
  assert.equal(categoryFor("Leather Tote", "bags"), "totes");
  assert.equal(categoryFor("Ankle Boots", "shoes"), "boots");
  assert.equal(categoryFor("Pearl Necklace", "accessories"), "jewelry");
});

test("no override, or an unknown one, falls back to the title", () => {
  assert.equal(categoryFor("Leather Tote"), "totes");
  assert.equal(categoryFor("Leather Tote", null), "totes");
  assert.equal(categoryFor("Leather Tote", "nonsense"), "totes");
});

test("every override family maps to a slug inside that same family", () => {
  for (const [family, slug] of Object.entries(OVERRIDE_FAMILY_TO_SLUG)) {
    assert.equal(familyOf(slug), family, `${family} → ${slug}`);
  }
});

// ── The two taxonomies must agree ────────────────────────────────────────────
//
// There are two lists of category slugs: this one (titles → slug, for imported catalogue)
// and item-tags.ts (the seller's picker and the AI tagger). They are separate on purpose —
// different inputs — but they must never disagree about which FAMILY a slug belongs to, or
// an item tagged one way in the app lands under a different heading on the web.

test("every slug the seller picker offers belongs to the family it is listed under", () => {
  const FAMILY_LABEL: Record<string, string> = {
    Clothing: "clothing", Shoes: "shoes", Bags: "bags", Accessories: "accessories", Home: "home",
  };
  for (const group of CATEGORY_GROUPS) {
    const expected = FAMILY_LABEL[group.label];
    assert.ok(expected, `unknown picker group "${group.label}"`);
    for (const slug of group.slugs) {
      assert.equal(familyOf(slug), expected, `${slug} is listed under ${group.label}`);
    }
  }
});

test("the seller picker can express every slug the title rules produce", () => {
  // A slug the importer assigns but the picker can't offer is a category a seller can see
  // but never set — and the AI sweep can never correct an item into it.
  const pickable = new Set(CATEGORY_GROUPS.flatMap((g) => g.slugs));
  for (const title of [
    "Gucci Long Wallet", "Leather Tote", "Beaded Evening Clutch", "Quilted Crossbody",
    "Suede Shoulder Bag", "Ankle Boots", "Silk Blouse", "Pearl Necklace",
    "Vintage Watch", "Leather Belt", "Silk Scarf", "Wool Beret", "Ceramic Vase",
  ]) {
    assert.ok(pickable.has(cat(title)), `${cat(title)} (from "${title}") is not in the picker`);
  }
});
