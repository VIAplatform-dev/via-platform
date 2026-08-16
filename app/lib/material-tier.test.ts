import { test } from "node:test";
import assert from "node:assert/strict";
import { materialTier } from "./material-tier.ts";

test("materialTier ranks natural/luxury fibers premium over synthetics", () => {
 assert.equal(materialTier("100% Silk").tier, "premium");
 assert.equal(materialTier("100% Polyester").tier, "base");
 assert.equal(materialTier("100% Cotton").tier, "mid");
 // a silk blend still beats pure poly
 assert.equal(materialTier("70% Silk, 30% Polyester").tier, "premium");
 // faux/vegan of a natural fiber → synthetic, not premium
 assert.equal(materialTier("Faux Fur").tier, "base");
 assert.equal(materialTier("Vegan Leather").tier, "base");
 // unknown / empty → no tier (caller prices conservatively)
 assert.equal(materialTier("").tier, null);
 assert.equal(materialTier(null).tier, null);
 assert.equal(materialTier("mystery fabric").tier, null);
});
