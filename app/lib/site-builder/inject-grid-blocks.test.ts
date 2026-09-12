import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applySiteBuilder, type SiteBuilderContext } from "./apply.ts";
import { gridScopedCss, gridBlockInnerHtml, EMPTY_NOTE_HTML } from "./inject-grid-blocks.ts";
import { deriveGridKit } from "./grid-kit.ts";
import { gridMarkerHtml, parseGridConfig, GRID_DEFAULTS } from "./grid-config.ts";
import { applyEdits, type CollectionCardItem } from "../site-capture.ts";
import { DAWN_COLLECTION, DAWN_HOME, SQS_SHOP, SQS_HOME } from "./fixtures.ts";

const KIT = deriveGridKit([{ path: "/collections/all", html: DAWN_COLLECTION }], DAWN_HOME, "shopify");
const piece = (i: number, extra: Partial<CollectionCardItem> = {}): CollectionCardItem => ({ id: `item-${i}`, title: `Live Piece ${i}`, priceCents: 1000 + i * 100, currency: "USD", images: [`https://blob/p${i}.jpg`], sourceId: `live-${i}`, available: true, ...extra });
const pieces = (n: number) => Array.from({ length: n }, (_, i) => piece(i + 1));

const pageWith = (...markers: string[]) => DAWN_HOME.replace("</main>", `${markers.join("")}</main>`);
const ctx = (over: Partial<SiteBuilderContext> = {}): SiteBuilderContext => ({
 kit: KIT, collections: ["bags", "dresses"], hrefFor: (it) => `/products/${it.sourceId}`,
 loadItems: async (c) => (c === "bags" ? pieces(3) : c === "empty" ? [] : pieces(30)), ...over,
});

test("the fixture kit derives (the rest of this file depends on it)", () => {
 assert.ok(KIT);
});

test("a grid shows at most its count, in her theme's card", async () => {
 const out = await applySiteBuilder(pageWith(gridMarkerHtml("g_aaaa1111", { ...GRID_DEFAULTS, count: 6 })), ctx());
 const $ = cheerio.load(out);
 const grid = $('[data-vya-grid-id="g_aaaa1111"]');
 assert.equal(grid.find("[data-vya-item]").length, 6);
 assert.equal(grid.find(".card__heading").length, 6, "the theme's own card");
 assert.equal(grid.find(".page-width").length, 1, "inside the theme's own page width");
 assert.match(grid.text(), /Live Piece 1/);
 assert.doesNotMatch(grid.text(), /Velvet Coat/);
 assert.equal(grid.find('a[href="/products/live-1"]').length > 0, true);
});

test("a grid shows the collection it names", async () => {
 const out = await applySiteBuilder(pageWith(gridMarkerHtml("g_aaaa1111", { ...GRID_DEFAULTS, collection: "bags" })), ctx());
 assert.equal(cheerio.load(out)("[data-vya-item]").length, 3);
});

test("a collection that isn't hers shows all her pieces, never an error", async () => {
 const seen: string[] = [];
 await applySiteBuilder(pageWith(gridMarkerHtml("g_aaaa1111", { ...GRID_DEFAULTS, collection: "not-hers" })), ctx({ loadItems: async (c) => { seen.push(c); return pieces(2); } }));
 assert.deepEqual(seen, ["all"]);
});

test("a sold piece carries the sold state", async () => {
 const out = await applySiteBuilder(pageWith(gridMarkerHtml("g_aaaa1111", GRID_DEFAULTS)), ctx({ loadItems: async () => [piece(1), piece(2, { available: false, unavailableReason: null })] }));
 const $ = cheerio.load(out);
 const sold = $('[data-vya-item="item-2"]');
 assert.ok(sold.find("[data-vya-sold]").length > 0 || /sold/i.test(sold.text()), "badged or labelled sold");
 assert.equal($('[data-vya-item="item-1"] [data-vya-sold]').length, 0);
});

test("an empty collection: shoppers get nothing, the editor gets a note", async () => {
 const marker = gridMarkerHtml("g_aaaa1111", { ...GRID_DEFAULTS, collection: "empty" });
 const shop = cheerio.load(await applySiteBuilder(pageWith(marker), ctx({ collections: ["empty"] })));
 assert.equal(shop("[data-vya-grid]").children().length, 0);
 const editor = cheerio.load(await applySiteBuilder(pageWith(marker), ctx({ collections: ["empty"], editor: true })));
 assert.match(editor("[data-vya-grid]").text(), /No pieces in this collection yet/);
 assert.equal(gridBlockInnerHtml(GRID_DEFAULTS, "g_aaaa1111", { kit: KIT, items: [], hrefFor: () => "/", editor: true }).html, EMPTY_NOTE_HTML);
});

test("each grid's CSS names only its own grid", () => {
 const css = gridScopedCss("g_aaaa1111", parseGridConfig({ cols: 3, mcols: 1, ratio: "square" }), { theme: true, ratioVar: false });
 const selectors = css.replace(/@media[^{]*\{/g, "").split("}").map((r) => r.split("{")[0].trim()).filter(Boolean);
 assert.ok(selectors.length >= 4);
 for (const s of selectors) for (const part of s.split(",")) assert.ok(part.trim().startsWith('[data-vya-grid-id="g_aaaa1111"]'), part);
 assert.match(css, /repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css, /max-width:749px\)\{[^}]*repeat\(1,minmax/);
});

test("the theme's padding-ratio variable is used for image shape when her card has one", async () => {
 const out = await applySiteBuilder(pageWith(gridMarkerHtml("g_aaaa1111", { ...GRID_DEFAULTS, ratio: "square" })), ctx());
 assert.match(cheerio.load(out)("style[data-vya-grid-style]").html()!, /--ratio-percent:100%!important/);
});

test("kit CSS is added once for two grids, and only what the page lacks", async () => {
 const out = await applySiteBuilder(pageWith(gridMarkerHtml("g_aaaa1111", GRID_DEFAULTS), gridMarkerHtml("g_bbbb2222", { ...GRID_DEFAULTS, collection: "bags" })), ctx());
 const $ = cheerio.load(out);
 assert.equal($("style[data-vya-kit-css]").length, 1);
 assert.equal($("head style[data-vya-kit-css]").length, 1);
 assert.match($("style[data-vya-kit-css]").html()!, /component-card/);
 assert.doesNotMatch($("style[data-vya-kit-css]").html()!, /shared-theme/);
 assert.equal($("[data-vya-grid-style]").length, 2);
});

test("Simple card, or no kit at all: the plain grid, still marked for the column rules", async () => {
 for (const c of [ctx({ kit: null }), ctx()]) {
  const marker = gridMarkerHtml("g_aaaa1111", { ...GRID_DEFAULTS, card: c.kit ? "simple" : "theme", count: 4 });
  const $ = cheerio.load(await applySiteBuilder(pageWith(marker), c));
  assert.equal($("[data-vya-simple-grid] [data-vya-kit-grid]").length, 1);
  assert.equal($(".card__heading").length, 0);
  assert.equal($("style[data-vya-kit-css]").length, 0, "no theme CSS for a plain grid");
 }
});

test("Squarespace: her own product-list card, inside her page-section", async () => {
 const kit = deriveGridKit([{ path: "/shop", html: SQS_SHOP }], SQS_HOME, "squarespace");
 const html = SQS_HOME.replace("</article>", `${gridMarkerHtml("g_cccc3333", GRID_DEFAULTS)}</article>`);
 const $ = cheerio.load(await applySiteBuilder(html, ctx({ kit })));
 assert.equal($("[data-vya-grid] section.page-section .product-list-item[data-vya-item]").length, 8);
});

test("a page with no grid is not parsed or changed", async () => {
 let loads = 0;
 const out = await applySiteBuilder(DAWN_HOME, ctx({ loadItems: async () => { loads++; return []; } }));
 assert.equal(out, DAWN_HOME);
 assert.equal(loads, 0);
});

test("a filled grid saves back as its marker only", async () => {
 // What the editor shows is the filled grid; what a save stores is the marker and its settings.
 const stored = applyEdits(DAWN_HOME, { sections: [0, { new: "products", gridId: "g_aaaa1111", grid: GRID_DEFAULTS }] });
 const served = await applySiteBuilder(stored, ctx());
 assert.ok(cheerio.load(served)("[data-vya-item]").length > 0);
 const resaved = applyEdits(stored, { sections: [0, { sec: 1, grid: parseGridConfig({ count: 3 }), html: cheerio.load(served)("[data-vya-grid]").toString() }] });
 const $ = cheerio.load(resaved);
 assert.equal($("[data-vya-grid]").children().length, 0);
 assert.equal($("[data-vya-item]").length, 0);
 assert.equal(parseGridConfig($("[data-vya-grid]").attr("data-vya-grid")).count, 3);
});
