import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMeasurements } from "./measurements.ts";

test("extracts measurements from a bullet-list description (the Reiss case)", () => {
 const html = `<ul><li>100% Viscose</li><li>Bust 33''</li><li>Waist 25''</li><li>Sleeve length 24.5''</li><li>Shoulder to hem 35''</li></ul>`;
 const out = extractMeasurements(html);
 assert.equal(out, `Bust 33" · Waist 25" · Sleeve 24.5" · Length 35"`);
});

test("handles Measurements: prose with mixed units + fractions", () => {
 assert.equal(extractMeasurements("Measurements: Pit to pit 20 in, Waist 17\", Length 34 1/2 inches"), `Pit to pit 20" · Waist 17" · Length 34.5"`);
 assert.equal(extractMeasurements("Chest 42cm, sleeve 24cm"), `Bust 42 cm · Sleeve 24 cm`);
});

test("does not invent measurements from unrelated copy", () => {
 assert.equal(extractMeasurements("This dress is gorgeous and flattering. Est. 2007. Ships in 5 days."), null);
 assert.equal(extractMeasurements("Only 1 width available."), null); // lone ambiguous label → no output
 assert.equal(extractMeasurements(null), null);
});

test("rejects out-of-range numbers (prices, years)", () => {
 assert.equal(extractMeasurements("Waist 2800 (price in cents)"), null);
});

test("extracts footwear measurements (heel height, filler words)", () => {
 assert.equal(extractMeasurements(`Heel height measures approx. 3.25". Peep toe d'orsay.`), `Heel 3.25"`);
 assert.equal(extractMeasurements("Boot shaft 14 in, calf circumference 15 inches, heel 2\""), `Shaft 14" · Calf 15" · Heel 2"`);
});

test("does not treat a size as a measurement", () => {
 assert.equal(extractMeasurements("Size medium — recommended to fit US 4-6."), null);
 assert.equal(extractMeasurements("Recommended to fit size US 7 (EU 37.5)."), null);
});
