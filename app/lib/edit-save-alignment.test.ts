import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyEdits, applyEditsWithReport, extractChromeEdits, injectLiveGrids, prepareEditMode, stampEditIds, type CollectionCardItem } from "./site-capture.ts";

// "Element #N" has to mean the same thing in the editor and in the save. The editor used to number the
// page AFTER the cleanup pass and the live product grids had changed it, while the save numbered the
// stored page — so on a real store (tesselizabethvintage) 228 of 255 pieces of text pointed at
// something else, and typing into a heading wrote into a product title or into nothing at all.

const card = (h: string, t: string, p: string) => `<li class="card"><a href="/products/${h}"><img src="${h}.jpg"><span class="card__title">${t}</span><span class="price">${p}</span></a></li>`;
const page = (headerExtra = "") => `<html><body>
<header><a href="/">Shop</a>${headerExtra}</header>
<main>
<section class="shopify-section" id="grid"><h2>New in</h2><ul class="grid">${card("a", "Coat", "$100.00")}${card("b", "Skirt", "$50.00")}${card("c", "Bag", "$80.00")}</ul></section>
<section class="shopify-section" id="about"><h2>About us</h2><p>We source by hand.</p><a href="/pages/story">Read more</a></section>
</main></body></html>`;
const COUNTRY_PICKER = `<div class="localization-form"><label>Country</label><span>United States (USD $)</span></div>`;
const live = (i: number): CollectionCardItem => ({ id: `i${i}`, title: `Live piece ${i}`, priceCents: 1000 * i, currency: "USD", images: [`live${i}.jpg`], sourceId: `live-${i}`, available: true });
const eidOf = (editorHtml: string, text: string) => {
 const $ = cheerio.load(editorHtml);
 return Number($("[data-vya-eid]").filter((_i, el) => $(el).text() === text).attr("data-vya-eid"));
};

// ── the editor and the save count the same page ─────────────────────────────────────────────────

test("an edit below a header widget the cleanup pass removes lands on the heading she clicked", () => {
 const stored = page(COUNTRY_PICKER);
 const eid = eidOf(prepareEditMode(stored, "t", "/"), "About us");
 const $ = cheerio.load(applyEdits(stored, { edits: [{ eid, text: "Our story" }] }));
 assert.equal($("#about h2").text(), "Our story");
 assert.deepEqual($(".card__title").map((_i, el) => $(el).text()).get(), ["Coat", "Skirt", "Bag"]);
});

test("an edit below a product grid refilled from live inventory lands on the heading she clicked", () => {
 const stored = page();
 const served = injectLiveGrids(stampEditIds(stored), [[1, 2, 3, 4, 5].map(live)], (it) => `/products/${it.sourceId}`, { uncapped: [true] });
 const eid = eidOf(prepareEditMode(served, "t", "/"), "About us");
 const $ = cheerio.load(applyEdits(stored, { edits: [{ eid, text: "Our story" }] }));
 assert.equal($("#about h2").text(), "Our story");
});

test("cards copied into a live grid don't share an id, so none of them can be mistaken for another", () => {
 const served = injectLiveGrids(stampEditIds(page()), [[1, 2, 3, 4, 5].map(live)], (it) => `/products/${it.sourceId}`, { uncapped: [true] });
 const $ = cheerio.load(prepareEditMode(served, "t", "/"));
 for (const attr of ["data-vya-eid", "data-vya-img", "data-vya-link"]) {
  const ids = $(`[${attr}]`).map((_i, el) => $(el).attr(attr)).get();
  assert.equal(new Set(ids).size, ids.length, `${attr} values repeat`);
 }
});

// ── a save checks the value it replaces before it writes ────────────────────────────────────────

test("a text edit aimed at the wrong position is saved onto the element holding the text it replaces", () => {
 const $ = cheerio.load(applyEdits(page(), { edits: [{ eid: 0, text: "Our story", was: "About us" }] }));
 assert.equal($("#about h2").text(), "Our story");
 assert.equal($("header a").text(), "Shop");
});

test("a text edit whose old text is nowhere on the page writes nothing, and says so", () => {
 const stored = page();
 const r = applyEditsWithReport(stored, { edits: [{ eid: 8, text: "Our story", was: "A heading that was deleted" }] });
 assert.equal(cheerio.load(r.html)("*").filter((_i, el) => cheerio.load(r.html)(el).text() === "Our story").length, 0);
 assert.equal(r.skipped, 1);
});

test("old text that appears twice is not guessed at", () => {
 const stored = page().replace("<p>We source by hand.</p>", "<p>Shop</p>");
 // Aimed at "New in" (1), which doesn't hold "Shop" — and "Shop" is both the header link and the paragraph.
 const r = applyEditsWithReport(stored, { edits: [{ eid: 1, text: "Our story", was: "Shop" }] });
 const $ = cheerio.load(r.html);
 assert.equal($("header a").text(), "Shop");
 assert.equal($("#about p").text(), "Shop");
 assert.equal(r.skipped, 1);
});

test("an edit from an editor opened before this change (no old value) still saves by position", () => {
 // Document order of text: Shop(0) New in(1) Coat(2) $100(3) Skirt(4) $50(5) Bag(6) $80(7) About us(8)
 const $ = cheerio.load(applyEdits(page(), { edits: [{ eid: 8, text: "Our story" }] }));
 assert.equal($("#about h2").text(), "Our story");
});

test("an image swap aimed at the wrong position lands on the image that had the old address", () => {
 const $ = cheerio.load(applyEdits(page(), { images: [{ id: 0, src: "new.jpg", was: "b.jpg" }] }));
 assert.deepEqual($("img").map((_i, el) => $(el).attr("src")).get(), ["a.jpg", "new.jpg", "c.jpg"]);
});

test("a link change aimed at the wrong position lands on the link that had the old address", () => {
 const $ = cheerio.load(applyEdits(page(), { links: [{ id: 0, href: "/pages/our-story", was: "/pages/story" }] }));
 assert.equal($("header a").attr("href"), "/");
 assert.equal($("#about a").attr("href"), "/pages/our-story");
});

test("a text style follows the same check", () => {
 const $ = cheerio.load(applyEdits(page(), { styles: [{ eid: 0, style: "color:red", was: "About us" }] }));
 assert.match($("#about h2").attr("style") || "", /color:red/);
 assert.equal($("header a").attr("style"), undefined);
});

test("a header edit copied to the other pages carries the text she actually replaced", () => {
 const stored = page(`<a href="/account">Account</a>`);
 const r = applyEditsWithReport(stored, { edits: [{ eid: 5, text: "My account", was: "Account" }] });
 assert.deepEqual(extractChromeEdits(stored, r.resolved).texts, [{ old: "Account", val: "My account" }]);
});

// ── links survive a section being saved from the editor's copy ──────────────────────────────────

test("a link inside a section she added to keeps its real address", () => {
 // Exactly what the editor sends for a section she changed: every link is "#" in the editor, with the
 // real address parked in data-vya-href.
 const sent = `<section class="shopify-section" id="about"><h2>About us</h2><p>We source by hand.</p><a href="#" data-vya-href="/pages/story">Read more</a><div data-vya-inline="1"><p>New text</p></div></section>`;
 const $ = cheerio.load(applyEdits(page(), { sections: [0, { sec: 1, html: sent }] }));
 assert.equal($("#about a").attr("href"), "/pages/story");
 assert.equal($("#about a").attr("data-vya-href"), undefined);
 assert.equal($("[data-vya-inline] p").text(), "New text");
});

test("a javascript: address parked in the editor's copy does not come back as a link", () => {
 const sent = `<section class="shopify-section" id="about"><a href="#" data-vya-href="javascript:alert(1)">x</a></section>`;
 const $ = cheerio.load(applyEdits(page(), { sections: [0, { sec: 1, html: sent }] }));
 assert.doesNotMatch($("#about a").attr("href") || "", /javascript:/i);
});

test("a link inside a section she added keeps its address too", () => {
 const sent = `<div data-vya-block="1"><a href="#" data-vya-href="/collections/shop">Shop the edit</a></div>`;
 const $ = cheerio.load(applyEdits(page(), { sections: [0, 1, { new: "text", html: sent }] }));
 assert.equal($("a").filter((_i, el) => $(el).text() === "Shop the edit").attr("href"), "/collections/shop");
});
