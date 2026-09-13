import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { parseGridConfig, gridMarkerHtml, isGridId, newGridId, namesCollection, firstLinkedCollection, GRID_DEFAULTS, GRID_BOUNDS } from "./grid-config.ts";

test("numbers are clamped to the bounds, never rejected", () => {
 const c = parseGridConfig({ count: 99, cols: 0, mcols: 7 });
 assert.equal(c.count, GRID_BOUNDS.count.max);
 assert.equal(c.count, 20);
 assert.equal(c.cols, 1);
 assert.equal(c.mcols, 2);
 assert.equal(parseGridConfig({ count: -4 }).count, 1);
 assert.equal(parseGridConfig({ count: "7" }).count, 7);
 assert.equal(parseGridConfig({ cols: 3.6 }).cols, 4);
});

test("a value that isn't a number is the default", () => {
 const c = parseGridConfig({ count: "lots", cols: null, mcols: {} });
 assert.equal(c.count, GRID_DEFAULTS.count);
 assert.equal(c.cols, GRID_DEFAULTS.cols);
 assert.equal(c.mcols, GRID_DEFAULTS.mcols);
});

test("enums outside the list fall back to the default", () => {
 const c = parseGridConfig({ ratio: "circle", card: "<script>" });
 assert.equal(c.ratio, "theme");
 assert.equal(c.card, "theme");
 assert.equal(parseGridConfig({ ratio: "square", card: "simple" }).ratio, "square");
 assert.equal(parseGridConfig({ ratio: "square", card: "simple" }).card, "simple");
});

test("a collection that isn't hers becomes all", () => {
 assert.equal(parseGridConfig({ collection: "someone-elses" }, ["dresses", "bags"]).collection, "all");
 assert.equal(parseGridConfig({ collection: "dresses" }, ["dresses", "bags"]).collection, "dresses");
 assert.equal(parseGridConfig({ collection: "all" }, ["dresses"]).collection, "all");
});

test("without her list, a well-formed handle is kept and a malformed one is not", () => {
 assert.equal(parseGridConfig({ collection: "collector-s-items" }).collection, "collector-s-items");
 assert.equal(parseGridConfig({ collection: "../../etc" }).collection, "all");
 assert.equal(parseGridConfig({ collection: "a\"><img src=x>" }).collection, "all");
});

test("a JSON string (the marker attribute) parses; garbage is the default", () => {
 assert.deepEqual(parseGridConfig('{"collection":"bags","count":6,"cols":3,"mcols":1,"ratio":"portrait","card":"simple"}', ["bags"]),
  { v: 1, collection: "bags", count: 6, cols: 3, mcols: 1, ratio: "portrait", card: "simple" });
 assert.deepEqual(parseGridConfig("{not json"), GRID_DEFAULTS);
 assert.deepEqual(parseGridConfig(["array"]), GRID_DEFAULTS);
});

test("the marker is empty, carries only its id and validated settings, and reads back the same", () => {
 const html = gridMarkerHtml("g_abcd1234", { ...GRID_DEFAULTS, collection: "bags", count: 50 });
 const $ = cheerio.load(html, null, false);
 const el = $("[data-vya-grid]");
 assert.equal(el.length, 1);
 assert.equal(el.children().length, 0);
 assert.equal(el.attr("data-vya-block"), "1");
 assert.equal(el.attr("data-vya-newtype"), "products");
 assert.equal(el.attr("data-vya-grid-id"), "g_abcd1234");
 assert.equal(parseGridConfig(el.attr("data-vya-grid")).count, 20, "clamped on the way in");
 assert.equal(parseGridConfig(el.attr("data-vya-grid")).collection, "bags");
});

test("a bad id is replaced rather than written into the page", () => {
 const $ = cheerio.load(gridMarkerHtml('x" onmouseover="alert(1)', GRID_DEFAULTS), null, false);
 assert.ok(isGridId($("[data-vya-grid]").attr("data-vya-grid-id")));
 assert.equal($("[onmouseover]").length, 0);
});

test("grid ids are well formed and distinct", () => {
 const ids = new Set(Array.from({ length: 200 }, () => newGridId()));
 assert.equal(ids.size, 200);
 for (const id of ids) assert.ok(isGridId(id), id);
 assert.equal(isGridId("g_"), false);
 assert.equal(isGridId("G_ABCD"), false);
});

test("a brand-new grid names no collection; a saved one does", () => {
 assert.equal(namesCollection({ count: 8 }), false);
 assert.equal(namesCollection('{"collection":"bags"}'), true);
 assert.equal(namesCollection("nope"), false);
});

test("a new grid shows the first of her collections her page links to", () => {
 const html = `<header><a href="/collections/all">Shop</a><a href="/site/x/collections/unknown">X</a><a href="/collections/bags">Bags</a></header><a href="/collections/dresses">D</a>`;
 assert.equal(firstLinkedCollection(html, ["dresses", "bags"]), "bags");
 assert.equal(firstLinkedCollection("<a href='/pages/about'>", ["bags"]), "all");
});
