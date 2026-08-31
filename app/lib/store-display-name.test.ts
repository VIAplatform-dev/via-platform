import { test } from "node:test";
import assert from "node:assert/strict";
import { isGenericName, isPlaceholderName, storeDisplayName, titleFromSlug } from "./store-display-name.ts";

test("a slug reads back as words", () => {
 assert.equal(titleFromSlug("love-again-vintage"), "Love Again Vintage");
 assert.equal(titleFromSlug("we-thieves"), "We Thieves");
 assert.equal(titleFromSlug("shop_vintage_charm"), "Shop Vintage Charm");
 assert.equal(titleFromSlug(""), "");
});

test("the slug wearing a hat is recognised as a placeholder", () => {
 assert.equal(isPlaceholderName("love-again-vintage", "love-again-vintage"), true);
 assert.equal(isPlaceholderName("Love Again Vintage", "love-again-vintage"), false, "spaced out, it is a real name");
 // Real rows this was run against: both are correct names that merely resemble their slug, and
 // renaming either would have been a regression.
 assert.equal(isPlaceholderName("Blummier", "blummier"), false, "differs only in case — still their name");
 assert.equal(isPlaceholderName("The Niche Shop", "thenicheshop"), false);
 assert.equal(isPlaceholderName("", "x"), true);
 assert.equal(isPlaceholderName(null, "x"), true);
 assert.equal(isPlaceholderName("The Niche Shop", "thenicheshop"), false, "a real name, even if it flattens close");
});

test("the first real name wins, in the caller's order of confidence", () => {
 assert.equal(storeDisplayName("love-again-vintage", null, "Love Again Vintage"), "Love Again Vintage");
 assert.equal(storeDisplayName("thenicheshop", "The Niche Shop", "Something Else"), "The Niche Shop");
});

test("a candidate that is only the slug again is skipped", () => {
 // This is the bug: the importer passed the slug as the name, and it stuck.
 assert.equal(storeDisplayName("love-again-vintage", "love-again-vintage", "Love Again Vintage Co"), "Love Again Vintage Co");
});

test("with nothing usable, a shopper still never sees the slug", () => {
 assert.equal(storeDisplayName("love-again-vintage"), "Love Again Vintage");
 assert.equal(storeDisplayName("we-thieves", null, "", "we-thieves"), "We Thieves");
});

test("a page title that isn't a name is refused", () => {
 // vintage-boutique-style's captured homepage is titled "Home"; taking it at its word named the
 // store "Home", which is worse than the slug it was replacing.
 assert.equal(isGenericName("Home"), true);
 assert.equal(isGenericName(" shop all "), true);
 assert.equal(isGenericName("Love Again Vintage"), false);
 assert.equal(storeDisplayName("vintage-boutique-style", "Home"), "Vintage Boutique Style");
});
