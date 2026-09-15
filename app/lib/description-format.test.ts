import test from "node:test";
import assert from "node:assert/strict";
import { stripHtml, sectionLabels, detectTemplate, templateInstruction } from "./description-format.ts";

// One real listing, exactly as an imported catalogue stores it.
const SCOTTIE = `<p>Dolce &amp; Gabbana Beachwear yellow cotton t-shirt dress with the "Sicilia I love you" graphic printed across the front. Crew neckline, cap sleeves, straight silhouette. Made in Italy.</p><p><strong>Era:</strong> 2007<br><strong>Material:</strong> 100% cotton<br><strong>Condition:</strong> Excellent.<br><strong>Fit:</strong> Labeled IT 42 (USA M).</p><p><strong>Measurements (laid flat):</strong><br>Bust: 48 cm / 18.9 in<br>Waist: 42 cm / 16.5 in</p><p>Model is 5'6" and usually wears a size M.</p><p>Sourced in Milan, Italy. Shipping from Washington, DC.</p>`;

const listing = (era: string, mat: string) =>
 `<p>A piece, described in a sentence.</p><p><strong>Era:</strong> ${era}<br><strong>Material:</strong> ${mat}<br><strong>Condition:</strong> Excellent.<br><strong>Fit:</strong> Runs small.</p><p><strong>Measurements (laid flat):</strong><br>Bust: 40 cm</p><p>Sourced in Milan, Italy.</p>`;

test("the line breaks that ARE the template survive the HTML", () => {
 // This is the whole bug. <br> became a space and \s+ collapsed the lot, so a five-section template
 // reached the voice learner as one run-on line and came back described as a paragraph.
 const out = stripHtml(SCOTTIE);
 const lines = out.split("\n").filter(Boolean);
 assert.ok(lines.length >= 8, `expected the sections to stay on their own lines, got ${lines.length}`);
 assert.ok(out.includes("\nEra: 2007"), "Era must open its own line");
 assert.ok(out.includes("\nMaterial: 100% cotton"), "Material must open its own line");
 assert.ok(out.includes("\nBust: 48 cm / 18.9 in"), "each measurement keeps its line");
 // The blank line between sections is part of the shape.
 assert.ok(/Made in Italy\.\n\nEra:/.test(out), "the gap between the opener and the labels stays");
});

test("entities decode and tags leave nothing behind", () => {
 assert.ok(stripHtml(SCOTTIE).startsWith("Dolce & Gabbana"), "&amp; decodes");
 assert.equal(/<[^>]+>|&[a-z]+;/i.test(stripHtml(SCOTTIE)), false, "no markup survives");
 assert.ok(stripHtml(SCOTTIE).includes('"Sicilia I love you"'), "the quotes in their copy stay");
});

test("runs of blank lines collapse to one", () => {
 assert.equal(stripHtml("<p>a</p><p></p><p></p><p>b</p>"), "a\n\nb");
});

test("the labelled sections are read in the order the store writes them", () => {
 assert.deepEqual(sectionLabels(SCOTTIE), ["Era", "Material", "Condition", "Fit", "Measurements (laid flat)", "Bust", "Waist"]);
});

test("a sentence with a colon in it is not a section label", () => {
 // "Sourced in Milan, Italy. Shipping from Washington, DC." must never be read as a label, and
 // neither must a long lead-in that happens to use a colon.
 assert.deepEqual(sectionLabels("<p>One thing I will say about this piece: it is lovely.</p>"), []);
});

test("a template is detected from a store's own listings", () => {
 const t = detectTemplate([listing("2007", "cotton"), listing("1990s", "silk"), listing("Y2K", "nylon"), listing("2000s", "wool")]);
 assert.equal(t.templated, true);
 // In their order, not ours.
 assert.deepEqual(t.labels.slice(0, 5), ["Era", "Material", "Condition", "Fit", "Measurements (laid flat)"]);
 assert.ok(t.medianWords > 20, "the real length is measured, not assumed");
});

test("a shop that writes freehand is left alone", () => {
 // No template means the house rules stay in charge, which is what a freehand shop wants.
 const t = detectTemplate([
  "<p>A beautiful silk slip, the kind you wear to dinner and never take off.</p>",
  "<p>This coat has lived a life. Wear it hard.</p>",
  "<p>Softest knit we have had in months, and the colour is perfect.</p>",
  "<p>A little bag that holds more than it looks like it should.</p>",
 ]);
 assert.equal(t.templated, false);
 assert.deepEqual(t.labels, []);
 assert.equal(templateInstruction(t), "", "no template means no instruction, and no override");
});

test("a label one seller used once is not the store's template", () => {
 // "Condition:" on the one piece that had a flaw is not a section. The 60% floor is what separates
 // a template from a coincidence.
 const plain = "<p>Just a nice piece, no labels here at all.</p>";
 const t = detectTemplate([plain, plain, plain, "<p>A piece.</p><p>Condition: some pilling</p>"]);
 assert.equal(t.labels.includes("Condition"), false);
});

test("the instruction overrides the house rules the template contradicts", () => {
 const t = detectTemplate([listing("2007", "cotton"), listing("1990s", "silk"), listing("Y2K", "nylon")]);
 const ins = templateInstruction(t);
 // Without this the model blends two contradictory briefs and the template comes back a paragraph.
 assert.ok(ins.includes("DO NOT APPLY"), "the 2-3 sentence rule has to be switched off by name");
 assert.ok(ins.includes("2-3 sentences") && ins.includes("40-80 words"), "named exactly as written above it");
 assert.ok(ins.includes('"Era:"') && ins.includes('"Measurements (laid flat):"'), "their labels, quoted");
 assert.ok(/\babout \d+ words\b/.test(ins), "their real length");
});

test("an unmeasurable section is kept and left blank, never dropped or invented", () => {
 // The template asks for measurements; the model cannot measure from a photo and is banned from
 // inventing. Told only that, it quietly deletes the block and the template stops being one.
 const ins = templateInstruction(detectTemplate([listing("2007", "cotton"), listing("1990s", "silk"), listing("Y2K", "nylon")]));
 assert.ok(ins.includes("KEEPS ITS LABEL AND IS LEFT EMPTY"));
 assert.ok(ins.includes("Never delete a section, never reorder them, and never invent a value"));
 // And the other way: told only "leave what you can't see blank", it left EVERY section blank,
 // including era and condition it had already worked out for the fields next door.
 assert.ok(ins.includes("FILL EVERY SECTION YOU CAN"));
 assert.ok(ins.includes("every section empty is a failed draft"));
});

test("the template is asked for with the store's own spacing", () => {
 // Handed examples with no blank lines, a model still put a gap between every labelled section.
 // Everything on VYA is stored gap-free (storedShape), so the instruction says so outright.
 const ins = templateInstruction(detectTemplate([listing("2007", "cotton"), listing("1990s", "silk"), listing("Y2K", "nylon")]));
 assert.ok(ins.includes("spacing"), "the examples carry the spacing; the instruction says to keep it");
});
