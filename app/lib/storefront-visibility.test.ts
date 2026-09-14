import { test } from "node:test";
import assert from "node:assert/strict";
import { storefrontVisibility } from "./storefront-visibility.ts";

const v = (o = {}) => ({ previewing: false, hasAccess: false, ...o });

test("a published shop is the shop, to anyone", () => {
 assert.equal(storefrontVisibility(true, v()), "live");
 assert.equal(storefrontVisibility(true, v({ hasAccess: true })), "live");
 // Even asking for a preview of a live shop gives the live shop — there is nothing else to show.
 assert.equal(storefrontVisibility(true, v({ previewing: true })), "live");
});

test("her own unpublished address shows her the shop, not a 404", () => {
 // THE BUG THIS EXISTS FOR. An unpublished shop answered its own address with Next's black 404 —
 // to the person who built it, while the editor beside it showed that address as hers.
 assert.equal(storefrontVisibility(false, v({ hasAccess: true })), "preview");
});

test("the editor's explicit preview still works before anyone is signed in", () => {
 assert.equal(storefrontVisibility(false, v({ previewing: true })), "preview");
});

test("a stranger gets 'not open yet', never the contents", () => {
 // An unpublished shop is not public. But a 404 is not the honest way to say so.
 assert.equal(storefrontVisibility(false, v()), "closed");
});
