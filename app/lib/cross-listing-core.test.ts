import { test } from "node:test";
import assert from "node:assert/strict";
import { crossPostContent, flawsLine, measurementsLine } from "./cross-listing-core.ts";

const coat = {
 title: "Wool coat", brand: "Margiela", condition: "Very good", size: "IT 44", category: "coats-jackets", priceCents: 42_000,
 description: "Heavy wool, 1990s.",
 flaws: ["small mark inside collar", "one loose button"],
 measurementsJson: [{ key: "pitToPit", value: 52, unit: "cm" as const }, { key: "length", value: 80, unit: "cm" as const }],
};

test("the payload description carries the flaws and the measurements, each on its own line", () => {
 const { body } = crossPostContent(coat, "ebay");
 assert.equal(body, "Heavy wool, 1990s.\n\nFlaws: small mark inside collar; one loose button\nMeasurements: Pit to pit 52 cm · Length 80 cm");
});

test("on a hashtag feed the detail lines sit between the prose and the tags", () => {
 const { body } = crossPostContent(coat, "depop");
 const [prose, detail, tags] = body.split("\n\n");
 assert.equal(prose, "Heavy wool, 1990s.");
 assert.match(detail, /^Flaws: .*\nMeasurements: /);
 assert.match(tags, /^#margiela /);
});

test("a piece with neither prints exactly what it always did", () => {
 const { body } = crossPostContent({ title: "Silk scarf", priceCents: 4_000, description: "Printed silk." }, "ebay");
 assert.equal(body, "Printed silk.");
 assert.equal(flawsLine([]), null);
 assert.equal(flawsLine(null), null);
 assert.equal(measurementsLine(null, null), null);
});

test("the old free-text measurements are printed when there is no list; junk in the flaws list is skipped", () => {
 assert.equal(measurementsLine([], 'Chest 20"'), 'Measurements: Chest 20"');
 assert.equal(measurementsLine([{ key: "insole", value: 10.5, unit: "in" }], "ignored"), 'Measurements: Insole 10.5"');
 assert.equal(flawsLine([" scuffed toe ", 3, "", null]), "Flaws: scuffed toe");
});
