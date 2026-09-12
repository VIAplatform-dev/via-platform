import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSectionEntries, payloadHasGrids, entriesTouchGrids } from "./save-entries.ts";
import { gridMarkerHtml, GRID_DEFAULTS, isGridId } from "./grid-config.ts";

test("indices and ordinary new blocks read as before", () => {
 assert.deepEqual(parseSectionEntries([2, 0, { new: "text", text: "Hi" }, -1, 1.5, "x", null], null), [2, 0, { new: "text", text: "Hi", href: undefined, html: undefined }]);
});

test("a new grid takes validated settings; unknown collection → all, count clamped", () => {
 const [e] = parseSectionEntries([{ new: "products", grid: { collection: "not-hers", count: 500 }, gridId: "g_abcd1234", html: "<div>cards</div>" }], ["bags"]);
 assert.deepEqual(e, { new: "products", grid: { ...GRID_DEFAULTS, count: 20 }, gridId: "g_abcd1234" });
});

test("an older client's grid settings are read off the marker's opening tag, never its cards", () => {
 const html = gridMarkerHtml("g_zzzz0000", { ...GRID_DEFAULTS, collection: "bags", cols: 3 }).replace("></div>", "><ul><li>card</li></ul></div>");
 const [e] = parseSectionEntries([{ new: "products", html }], ["bags"]) as { grid: { collection: string; cols: number }; gridId: string }[];
 assert.equal(e.grid.collection, "bags");
 assert.equal(e.grid.cols, 3);
 assert.equal(e.gridId, "g_zzzz0000");
});

test("a bad grid id is replaced", () => {
 const [e] = parseSectionEntries([{ new: "products", gridId: "<x>" }], null) as { gridId: string }[];
 assert.ok(isGridId(e.gridId));
});

test("her own section: html bounded, hidden kept, grid validated, and an empty object is just the index", () => {
 const [a, b, c, d] = parseSectionEntries([{ sec: 1, html: "x".repeat(500_000) }, { sec: 2, hidden: true }, { sec: 3, grid: { cols: 9 } }, { sec: 4 }], null);
 assert.equal((a as { html: string }).html.length, 400_000);
 assert.deepEqual(b, { sec: 2, hidden: true });
 assert.equal((c as { grid: { cols: number } }).grid.cols, 6);
 assert.equal(d, 4);
});

test("grid detection, for kit storage and collection lookup", () => {
 assert.equal(payloadHasGrids([0, { new: "text" }]), false);
 assert.equal(payloadHasGrids([0, { sec: 1, grid: {} }]), true);
 assert.equal(entriesTouchGrids(parseSectionEntries([0, { new: "products" }], null)), true);
 assert.equal(entriesTouchGrids(parseSectionEntries([0, { sec: 1, hidden: true }], null)), false);
});
