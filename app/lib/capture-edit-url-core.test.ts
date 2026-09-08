import { test } from "node:test";
import assert from "node:assert/strict";
import { withStoreParam, storeSlugFromPath } from "./capture-edit-url-core.ts";

test("the slug is the segment after /site/", () => {
 assert.equal(storeSlugFromPath("/site/foo/about"), "foo");
 assert.equal(storeSlugFromPath("/site/foo"), "foo");
 assert.equal(storeSlugFromPath("/site/foo/"), "foo");
 assert.equal(storeSlugFromPath("/admin/storefront"), null);
 assert.equal(storeSlugFromPath("/"), null);
 assert.equal(storeSlugFromPath("/site/"), null);
 assert.equal(storeSlugFromPath("/sites/foo"), null);
});

test("an editor save on /site/<slug>/… carries the store", () => {
 assert.equal(withStoreParam("/api/store/capture/edit", "/site/foo/about"), "/api/store/capture/edit?store=foo");
 assert.equal(withStoreParam("/api/store/assets", "/site/foo"), "/api/store/assets?store=foo");
});

test("outside /site/ the URL is left alone", () => {
 assert.equal(withStoreParam("/api/store/capture/edit", "/admin/storefront"), "/api/store/capture/edit");
 assert.equal(withStoreParam("/api/store/capture/edit", ""), "/api/store/capture/edit");
});

test("an URL that already has a query gets &store=", () => {
 assert.equal(withStoreParam("/api/store/capture/edit?v=2", "/site/foo/about"), "/api/store/capture/edit?v=2&store=foo");
});

test("the slug is URL-encoded, never spliced raw", () => {
 assert.equal(withStoreParam("/api/store/assets", "/site/a%26b/x"), "/api/store/assets?store=a%2526b");
});
