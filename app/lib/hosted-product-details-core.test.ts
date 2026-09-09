import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { hostedProductDetails, renderHostedDetailsHtml } from "./hosted-product-details-core.ts";
import { conditionDefinition } from "./condition-core.ts";

// The words a shopper reads on a hosted product page must be the words the classic product page
// prints (app/s/[handle]/p/[id]/page.tsx) — same cores, same order of reading: the size line and
// the measurements under it, the grade with its meaning and the seller's note, the flaws, and where
// it ships.

const FULL = {
 title: "Plein Sud 1990s wool coat",
 size: "IT 44",
 category: "coats-jackets",
 description: "A heavy coat. Runs true to a US 8.",
 currency: "GBP",
 condition: "Very good",
 conditionNote: "light wear at the cuffs",
 flaws: ["small mark inside collar", "  ", "one loose button"],
 measurementsJson: [{ key: "pitToPit", value: 52, unit: "cm" as const }, { key: "length", value: 80, unit: "cm" as const }],
};
const SHIPS_UK_EU = { zones: { domestic: { enabled: true }, europe: { enabled: true }, north_america: { enabled: false }, rest_of_world: { enabled: false } }, country: "GB" };

test("a full item yields every section, in reading order, in the product page's words", () => {
 const sections = hostedProductDetails(FULL, SHIPS_UK_EU);
 assert.deepEqual(sections.map((s) => s.id), ["size", "measurements", "condition", "flaws", "ships-to"]);
 const by = Object.fromEntries(sections.map((s) => [s.id, s]));
 assert.equal(by.size.label, "Size");
 assert.deepEqual(by.size.lines, ["Marked IT 44 · fits a US 8 (seller's note)"], "the seller's fit note wins, as on the product page");
 assert.equal(by.measurements.label, "Measurements");
 assert.deepEqual(by.measurements.lines, ["Pit to pit 52 cm", "Length 80 cm"]);
 assert.equal(by.condition.label, "Condition");
 assert.deepEqual(by.condition.lines, ["Very good", conditionDefinition("Very good"), "Condition note: light wear at the cuffs"]);
 assert.equal(by.flaws.label, "Flaws");
 assert.deepEqual(by.flaws.lines, ["small mark inside collar", "one loose button"], "blank flaws are dropped, as the product page drops them");
 assert.equal(by["ships-to"].label, "Ships to");
 assert.deepEqual(by["ships-to"].lines, ["UK and Europe"]);
});

test("an item with nothing to say yields no sections and no block", () => {
 const sections = hostedProductDetails({ title: "Bare", size: null, category: null, description: null, currency: "USD", condition: null, conditionNote: null, flaws: null, measurementsJson: null }, { zones: null, country: null });
 assert.deepEqual(sections, []);
 assert.equal(renderHostedDetailsHtml(sections), "", "nothing to print means no block at all");
});

test("free-text condition saved before the scale prints as she wrote it, with no definition", () => {
 const [cond] = hostedProductDetails({ ...FULL, condition: "worn in, lovely", conditionNote: null, size: null, measurementsJson: null, flaws: [] }, { zones: null, country: null });
 assert.equal(cond.id, "condition");
 assert.deepEqual(cond.lines, ["worn in, lovely"]);
});

test("a store that never saved shipping says nothing about where it ships", () => {
 const ids = hostedProductDetails(FULL, { zones: null, country: null }).map((s) => s.id);
 assert.ok(!ids.includes("ships-to"));
 const world = hostedProductDetails(FULL, { zones: { domestic: { enabled: true }, europe: { enabled: true }, north_america: { enabled: true }, rest_of_world: { enabled: true } }, country: "US" });
 assert.deepEqual(world.find((s) => s.id === "ships-to")?.lines, ["Worldwide"]);
});

test("the block is one theme-neutral section, one data-vya-section per part, everything escaped", () => {
 const html = renderHostedDetailsHtml(hostedProductDetails({ ...FULL, flaws: ['<img src=x onerror="alert(1)"> & a "quote"'], conditionNote: "<b>bold</b>" }, SHIPS_UK_EU));
 const $ = cheerio.load(html);
 assert.equal($("[data-vya-details]").length, 1);
 assert.equal($("[data-vya-details]").prop("tagName"), "SECTION");
 assert.deepEqual($("[data-vya-section]").map((_, el) => $(el).attr("data-vya-section")).get(), ["size", "measurements", "condition", "flaws", "ships-to"]);
 assert.equal($("img").length, 0, "markup in a flaw is text, never an element");
 assert.equal($("b").length, 0, "markup in a note is text, never an element");
 assert.equal($("[data-vya-section='flaws'] li").text(), '<img src=x onerror="alert(1)"> & a "quote"');
 assert.match(html, /Condition note: &lt;b&gt;bold&lt;\/b&gt;/);
 assert.ok(!/class="/.test(html), "no theme classes: inline styles only, so the block inherits the theme's type and colour");
 assert.match($("[data-vya-section='flaws'] p").text(), /^Flaws$/);
});
