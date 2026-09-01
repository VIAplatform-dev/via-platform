import { test } from "node:test";
import assert from "node:assert/strict";
import { uniqueName, defaultVersionName, normalizeVersionName, canDelete, canPublish, servesCapture } from "./storefront-versions.ts";

test("a free name is used as-is", () => {
 assert.equal(uniqueName("Design", ["Imported site"]), "Design");
});

test("a taken name gets a counter, and keeps counting", () => {
 assert.equal(uniqueName("Design", ["Design"]), "Design 2");
 assert.equal(uniqueName("Design", ["Design", "Design 2"]), "Design 3");
});

test("names collide case-insensitively and ignoring stray spaces", () => {
 // Two rows reading "Design" and "design " look identical in the list; a 2 on the end is better.
 assert.equal(uniqueName("Design", ["  design "]), "Design 2");
});

test("an empty base still produces something nameable", () => {
 assert.equal(uniqueName("   ", []), "Untitled");
});

test("default names are per kind", () => {
 assert.equal(defaultVersionName("imported", []), "Imported site");
 assert.equal(defaultVersionName("built", []), "Design");
 assert.equal(defaultVersionName("built", ["Design"]), "Design 2");
});

test("typed names are collapsed, trimmed and capped", () => {
 assert.equal(normalizeVersionName("  Autumn   2026  "), "Autumn 2026");
 assert.equal(normalizeVersionName(null), "");
 assert.equal(normalizeVersionName("x".repeat(200)).length, 60);
});

test("the published version can be neither deleted nor re-published", () => {
 assert.equal(canDelete({ published: true }), false);
 assert.equal(canDelete({ published: false }), true);
 assert.equal(canPublish({ published: true }), false);
 assert.equal(canPublish({ published: false }), true);
});

test("the published version decides what is served, not the presence of captures", () => {
 // The bug this replaces: captures existed, so captures won, and a built design could never go live.
 assert.equal(servesCapture("built", true), false);
 assert.equal(servesCapture("imported", true), true);
 assert.equal(servesCapture("imported", false), true);
});

test("a store with no published version falls back to the old capture check", () => {
 assert.equal(servesCapture(null, true), true);
 assert.equal(servesCapture(null, false), false);
});
