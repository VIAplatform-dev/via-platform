import test from "node:test";
import assert from "node:assert/strict";
import { coerceLayout, layoutFromLabels, layoutInstruction, DEFAULT_LAYOUT, SECTIONS, SPEC } from "./description-layout.ts";

test("the seller's order is the order, whatever it is", () => {
 // Measurements first, size second, era third, prose fourth. Unusual, and entirely hers to choose.
 const ins = layoutInstruction([
  { key: "measurements", label: "Measurements" },
  { key: "size", label: "Size" },
  { key: "era", label: "Era" },
  { key: "description", label: "Description" },
 ]);
 const order = ["Measurements", "Size", "Era", "Description"].map((l) => ins.indexOf(`"${l}"`));
 assert.deepEqual([...order].sort((a, b) => a - b), order, "the prompt lists them in her order");
 assert.ok(ins.includes('1. "Measurements"'));
 assert.ok(ins.includes('4. "Description"'));
});

test("her own wording for a heading survives", () => {
 // One real shop heads its opening paragraph "the situation". Replacing that with "Description"
 // would be us correcting her.
 const ins = layoutInstruction([{ key: "description", label: "the situation" }, { key: "size", label: "Size" }]);
 assert.ok(ins.includes('"the situation"'));
 assert.ok(ins.includes("spelled and capitalised exactly as given"));
});

test("prose at the top is written without a label in front of it", () => {
 const withProse = layoutInstruction([{ key: "description", label: "Description" }, { key: "era", label: "Era" }]);
 assert.ok(withProse.includes("WITHOUT a label in front of it"));
 // But if she puts something else first, every section is labelled, prose included.
 const measuredFirst = layoutInstruction([{ key: "measurements", label: "Measurements" }, { key: "description", label: "Description" }]);
 assert.equal(measuredFirst.includes("WITHOUT a label"), false);
});

test("a section only she can fill comes back empty, not invented and not dropped", () => {
 const ins = layoutInstruction([{ key: "description", label: "Description" }, { key: "measurements", label: "Measurements (laid flat)" }]);
 assert.ok(ins.includes("THE SELLER FILLS THIS"), "measurements are hers to take");
 assert.ok(ins.includes("do not drop one that is"));
 assert.ok(ins.includes("Never invent a value"));
 // And the ones VYA can do are marked the other way, or it leaves everything blank.
 assert.ok(ins.includes("you fill this from the photos"));
 assert.ok(ins.includes("FILL EVERY SECTION YOU CAN"));
});

test("the layout overrides the house rules it contradicts", () => {
 const ins = layoutInstruction(DEFAULT_LAYOUT, 106);
 assert.ok(ins.includes("DO NOT APPLY"));
 assert.ok(ins.includes("2-3 sentences") && ins.includes("40-80 words"));
 assert.ok(ins.includes("about 106 words"));
});

test("an empty layout says nothing, leaving the house rules in charge", () => {
 assert.equal(layoutInstruction([]), "");
 assert.equal(layoutInstruction(coerceLayout("nonsense")), "");
});

test("a section VYA cannot fill is never silently dropped from the prompt", () => {
 // Every catalogued section has to be expressible, or turning it on in settings does nothing.
 for (const s of SECTIONS) {
  const ins = layoutInstruction([{ key: s.key, label: s.label, hint: "something" }]);
  assert.ok(ins.includes(`"${s.label}"`), `${s.key} must reach the prompt`);
 }
});

test("junk off the wire cannot put a blank line in every listing", () => {
 const out = coerceLayout([
  { key: "description", label: "Description" },
  { key: "not-a-section", label: "Nope" },   // unknown key
  { key: "era" },                            // no label: falls back to ours
  { key: "era", label: "Era again" },        // repeat: dropped
  "rubbish",
 ]);
 assert.deepEqual(out.map((s) => s.key), ["description", "era"]);
 assert.equal(out[1].label, "Era", "a missing label falls back rather than rendering empty");
});

test("two custom sections are allowed, two of anything else are not", () => {
 // A shop with two things of its own to say is ordinary. Two "Condition" lines is a mistake.
 const out = coerceLayout([
  { key: "custom", label: "Styling", hint: "how to wear it" },
  { key: "custom", label: "Provenance", hint: "where it came from" },
  { key: "custom", label: "styling" }, // same label, different case: still the same section
 ]);
 assert.equal(out.length, 2);
 assert.deepEqual(out.map((s) => s.label), ["Styling", "Provenance"]);
});

test("a custom section tells the drafter what goes in it", () => {
 const ins = layoutInstruction([{ key: "custom", label: "Styling", hint: "two ways to wear it" }]);
 assert.ok(ins.includes("two ways to wear it"), "her hint is what the model is told to write");
});

test("labels and hints are capped so one field can't run away with the prompt", () => {
 const out = coerceLayout([{ key: "custom", label: "x".repeat(200), hint: "y".repeat(500) }]);
 assert.equal(out[0].label.length, 60);
 assert.equal(out[0].hint!.length, 200);
 assert.ok(coerceLayout(Array(40).fill({ key: "custom", label: "a" })).length <= 14);
});

test("a shop's learned format seeds the editor in its own words", () => {
 // She opens the screen and finds her own format already in it, not a blank slate.
 const out = layoutFromLabels(["Era", "Material", "Condition", "Fit", "Measurements (laid flat)"]);
 assert.deepEqual(out.map((s) => s.key), ["description", "era", "material", "condition", "fit", "measurements"]);
 assert.equal(out[5].label, "Measurements (laid flat)", "her exact heading, brackets and all");
 // The prose is prepended, because a template that starts at "Era:" still opens with a paragraph.
 assert.equal(out[0].key, "description");
});

test("an unrecognised heading becomes her own section rather than being thrown away", () => {
 const out = layoutFromLabels(["Note to vintage collectors", "Condition"]);
 assert.equal(out.find((s) => s.label === "Note to vintage collectors")?.key, "custom");
 assert.equal(out.find((s) => s.label === "Condition")?.key, "condition");
});

test("a labelled opener is recognised rather than duplicated", () => {
 // "the situation" IS her description. Prepending another one would give her two.
 const out = layoutFromLabels(["the situation", "measurements (lay flat)"]);
 assert.equal(out.filter((s) => s.key === "description").length, 1);
 assert.equal(out[0].label, "the situation");
});

test("every catalogued section says who fills it", () => {
 for (const s of SECTIONS) {
  assert.ok(s.blurb.length > 10, `${s.key} needs a blurb a seller can read`);
  assert.ok(s.filledBy === "vya" || s.filledBy === "seller");
  assert.equal(SPEC[s.key], s, "the lookup and the list agree");
 }
 // The ones a photograph genuinely cannot answer.
 assert.equal(SPEC.measurements.filledBy, "seller");
 assert.equal(SPEC.model.filledBy, "seller");
 assert.equal(SPEC.condition.filledBy, "vya");
});

test("a section of her own that says what goes in it gets written, not left blank", () => {
 // "Styling: one way to wear it" came back as an empty label, because every custom section was
 // treated as hers to fill. A hint IS the instruction, so it is something VYA can write.
 const told = layoutInstruction([{ key: "custom", label: "Styling", hint: "one way to wear it" }]);
 assert.ok(told.includes("you fill this from the photos"), "a hinted section is VYA's to write");
 assert.equal(told.includes("THE SELLER FILLS THIS"), false);
 // With nothing said about what goes in it, it stays hers.
 const untold = layoutInstruction([{ key: "custom", label: "Provenance" }]);
 assert.ok(untold.includes("THE SELLER FILLS THIS"));
});

test("the spacing is stated, because a new store has no listings to copy it from", () => {
 // Given no examples, a model puts a blank line between every section and the listing reads like a
 // form. A store setting a layout on day one is exactly the store with no examples.
 const ins = layoutInstruction([{ key: "description", label: "Description" }, { key: "era", label: "Era" }, { key: "size", label: "Size" }]);
 // And "no blank lines anywhere" is the wrong correction: a paragraph wants air around it. The rule
 // is the one every templated shop already follows.
 assert.ok(ins.includes("CONSECUTIVE lines as ONE block with NO blank line between them"));
 assert.ok(ins.includes("blank line only around a section whose value runs to a full sentence"));
 const noProse = layoutInstruction([{ key: "measurements", label: "Measurements" }, { key: "size", label: "Size" }]);
 assert.ok(noProse.includes("CONSECUTIVE lines"));
});

test("a measurements block keeps its label above its values", () => {
 const ins = layoutInstruction([{ key: "measurements", label: "Measurements (laid flat)" }]);
 assert.ok(ins.includes("keeps its label on one line and its values on the lines beneath it"));
});
