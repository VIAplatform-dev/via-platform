import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyEdits } from "./site-capture.ts";

// An existing theme button could have its LABEL recoloured, but nothing could change its fill: the editor
// had no control for it, and a fill set on the button would not survive the save. Measured on
// thenicheshop-2's "Learn More" (Dawn): fill rgb(177,94,55) never moved. Dawn draws the outline with
// currentColor/border-color, so an outline follows too.

const PAGE = `<html><body><main>
<div class="shopify-section"><div class="text"><h2>Our Story</h2><a class="button button--primary" href="/pages/about-us">Learn More</a></div></div>
<div class="shopify-section"><div class="text"><a class="button" href="/collections/all"><span class="button__label">Shop All</span></a></div></div>
</main></body></html>`;
// Text leaves in document order: Our Story (0), Learn More (1), Shop All (2).

test("a button's fill and outline colour survive the save, on the button she clicked", () => {
 const $ = cheerio.load(applyEdits(PAGE, { styles: [{ eid: 1, style: "background-color:#1a73e8 !important;border-color:#1a73e8 !important;", was: "Learn More" }] }));
 const style = $("a.button--primary").attr("style") || "";
 assert.match(style, /background-color:#1a73e8 !important/);
 assert.match(style, /border-color:#1a73e8 !important/);
 assert.equal($("h2").attr("style"), undefined);
});

test("a button whose label sits inside it keeps its fill on the BUTTON, not on the label", () => {
 // The editor sends the button's own markup back with the section when the label is a child: the fill
 // belongs to the <a>, which has no text number of its own.
 const sent = `<div class="shopify-section"><div class="text"><a class="button" href="#" data-vya-href="/collections/all" style="background-color:#1a73e8 !important;border-color:#1a73e8 !important"><span class="button__label" style="color:#ffffff !important">Shop All</span></a></div></div>`;
 const $ = cheerio.load(applyEdits(PAGE, { sections: [0, { sec: 1, html: sent }] }));
 const a = $("a").filter((_i, el) => $(el).text().trim() === "Shop All");
 assert.match(a.attr("style") || "", /background-color:#1a73e8 !important/);
 assert.equal(a.attr("href"), "/collections/all");
 assert.match(a.find("span").attr("style") || "", /color:#ffffff !important/);
});

test("an outline colour alone is kept too", () => {
 const $ = cheerio.load(applyEdits(PAGE, { styles: [{ eid: 1, style: "border-color:#00aa00 !important;", was: "Learn More" }] }));
 assert.match($("a.button--primary").attr("style") || "", /border-color:#00aa00 !important/);
});
