import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyEdits, stampEditIds, prepareEditMode, injectCss } from "../site-capture.ts";
import { EDITOR_NUMBERING } from "./numbering.ts";
import { GRID_DEFAULTS, isGridId, parseGridConfig } from "./grid-config.ts";

// ── numbering v2: the header and footer are not sections ────────────────────────────────────────
const DAWN = `<html><head></head><body>
<div id="shopify-section-sections--1__announcement-bar" class="shopify-section shopify-section-group-header-group"><p>Free shipping</p></div>
<div id="shopify-section-sections--1__header" class="shopify-section shopify-section-group-header-group"><a href="/">Logo</a></div>
<main>
<section id="shopify-section-template--2__banner" class="shopify-section section"><style>.banner-x{color:red}</style><h2>Banner</h2></section>
<section id="shopify-section-template--2__story" class="shopify-section section"><h2>Story</h2></section>
</main>
<div id="shopify-section-sections--3__footer" class="shopify-section shopify-section-group-footer-group"><p>Footer</p></div>
</body></html>`;

const secHeadings = (html: string) => {
 const $ = cheerio.load(html);
 return $("[data-vya-sec]").map((_i, el) => $(el).find("h2, p, a").first().text()).get();
};

test("numbering v2 skips the Shopify header and footer groups", () => {
 assert.deepEqual(secHeadings(stampEditIds(DAWN)), ["Banner", "Story"]);
});

test("sections inside a top-level <header>/<footer> are not sections either (Horizon)", () => {
 const html = `<html><body><header><div class="shopify-section" id="shopify-section-x__header_section"><a href="/">Logo</a></div></header>
<main><div class="shopify-section"><h2>One</h2></div><div class="shopify-section"><h2>Two</h2></div></main>
<footer><div class="shopify-section"><p>Foot</p></div></footer></body></html>`;
 assert.deepEqual(secHeadings(stampEditIds(html)), ["One", "Two"]);
});

test("a <header> inside the page content does not hide its section", () => {
 const html = `<html><body><main><article><header><section><h2>Inside</h2></section></header></article><section><h2>Next</h2></section></main></body></html>`;
 assert.deepEqual(secHeadings(stampEditIds(html)), ["Inside", "Next"]);
});

const SQS = `<html><body>
<header id="header"><a href="/">Lei</a></header>
<main><article class="sections" id="sections">
<section class="page-section"><div class="content-wrapper"><h2>Hero</h2></div></section>
<section class="page-section"><div class="content-wrapper"><h2>Shop</h2></div></section>
</article></main>
<footer class="sections" id="footer-sections"><section class="page-section"><p>Footer</p></section></footer>
</body></html>`;

test("Squarespace is numbered by its own .page-sections, without the footer's", () => {
 assert.deepEqual(secHeadings(stampEditIds(SQS)), ["Hero", "Shop"]);
});

test("Squarespace sections can be reordered, and the footer stays put", () => {
 const $ = cheerio.load(applyEdits(SQS, { sections: [1, 0] }));
 assert.deepEqual($("#sections .page-section h2").map((_i, el) => $(el).text()).get(), ["Shop", "Hero"]);
 assert.equal($("#footer-sections .page-section p").text(), "Footer");
});

test("the header and footer can no longer be deleted as body sections", () => {
 const $ = cheerio.load(applyEdits(DAWN, { sections: [1] }));
 assert.equal($(".shopify-section-group-header-group").length, 2);
 assert.equal($(".shopify-section-group-footer-group").length, 1);
 assert.equal($("h2").text(), "Story");
});

// ── hide, don't delete ───────────────────────────────────────────────────────────────────────────
test("hiding a captured section marks it and keeps every part of it", () => {
 const $ = cheerio.load(applyEdits(DAWN, { sections: [{ sec: 0, hidden: true }, 1] }));
 const banner = $("#shopify-section-template--2__banner");
 assert.equal(banner.attr("data-vya-hidden"), "1");
 assert.equal(banner.find("h2").text(), "Banner");
 assert.equal(banner.find("style").length, 1);
});

test("showing it again removes the mark", () => {
 const hidden = applyEdits(DAWN, { sections: [{ sec: 0, hidden: true }, 1] });
 const $ = cheerio.load(applyEdits(hidden, { sections: [{ sec: 0, hidden: false }, 1] }));
 assert.equal($("#shopify-section-template--2__banner").attr("data-vya-hidden"), undefined);
});

test("a hidden section she also changed keeps her change", () => {
 const sent = `<section id="shopify-section-template--2__banner" class="shopify-section section"><h2>Banner</h2><div data-vya-inline="1"><p>Added</p></div></section>`;
 const $ = cheerio.load(applyEdits(DAWN, { sections: [{ sec: 0, html: sent, hidden: true }, 1] }));
 const banner = $("#shopify-section-template--2__banner");
 assert.equal(banner.attr("data-vya-hidden"), "1");
 assert.equal(banner.find("[data-vya-inline] p").text(), "Added");
});

test("a section really deleted leaves its stylesheet on the page for the sections that kept using it", () => {
 const $ = cheerio.load(applyEdits(DAWN, { sections: [1] }));
 assert.equal($("#shopify-section-template--2__banner").length, 0);
 assert.ok($("style").toArray().some((s) => $(s).html()!.includes(".banner-x")), "its <style> was moved, not dropped");
});

test("the shopper's page hides a hidden section, even with no custom CSS", () => {
 const hidden = applyEdits(DAWN, { sections: [{ sec: 0, hidden: true }, 1] });
 assert.match(injectCss(hidden, ""), /\[data-vya-hidden\]\{display:none!important\}/);
 assert.equal(injectCss(DAWN, ""), DAWN, "a page with nothing hidden is untouched");
});

// ── product grids in the save ────────────────────────────────────────────────────────────────────
const cards = `<ul class="grid"><li><a href="/products/a"><img src="a.jpg">A $10</a></li></ul>`;

test("a new product grid is saved as its marker only, from validated settings, whatever html came with it", () => {
 const out = applyEdits(DAWN, { sections: [0, { new: "products", gridId: "g_abcd1234", grid: parseGridConfig({ collection: "bags", count: 99 }), html: `<div data-vya-block="1">${cards}<script>x</script></div>` }, 1] });
 const $ = cheerio.load(out);
 const m = $("[data-vya-grid]");
 assert.equal(m.length, 1);
 assert.equal(m.children().length, 0, "no cards stored");
 assert.equal(m.attr("data-vya-grid-id"), "g_abcd1234");
 assert.equal(parseGridConfig(m.attr("data-vya-grid")).count, 20);
 assert.equal(parseGridConfig(m.attr("data-vya-grid")).collection, "bags");
 assert.equal($("script").length, 0);
});

test("changing a saved grid's settings rewrites the marker and nothing else", () => {
 const saved = applyEdits(DAWN, { sections: [0, { new: "products", gridId: "g_abcd1234", grid: GRID_DEFAULTS }, 1] });
 const out = applyEdits(saved, { sections: [0, { sec: 1, grid: parseGridConfig({ cols: 3, collection: "dresses" }), html: `<div data-vya-grid-id="g_abcd1234">${cards}</div>` }, 2] });
 const $ = cheerio.load(out);
 const m = $("[data-vya-grid]");
 assert.equal(m.children().length, 0);
 assert.equal(parseGridConfig(m.attr("data-vya-grid")).cols, 3);
 assert.equal(parseGridConfig(m.attr("data-vya-grid")).collection, "dresses");
});

test("grid settings sent against a captured section are ignored", () => {
 const $ = cheerio.load(applyEdits(DAWN, { sections: [{ sec: 0, grid: GRID_DEFAULTS }, 1] }));
 assert.equal($("[data-vya-grid]").length, 0);
 assert.equal($("#shopify-section-template--2__banner h2").text(), "Banner");
});

test("a captured section cannot smuggle a grid marker in through its html", () => {
 const sent = `<section id="shopify-section-template--2__banner" class="shopify-section section"><div data-vya-block="1" data-vya-newtype="products" data-vya-grid-id="g_zzzz9999" data-vya-grid='{"collection":"x"}'></div></section>`;
 const $ = cheerio.load(applyEdits(DAWN, { sections: [{ sec: 0, html: sent }, 1] }));
 assert.equal($("[data-vya-grid]").length, 0);
 assert.equal($("[data-vya-grid-id]").length, 0);
});

test("a duplicated grid gets its own id, so its CSS can't restyle the original", () => {
 const saved = applyEdits(DAWN, { sections: [0, { new: "products", gridId: "g_abcd1234", grid: GRID_DEFAULTS }, 1] });
 const $ = cheerio.load(applyEdits(saved, { sections: [0, 1, 1, 2] }));
 const ids = $("[data-vya-grid-id]").map((_i, el) => $(el).attr("data-vya-grid-id")).get();
 assert.equal(ids.length, 2);
 assert.notEqual(ids[0], ids[1]);
 assert.ok(ids.every(isGridId));
});

// ── the editor carries the numbering rule it was counted under ──────────────────────────────────
test("the editor records its numbering rule, and the save is shaped by the builder's script", () => {
 const out = prepareEditMode(DAWN, "shop", "/");
 assert.ok(out.includes(`"numbering":${EDITOR_NUMBERING}`));
 assert.ok(out.includes("window.__vyaEd="), "the bridge the builder script uses");
 assert.ok(out.includes("__vyaShapeSave"), "the save runs its payload through the builder's hook");
 assert.ok(out.includes('data-vya-builder-js'), "the builder's own script is injected");
});
