import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTargetSection, type SectionRect } from "./storefront-target-section.ts";

// The canvas viewport, in the same client coordinates getBoundingClientRect reports.
const VIEW = { top: 100, bottom: 700 }; // 600px tall

const sec = (id: string, top: number, bottom: number): SectionRect => ({ id, top, bottom });

test("an element goes to the section you selected", () => {
 const sections = [sec("hero", 100, 400), sec("featured", 400, 700)];
 assert.equal(pickTargetSection(VIEW, sections, "featured"), "featured");
 assert.equal(pickTargetSection(VIEW, sections, "hero"), "hero");
});

test("a selection you have scrolled past does not capture the element", () => {
 // "sometimes if i try and add a text box to certain sections, it adds to the section next to it":
 // `columns` is selected but only a 4px sliver of it is still on screen, and `featured` fills the
 // rest. Any-overlap-at-all counted as "on screen", so the sliver kept winning.
 const sections = [sec("columns", -200, 104), sec("featured", 104, 700)];
 assert.equal(pickTargetSection(VIEW, sections, "columns"), "featured");
});

test("a small section that is fully visible keeps the element even when a taller one shows more", () => {
 // A 60px strip selected and entirely on screen is unambiguously the thing being worked on, even
 // though the hero below it covers nine times as much of the canvas.
 const sections = [sec("strip", 100, 160), sec("hero", 160, 700)];
 assert.equal(pickTargetSection(VIEW, sections, "strip"), "strip");
});

test("a tall section you are scrolled into the middle of keeps the element", () => {
 // Only 40% of the hero is on screen, but it fills the whole canvas — you are looking at nothing else.
 const sections = [sec("hero", -800, 900)];
 assert.equal(pickTargetSection(VIEW, sections, "hero"), "hero");
});

test("with nothing selected the element goes to the section filling most of the canvas", () => {
 const sections = [sec("columns", -200, 250), sec("featured", 250, 700)];
 assert.equal(pickTargetSection(VIEW, sections, null), "featured");
});

test("a selection on another page is ignored", () => {
 const sections = [sec("columns", 100, 700)];
 assert.equal(pickTargetSection(VIEW, sections, "a-block-from-the-shop-page"), "columns");
});

test("a selection scrolled entirely out of view still wins when nothing else is visible", () => {
 // Falls back rather than dropping the element somewhere arbitrary.
 const sections = [sec("hero", -900, -300), sec("featured", -300, 0)];
 assert.equal(pickTargetSection(VIEW, sections, "hero"), "hero");
});

test("with no selection and nothing visible the element goes to the last section", () => {
 const sections = [sec("hero", -900, -300), sec("featured", -300, 0)];
 assert.equal(pickTargetSection(VIEW, sections, null), "featured");
});

test("a page with no sections has no target", () => {
 assert.equal(pickTargetSection(VIEW, [], null), null);
 assert.equal(pickTargetSection(VIEW, [], "hero"), null);
});

test("a zero-height canvas does not throw or divide by zero", () => {
 const sections = [sec("hero", 100, 400)];
 assert.equal(pickTargetSection({ top: 100, bottom: 100 }, sections, "hero"), "hero");
});
