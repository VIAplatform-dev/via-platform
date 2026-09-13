import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { deriveGridKit, detectPlatform, kitSourcePaths, missingCss, isGridKit, PROBE_ITEM } from "./grid-kit.ts";
import { renderKitGrid } from "../site-capture.ts";
import { DAWN_COLLECTION, DAWN_HOME, HORIZON_COLLECTION, SQS_SHOP, SQS_HOME, NO_CARDS, STALE_TEXT_COLLECTION, SLIDER_HOME } from "./fixtures.ts";

const page = (path: string, html: string) => ({ path, html });

test("Dawn: a kit from her shop-all page, in her theme's own wrappers and card", () => {
 const kit = deriveGridKit([page("/collections/all", DAWN_COLLECTION)], DAWN_HOME, "shopify");
 assert.ok(kit, "a kit");
 assert.equal(kit!.sourcePath, "/collections/all");
 assert.match(kit!.gridEl.attrs.class, /product-grid/);
 assert.equal(kit!.gridEl.attrs.id, undefined, "ids are never copied");
 assert.ok(kit!.shell.some((n) => /page-width/.test(n.attrs.class || "")), "keeps .page-width");
 assert.ok(kit!.shell.some((n) => /color-scheme-1/.test(n.attrs.class || "")), "keeps the colour scheme");
 assert.match(kit!.shell[0].attrs.class, /shopify-section/, "starts at the section root");
 assert.doesNotMatch(kit!.cardHtml, /<style|<script|<link/);
 assert.match(kit!.cardHtml, /card__heading/);
 assert.deepEqual(kit!.labels, { add: "Add to cart", sold: "Sold out" });
 assert.deepEqual(kit!.price, { decimals: 2, showCode: true });
});

test("the kit carries only the stylesheets her home page lacks", () => {
 const kit = deriveGridKit([page("/collections/all", DAWN_COLLECTION)], DAWN_HOME, "shopify")!;
 assert.ok(kit.css.some((c) => c.includes(".component-card")));
 assert.ok(kit.css.some((c) => c.includes(".rating")), "a stylesheet the capture inlined inside a card is still kept");
 assert.ok(!kit.css.some((c) => c.includes(".shared-theme")), "the home page already has this one");
});

test("Horizon: product-card grids yield a kit, and custom-element wrappers are written back as divs", () => {
 const kit = deriveGridKit([page("/collections/accessories", HORIZON_COLLECTION)], DAWN_HOME, "shopify");
 assert.ok(kit, "a kit");
 const html = renderKitGrid(kit!, [PROBE_ITEM], () => "/products/p");
 assert.doesNotMatch(html, /<results-list/, "the theme's script must not boot a second results list");
 assert.match(html, /<product-card/, "the card itself stays the theme's");
 assert.match(html, /Vya Kit Probe Piece/);
});

test("Squarespace: a kit from /shop, rooted at the page-section", () => {
 const kit = deriveGridKit([page("/shop", SQS_SHOP)], SQS_HOME, "squarespace");
 assert.ok(kit, "a kit");
 assert.equal(kit!.platform, "squarespace");
 assert.match(kit!.shell[0].attrs.class, /page-section/);
 assert.equal(kit!.shell[0].attrs["data-section-theme"], "white");
 assert.match(kit!.cardHtml, /product-list-item/);
});

test("a page with no product cards gives no kit", () => {
 assert.equal(deriveGridKit([page("/", NO_CARDS)], NO_CARDS), null);
});

test("F8: a card that still names the template's piece after substitution is refused", () => {
 assert.equal(deriveGridKit([page("/collections/all", STALE_TEXT_COLLECTION)], NO_CARDS, "shopify"), null);
});

test("a carousel is never used as a kit, but a real grid later in the list still is", () => {
 assert.equal(deriveGridKit([page("/", SLIDER_HOME)], SLIDER_HOME, "shopify"), null);
 const kit = deriveGridKit([page("/", SLIDER_HOME), page("/collections/all", DAWN_COLLECTION)], DAWN_HOME, "shopify");
 assert.equal(kit?.sourcePath, "/collections/all");
});

test("pages are tried shop-all first, then her other collections, then home", () => {
 const paths = ["/", "/collections", "/collections/bags", "/collections/all", "/collections/all/", "/pages/about", "/shop"];
 assert.deepEqual(kitSourcePaths(paths, "shopify"), ["/collections/all", "/collections/bags", "/"]);
 assert.deepEqual(kitSourcePaths(["/", "/shop", "/shop/p/x", "/shop/tops"], "squarespace"), ["/shop", "/shop/tops", "/"]);
 assert.equal(kitSourcePaths(["/", ...Array.from({ length: 40 }, (_, i) => `/collections/c${i}`)], "shopify").length, 6, "five collection pages at most, plus home");
});

test("platform is read from the page", () => {
 assert.equal(detectPlatform(SQS_SHOP), "squarespace");
 assert.equal(detectPlatform(DAWN_COLLECTION), "shopify");
 assert.equal(detectPlatform("<html></html>"), "other");
});

test("kit CSS never exceeds its cap", () => {
 const big = `<style>${"a{}".repeat(50)}</style><style>${"b{}".repeat(50)}</style>`;
 assert.equal(missingCss(big, "", 160).length, 1);
});

test("a stored kit is validated before use", () => {
 const kit = deriveGridKit([page("/collections/all", DAWN_COLLECTION)], DAWN_HOME, "shopify");
 assert.equal(isGridKit(JSON.parse(JSON.stringify(kit))), true);
 assert.equal(isGridKit({ v: 2, cardHtml: "x" }), false);
 assert.equal(isGridKit(null), false);
 assert.equal(isGridKit({ ...kit, css: "not a list" }), false);
});

test("a kit's card renders a live piece with no trace of the template's piece", () => {
 const kit = deriveGridKit([page("/collections/all", DAWN_COLLECTION)], DAWN_HOME, "shopify")!;
 const $ = cheerio.load(renderKitGrid(kit, [PROBE_ITEM], () => "/products/probe"), null, false);
 const text = $.root().text();
 for (const stale of ["Velvet Coat", "Silk Skirt", "$120.00"]) assert.ok(!text.includes(stale), stale);
 assert.equal($("[data-vya-kit-grid] > *").length, 1);
});
