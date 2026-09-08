import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFlaws, flawsFromText, flawsToText } from "./flaws-core.ts";

test("flaws are trimmed, blanks dropped, duplicates collapsed", () => {
 assert.deepEqual(normalizeFlaws(["  light pilling at cuffs ", "", "scuffed toe", "light pilling at cuffs", "Scuffed Toe"]), ["light pilling at cuffs", "scuffed toe"]);
});

test("anything that is not a list of strings is no flaws at all", () => {
 assert.deepEqual(normalizeFlaws(null), []);
 assert.deepEqual(normalizeFlaws("scuffed"), []);
 assert.deepEqual(normalizeFlaws([1, { a: 1 }, null]), []);
});

test("at most 12 flaws, each at most 140 characters", () => {
 const many = Array.from({ length: 20 }, (_, i) => `flaw ${i}`);
 assert.equal(normalizeFlaws(many).length, 12);
 const long = "x".repeat(200);
 assert.equal(normalizeFlaws([long])[0].length, 140);
});

test("a flaw that merely repeats the condition word is not a flaw", () => {
 // The AI sometimes echoes the grade back ("Good", "very good condition") — that's the condition
 // field's job, and printing it twice under a Flaws heading reads as a defect that isn't there.
 assert.deepEqual(normalizeFlaws(["Good", "good condition", "scuffed heel"], "Good"), ["scuffed heel"]);
 assert.deepEqual(normalizeFlaws(["Very good"], "Very Good"), []);
 assert.deepEqual(normalizeFlaws(["none", "No visible flaws", "n/a"], null), []);
});

test("text round-trips one flaw per line (or comma-separated) for the editors", () => {
 assert.deepEqual(flawsFromText("scuffed toe\n light pilling \n\n"), ["scuffed toe", "light pilling"]);
 assert.deepEqual(flawsFromText("scuffed toe, light pilling"), ["scuffed toe", "light pilling"]);
 assert.equal(flawsToText(["scuffed toe", "light pilling"]), "scuffed toe\nlight pilling");
 assert.equal(flawsToText([]), "");
});
