import { test } from "node:test";
import assert from "node:assert/strict";
import { templateFor, unitFor, measurementsFromForm, measurementsToForm, formatMeasurements } from "./measurements.ts";

test("templates by category, matched on the words the intake uses", () => {
  assert.deepEqual(templateFor("coats-jackets"), ["pitToPit", "shoulder", "sleeve", "length"]);
  assert.deepEqual(templateFor("Knitwear"), ["pitToPit", "shoulder", "sleeve", "length"]);
  assert.deepEqual(templateFor("dresses"), ["pitToPit", "waist", "hip", "length"]);
  assert.deepEqual(templateFor("jeans"), ["waist", "hip", "rise", "inseam"]);
  assert.deepEqual(templateFor("skirts"), ["waist", "hip", "length"]);
  assert.deepEqual(templateFor("shoes"), ["insole"]);
  assert.deepEqual(templateFor("handbags"), ["width", "height", "depth", "strapDrop"]);
  assert.deepEqual(templateFor("jewelry"), []);
  assert.deepEqual(templateFor(null), ["length", "width"]);
});

test("the unit follows the ship-from country, then the currency", () => {
  assert.equal(unitFor({ country: "US" }), "in");
  assert.equal(unitFor({ country: "GB", currency: "USD" }), "cm");
  assert.equal(unitFor({ currency: "USD" }), "in");
  assert.equal(unitFor({}), "cm");
});

test("blank fields are omitted, numbers are rounded to a tenth, and the line reads like a label", () => {
  const list = measurementsFromForm({ pitToPit: "48", length: "62.46", shoulder: "", sleeve: "abc" }, "cm");
  assert.deepEqual(list, [{ key: "pitToPit", value: 48, unit: "cm" }, { key: "length", value: 62.5, unit: "cm" }]);
  assert.equal(formatMeasurements(list), "Pit to pit 48 cm · Length 62.5 cm");
  assert.equal(formatMeasurements([{ key: "insole", value: 10.5, unit: "in" }]), "Insole 10.5\"");
  assert.equal(formatMeasurements([]), "");
});

test("a stored list opens as the template's strings, and round-trips", () => {
  const stored = [{ key: "pitToPit" as const, value: 48, unit: "cm" as const }, { key: "length" as const, value: 62.5, unit: "cm" as const }];
  assert.deepEqual(measurementsToForm(stored), { pitToPit: "48", length: "62.5" });
  assert.deepEqual(measurementsToForm(null), {});
  assert.deepEqual(measurementsToForm(undefined), {});
  assert.deepEqual(measurementsFromForm(measurementsToForm(stored), "cm"), stored);
});
