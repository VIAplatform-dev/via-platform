import { test } from "node:test";
import assert from "node:assert/strict";
import { fillBlanks, fillSummary } from "./fill.ts";
import type { FieldKey } from "./listing-fields.ts";

/** A piece where only the listed fields have anything in them. */
const piece = (have: Partial<Record<FieldKey, string>>) => (key: FieldKey) => have[key] ?? "";

const FULL_DRAFT = {
  title: "Prada Re-Nylon shoulder bag",
  brand: "Prada",
  era: "Late 1990s",
  material: "Re-Nylon",
  colour: "Black",
  size: "One size",
  category: "handbags",
  condition: "Very good",
  conditionNote: "light wear to the base corners",
  description: "The nylon one everybody wanted.",
  flaws: ["scuffed corner", "faint mark inside"],
  parcel: { weightOz: 22, lengthIn: 9, widthIn: 12, heightIn: 2 },
};

test("an empty piece is filled from the draft, flaws as a line and the parcel as numbers", () => {
  const { values, filled, parcelFilled } = fillBlanks(FULL_DRAFT, piece({}));
  assert.equal(values.title, "Prada Re-Nylon shoulder bag");
  assert.equal(values.category, "handbags");
  assert.equal(values.conditionNote, "light wear to the base corners");
  assert.equal(values.flaws, "scuffed corner, faint mark inside");
  assert.equal(values.weightOz, "22");
  assert.equal(values.lengthIn, "9");
  assert.equal(parcelFilled, true);
  assert.equal(filled.length, 15);
});

// THE ONE THAT MATTERS. Everything else here is convenience; this is the promise the button makes.
test("nothing the seller wrote is ever replaced", () => {
  const hers = {
    title: "THE bag",
    brand: "Prada (Milano)",
    era: "1998",
    material: "nylon",
    colour: "black",
    size: "OS",
    category: "bags",
    condition: "Good",
    conditionNote: "corner rubbed, see photo 4",
    description: "Mine since 2004.",
    flaws: "corner",
    weightOz: "30",
    lengthIn: "10",
    widthIn: "13",
    heightIn: "3",
  };
  const { values, filled } = fillBlanks(FULL_DRAFT, piece(hers));
  assert.deepEqual(values, {});
  assert.deepEqual(filled, []);
});

test("a half-written piece keeps its half", () => {
  const { values, filled } = fillBlanks(FULL_DRAFT, piece({ brand: "Prada", price: "480", title: "  " }));
  // A field holding only spaces is blank, not written.
  assert.equal(values.title, "Prada Re-Nylon shoulder bag");
  assert.equal(values.brand, undefined);
  assert.ok(!filled.includes("brand"));
  assert.ok(filled.includes("description"));
});

test("the model saying it cannot tell is not an answer", () => {
  const { values, filled, parcelFilled } = fillBlanks(
    { brand: "N/A", era: "Unknown", material: "  ", colour: "None", description: "Not sure", title: "Silk scarf" },
    piece({}),
  );
  assert.deepEqual(values, { title: "Silk scarf" });
  assert.deepEqual(filled, ["title"]);
  assert.equal(parcelFilled, false);
});

test("a draft with nothing in it writes nothing", () => {
  const { values, filled, parcelFilled } = fillBlanks({}, piece({}));
  assert.deepEqual(values, {});
  assert.deepEqual(filled, []);
  assert.equal(parcelFilled, false);
});

test("a parcel with only a weight still counts as the parcel", () => {
  const { values, parcelFilled } = fillBlanks({ parcel: { weightOz: 14 } }, piece({}));
  assert.deepEqual(values, { weightOz: "14" });
  assert.equal(parcelFilled, true);
});

test("what it says it did", () => {
  assert.match(fillSummary([]), /Nothing left to fill/);
  assert.match(fillSummary(["brand"]), /Filled 1 empty field\./);
  assert.match(fillSummary(["brand", "era"]), /Filled 2 empty fields\./);
  assert.match(fillSummary(["brand", "era"]), /Nothing you had written was changed/);
});
