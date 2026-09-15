import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeColor } from "./colorNormalize.ts";

test("normalizeColor: plain colours", () => {
 assert.equal(normalizeColor("black"), "black");
 assert.equal(normalizeColor("White"), "white");
 assert.equal(normalizeColor("red"), "red");
});

test("normalizeColor: specific shade wins over generic", () => {
 assert.equal(normalizeColor("navy blue"), "navy");
 assert.equal(normalizeColor("charcoal grey"), "charcoal");
 assert.equal(normalizeColor("dark burgundy"), "burgundy");
});

test("normalizeColor: the pinstripe case: pattern with a base colour", () => {
 assert.equal(normalizeColor("black with white pinstripes"), "black");
 assert.equal(normalizeColor("navy and white stripe"), "navy");
});

test("normalizeColor: synonyms map to the palette", () => {
 assert.equal(normalizeColor("gray"), "grey");
 assert.equal(normalizeColor("noir"), "black");
 assert.equal(normalizeColor("off white"), "off-white");
 assert.equal(normalizeColor("khaki"), "beige");
 assert.equal(normalizeColor("maroon"), "burgundy");
 assert.equal(normalizeColor("magenta"), "fuchsia");
 assert.equal(normalizeColor("multi"), "multicolor");
});

test("normalizeColor: unknown / empty → null (never guess)", () => {
 assert.equal(normalizeColor("pinstripe"), null);
 assert.equal(normalizeColor("vintage"), null);
 assert.equal(normalizeColor(""), null);
 assert.equal(normalizeColor(null), null);
 assert.equal(normalizeColor(undefined), null);
});
