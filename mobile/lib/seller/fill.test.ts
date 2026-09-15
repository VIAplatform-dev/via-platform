import { test } from "node:test";
import assert from "node:assert/strict";
import { fillBlanks, fillSummary, fillDraftBlanks, describeFilled } from "./fill.ts";
import type { DraftFields } from "./intake-shape.ts";
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

// ── the new-piece flow's shape ────────────────────────────────────────────────

test("fillDraftBlanks writes only into blanks", () => {
  const draft: DraftFields = { brand: "Fendi", era: "1990s", material: "Zucca canvas", title: "Fendi baguette" };
  const { fields, filled } = fillDraftBlanks(draft, { brand: "Fendi Roma", title: "" });
  // Hers stands, whatever the model thinks.
  assert.equal(fields.brand, "Fendi Roma");
  assert.ok(!filled.includes("brand"));
  // The blanks get the answer.
  assert.equal(fields.title, "Fendi baguette");
  assert.equal(fields.era, "1990s");
  assert.deepEqual(filled.sort(), ["era", "material", "title"]);
});

test("fillDraftBlanks leaves a field the model cannot read", () => {
  const { fields, filled } = fillDraftBlanks({ material: "Unknown", size: "N/A", colour: "  " }, {});
  assert.equal(fields.material, undefined);
  assert.equal(fields.size, undefined);
  assert.equal(fields.colour, undefined);
  assert.deepEqual(filled, []);
});

test("flaws she named are not added to", () => {
  const mine: DraftFields = { flaws: ["small mark to the hem"] };
  const { fields, filled } = fillDraftBlanks({ flaws: ["scuffed toe", "light pilling"] }, mine);
  assert.deepEqual(fields.flaws, ["small mark to the hem"]);
  assert.ok(!filled.includes("flaws"));
  // …but an empty list is a blank.
  const empty = fillDraftBlanks({ flaws: ["scuffed toe"] }, { flaws: [] });
  assert.deepEqual(empty.fields.flaws, ["scuffed toe"]);
  assert.ok(empty.filled.includes("flaws"));
});

test("a weight she typed outranks the model's parcel", () => {
  const parcel = { weightOz: 40, lengthIn: 12 };
  assert.equal(fillDraftBlanks({ parcel }, { weightOz: "18" }).fields.parcel, undefined);
  // And a parcel already on the draft is not replaced.
  const had = { weightOz: 9 };
  assert.deepEqual(fillDraftBlanks({ parcel }, { parcel: had }).fields.parcel, had);
  // A piece with neither takes it.
  const got = fillDraftBlanks({ parcel }, {});
  assert.deepEqual(got.fields.parcel, parcel);
  assert.ok(got.filled.includes("weight"));
});

test("what she is told was filled", () => {
  assert.match(describeFilled([]), /Nothing left to fill/);
  assert.equal(describeFilled(["brand"]), "Filled brand. Nothing you had written was changed.");
  assert.equal(describeFilled(["brand", "era"]), "Filled brand and era. Nothing you had written was changed.");
  assert.equal(describeFilled(["brand", "era", "size"]), "Filled brand, era and 1 more. Nothing you had written was changed.");
  // The keys are not the words on the rows.
  assert.match(describeFilled(["colour", "conditionNote", "weight"]), /^Filled colour, condition note and 1 more\./);
});
