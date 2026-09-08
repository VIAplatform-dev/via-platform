import { test } from "node:test";
import assert from "node:assert/strict";
import { templateFor, unitFor, normalizeMeasurements, formatMeasurement, formatMeasurements, measurementLabel, MEASUREMENT_KEYS } from "./measurements-core.ts";

test("templates follow the category: what a buyer needs to know she can wear it", () => {
 assert.deepEqual(templateFor("tops"), ["pitToPit", "shoulder", "sleeve", "length"]);
 assert.deepEqual(templateFor("sweaters"), ["pitToPit", "shoulder", "sleeve", "length"]);
 assert.deepEqual(templateFor("coats-jackets"), ["pitToPit", "shoulder", "sleeve", "length"]);
 assert.deepEqual(templateFor("dresses"), ["pitToPit", "waist", "hip", "length"]);
 assert.deepEqual(templateFor("jumpsuits"), ["pitToPit", "waist", "hip", "length"]);
 assert.deepEqual(templateFor("pants"), ["waist", "hip", "rise", "inseam"]);
 assert.deepEqual(templateFor("jeans"), ["waist", "hip", "rise", "inseam"]);
 assert.deepEqual(templateFor("shorts"), ["waist", "hip", "rise", "inseam"]);
 assert.deepEqual(templateFor("skirts"), ["waist", "hip", "length"]);
 assert.deepEqual(templateFor("boots"), ["insole"]);
 assert.deepEqual(templateFor("heels"), ["insole"]);
 assert.deepEqual(templateFor("handbags"), ["width", "height", "depth", "strapDrop"]);
 assert.deepEqual(templateFor("totes"), ["width", "height", "depth", "strapDrop"]);
});

test("free-text categories fold onto the taxonomy first; nothing recognisable gets the generic pair", () => {
 assert.deepEqual(templateFor("Jacket"), ["pitToPit", "shoulder", "sleeve", "length"]);
 assert.deepEqual(templateFor("knitwear"), ["pitToPit", "shoulder", "sleeve", "length"]);
 assert.deepEqual(templateFor("scarves"), ["length", "width"]);
 assert.deepEqual(templateFor("jewelry"), []);
 assert.deepEqual(templateFor(null), ["length", "width"]);
});

test("the unit follows the ship-from country, then the currency; explicit and never guessed twice", () => {
 assert.equal(unitFor({ country: "US" }), "in");
 assert.equal(unitFor({ country: "GB" }), "cm");
 assert.equal(unitFor({ country: "FR", currency: "USD" }), "cm");
 assert.equal(unitFor({ currency: "USD" }), "in");
 assert.equal(unitFor({ currency: "GBP" }), "cm");
 assert.equal(unitFor({}), "cm");
});

test("normalising keeps only known keys with a positive number; empties are omitted, not stored as zero", () => {
 const out = normalizeMeasurements([
  { key: "pitToPit", value: 48 },
  { key: "length", value: "62.5" },
  { key: "shoulder", value: "" },
  { key: "sleeve", value: null },
  { key: "bogus", value: 12 },
  { key: "waist", value: -3 },
  { key: "hip", value: "abc" },
 ], "cm");
 assert.deepEqual(out, [{ key: "pitToPit", value: 48, unit: "cm" }, { key: "length", value: 62.5, unit: "cm" }]);
});

test("an entry's own unit wins over the store default, and junk input is an empty list", () => {
 assert.deepEqual(normalizeMeasurements([{ key: "insole", value: 10.5, unit: "in" }], "cm"), [{ key: "insole", value: 10.5, unit: "in" }]);
 assert.deepEqual(normalizeMeasurements("nope", "cm"), []);
 assert.deepEqual(normalizeMeasurements(null, "cm"), []);
});

test("values are rounded to a tenth and capped: nobody measures a hem to the micron or at three metres", () => {
 assert.deepEqual(normalizeMeasurements([{ key: "length", value: 62.456 }], "cm"), [{ key: "length", value: 62.5, unit: "cm" }]);
 assert.deepEqual(normalizeMeasurements([{ key: "length", value: 400 }], "cm"), []);
 assert.deepEqual(normalizeMeasurements([{ key: "length", value: 120 }], "in"), []);
});

test("a duplicate key keeps the first entry", () => {
 assert.deepEqual(normalizeMeasurements([{ key: "waist", value: 70 }, { key: "waist", value: 72 }], "cm"), [{ key: "waist", value: 70, unit: "cm" }]);
});

test("formatting reads like a label on a rail", () => {
 assert.equal(formatMeasurement({ key: "pitToPit", value: 48, unit: "cm" }), "Pit to pit 48 cm");
 assert.equal(formatMeasurement({ key: "insole", value: 10.5, unit: "in" }), "Insole 10.5\"");
 assert.equal(formatMeasurement({ key: "strapDrop", value: 22, unit: "cm" }), "Strap drop 22 cm");
 assert.equal(formatMeasurements([{ key: "waist", value: 70, unit: "cm" }, { key: "length", value: 62, unit: "cm" }]), "Waist 70 cm · Length 62 cm");
 assert.equal(formatMeasurements([]), "");
});

test("every key has a label", () => {
 for (const k of MEASUREMENT_KEYS) assert.ok(measurementLabel(k), k);
});
