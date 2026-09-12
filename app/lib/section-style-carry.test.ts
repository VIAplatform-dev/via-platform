import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyEdits, injectPoweredBy, prepareEditMode } from "./site-capture.ts";

// The shape of Dawn's "image with text" on thenicheshop-2: the theme's section wrapper holds a <style>
// and ONE full-bleed container that paints the colour scheme's own background (white) and colour.
// A background or text colour written on the wrapper alone was hidden behind that container.
const DAWN = `<html><head></head><body><main>
<div id="shopify-section-story" class="shopify-section section"><style>.x{}</style><div class="story-padding gradient color-scheme-1"><div class="page-width"><div class="image-with-text"><div class="grid"><div class="media"><img src="a.jpg"></div><div class="text"><h2 class="h1">Our Story</h2><p>Words</p><a class="button button--primary" href="/pages/about">Learn More</a></div></div></div></div></div></div>
<div id="shopify-section-next" class="shopify-section"><div class="other gradient"><h2>Other</h2><p>More</p></div></div>
</main></body></html>`;

const styleOf = ($: cheerio.CheerioAPI, sel: string) => $(sel).attr("style") || "";

test("a section background reaches the band she sees: the full-bleed wrappers stop painting over it", () => {
 const $ = cheerio.load(applyEdits(DAWN, { secStyles: [{ sec: 0, style: "background-color:#ffe000 !important;" }] }));
 assert.match(styleOf($, "#shopify-section-story"), /background-color:#ffe000 !important/);
 for (const sel of [".story-padding", ".page-width", ".image-with-text", ".grid"]) {
  assert.match(styleOf($, sel), /background-color:transparent !important/, sel);
  assert.match(styleOf($, sel), /background-image:none !important/, sel);
 }
});

test("…but nothing that is only PART of the section loses its own fill", () => {
 const $ = cheerio.load(applyEdits(DAWN, { secStyles: [{ sec: 0, style: "background-color:#ffe000 !important;" }] }));
 for (const sel of [".media", ".text", "a.button", "h2.h1", "img"]) assert.equal(styleOf($, sel), "", sel);
 assert.equal(styleOf($, ".other"), "", "the next section is untouched");
});

test("the section's text colour is carried by the same wrappers, so text that inherits follows it", () => {
 const $ = cheerio.load(applyEdits(DAWN, { secStyles: [{ sec: 0, style: "color:#00aa00 !important;" }] }));
 for (const sel of [".story-padding", ".page-width", ".image-with-text", ".grid"]) assert.match(styleOf($, sel), /color:#00aa00 !important/, sel);
 assert.doesNotMatch(styleOf($, ".story-padding"), /background/, "a colour change does not touch backgrounds");
});

test("text with its own theme colour takes the section colour through its own style entry (as the editor records it)", () => {
 // The editor records the section colour on each piece of text it can be read on, keyed like any text
 // style, so it lands through the same checked path. eid 0 = "Our Story", 2 = "Learn More".
 const $ = cheerio.load(applyEdits(DAWN, {
  secStyles: [{ sec: 0, style: "color:#00aa00 !important;" }],
  styles: [{ eid: 0, style: "color:#00aa00 !important;", was: "Our Story" }, { eid: 2, style: "color:#ffd400 !important;", was: "Learn More" }],
 }));
 assert.match(styleOf($, "h2.h1"), /color:#00aa00 !important/);
 assert.match(styleOf($, "a.button"), /color:#ffd400 !important/);
});

test("alignment or spacing alone changes nothing below the section", () => {
 const $ = cheerio.load(applyEdits(DAWN, { secStyles: [{ sec: 0, style: "text-align:center !important;padding-top:48px !important;" }] }));
 assert.equal(styleOf($, ".story-padding"), "");
});

test("the wrapper chain ends at media, and our own powered-by row does not end it early", () => {
 const footer = injectPoweredBy(`<html><head></head><body><div class="shopify-section"><footer class="footer gradient"><div class="footer__content"><a href="/policies/terms">Terms of Service</a><p>©</p></div></footer></div>
<div class="shopify-section"><div class="banner"><img src="b.jpg"></div></div></body></html>`);
 const $ = cheerio.load(applyEdits(footer, { secStyles: [{ sec: 0, style: "background-color:#111111 !important;" }, { sec: 1, style: "background-color:#111111 !important;" }] }));
 assert.match(styleOf($, "footer.footer"), /background-color:transparent/);
 assert.match(styleOf($, ".footer__content"), /background-color:transparent/, "the badge beside it is not hers and does not count");
 assert.match(styleOf($, ".banner"), /background-color:transparent/);
 assert.equal(styleOf($, ".banner img"), "", "a photograph is never restyled");
});

// ── the theme's loading screen ──────────────────────────────────────────────────────────────────
// Palo Alto (sourcedbyscottie) puts a fixed, full-viewport <loading-overlay> over the page until its own
// script drops html.page-loading. In the editor that took seconds on a 5.8MB page and ate every click.
const PALO = `<html class="no-js page-loading"><head><style>html:not(.page-loading) .loading-overlay{opacity:0;visibility:hidden;pointer-events:none}.loading-overlay{position:fixed;z-index:99999}</style></head><body><loading-overlay class="loading-overlay"><div class="loader"></div></loading-overlay><div class="shopify-section"><h1>Get right to the source.</h1></div></body></html>`;

test("edit mode drops the loading gate and hides the overlay", () => {
 const $ = cheerio.load(prepareEditMode(PALO, "sourcedbyscottie", "/"));
 assert.ok(!$("html").hasClass("page-loading"), "the gate the theme's own script would have dropped");
 assert.ok($("html").hasClass("no-js"), "nothing else about the page's classes changes");
 const css = $("style[data-vya-edit-only]").text();
 assert.match(css, /loading-overlay[^{]*\{[^}]*display:\s*none\s*!important/);
});

test("the loading-screen fix is the editor's alone: a save keeps her page exactly as it was", () => {
 const saved = applyEdits(PALO, { edits: [{ eid: 0, text: "Get right to the source!", was: "Get right to the source." }] });
 const $ = cheerio.load(saved);
 assert.ok($("html").hasClass("page-loading"));
 assert.equal($("style[data-vya-edit-only]").length, 0);
 assert.equal($("loading-overlay").length, 1);
});
