import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanQuery, stripSkus, stripStoreName, explainClean } from "./query-clean.ts";

// Every "before" below is a REAL query pulled from comp_cache — these are searches that actually
// went to Google, not invented examples.

test("strips the SKU shapes that were really being searched", () => {
 assert.equal(stripSkus("Emilio Pucci Pink blue and green silk shirt TUV #265468"), "Emilio Pucci Pink blue and green silk shirt");
 assert.equal(stripSkus("Orange and red flamenco dress with bias cut - sku TUV #62314"), "Orange and red flamenco dress with bias cut");
 assert.equal(stripSkus("Roberto Cavalli feather top - SKU TUV #17"), "Roberto Cavalli feather top");
 assert.equal(stripSkus("Brown 100% silk evening gown - TUV #879562"), "Brown 100% silk evening gown");
 assert.equal(stripSkus("Black y2k butterfly tank tuv #121345"), "Black y2k butterfly tank");
 assert.equal(stripSkus("Vintage white silk purse - TUV #2"), "Vintage white silk purse");
 assert.equal(stripSkus("Jolles Original Austrian Petit Point Evening Bag - sku tuv #7777"), "Jolles Original Austrian Petit Point Evening Bag");
});

test("strips the SKU without eating a season or a year beside it", () => {
 // The hardest real title in the set: a runway piece whose era is the single most valuable token.
 assert.equal(
  stripSkus("Rare Dior by John Galliano FW 2003 Pink Mongolian fur & Patent Leather Columbus Clutch - runway piece - TUV #88885"),
  "Rare Dior by John Galliano FW 2003 Pink Mongolian fur & Patent Leather Columbus Clutch - runway piece",
 );
});

test("cleaning runs on the RAW title, before query normalization", () => {
 // comp_cache stores a normalized form ("... tuv 987689") with the # already gone. Cleaning must
 // happen upstream of that, on the seller's actual title, where the # is still present to anchor on.
 assert.equal(stripSkus("Emilio Pucci Pink blue and green silk shirt TUV #265468"), "Emilio Pucci Pink blue and green silk shirt");
});

test("keeps numbers that a marketplace can actually match on", () => {
 // The whole risk of SKU-stripping is eating real identifiers. These must survive.
 assert.equal(stripSkus("Chanel 2.55 Reissue Flap"), "Chanel 2.55 Reissue Flap");
 assert.equal(stripSkus("Christian Dior F/W 1998 Croc Pump"), "Christian Dior F/W 1998 Croc Pump");
 assert.equal(stripSkus("Lazer Jeans 2000s lace up flare jeans W26"), "Lazer Jeans 2000s lace up flare jeans W26");
 assert.equal(stripSkus("Gucci GG Canvas Tote 671723"), "Gucci GG Canvas Tote 671723", "a style number is not a SKU");
 assert.equal(stripSkus("Versace SS 2005 Coral Reef Print Top"), "Versace SS 2005 Coral Reef Print Top");
});

test("strips the seller's own name from the front", () => {
 assert.equal(
  stripStoreName("To Us Vintage Orange and red flamenco dress", "To Us Vintage"),
  "Orange and red flamenco dress",
 );
 assert.equal(
  stripStoreName("to us vintage stuart weiztman brown heels", "To Us Vintage"),
  "stuart weiztman brown heels",
  "matching ignores casing and punctuation",
 );
});

test("does not strip a store name that appears mid-title or is really the brand", () => {
 // Only a LEADING store name is the Shopify-vendor artefact. Elsewhere it may be meaningful.
 assert.equal(
  stripStoreName("Black dress from To Us Vintage collection", "To Us Vintage"),
  "Black dress from To Us Vintage collection",
 );
 // A title that is ONLY the store name would otherwise become empty.
 assert.equal(stripStoreName("Sourced by Scottie", "Sourced by Scottie"), "Sourced by Scottie");
});

test("the real failing item cleans to something searchable", () => {
 const out = cleanQuery("Kontatto 2000s Black Crinkle Pleated Halter Mini Dress - S/M", "Sourced by Scottie");
 // The brand and every descriptive term survive — this title had no SKU or leading store name.
 assert.match(out, /Kontatto/);
 assert.match(out, /Crinkle Pleated Halter Mini Dress/);
});

test("store name AND sku are removed together", () => {
 const out = cleanQuery("To Us Vintage Brown 100% silk evening gown - TUV #879562", "To Us Vintage");
 assert.equal(out, "Brown 100% silk evening gown");
});

test("cleaning never returns an empty query", () => {
 assert.equal(cleanQuery("sku TUV #12345", null), "sku TUV #12345", "falls back rather than searching nothing");
 assert.equal(cleanQuery("", null), "");
});

test("explainClean reports what it removed, for diagnosing a bad search", () => {
 const e = explainClean("To Us Vintage Brown silk gown - TUV #879562", "To Us Vintage");
 assert.equal(e.after, "Brown silk gown");
 assert.equal(e.removed.length, 2);
 assert.match(e.removed.join(" "), /store name/);
 assert.match(e.removed.join(" "), /SKU/);
});

test("a clean title is left completely alone", () => {
 const t = "Christian Dior 1980s tortoiseshell sunglasses";
 assert.equal(cleanQuery(t, "Some Store"), t);
 assert.deepEqual(explainClean(t, "Some Store").removed, []);
});
