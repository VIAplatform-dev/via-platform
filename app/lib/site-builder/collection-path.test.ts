import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionHandleForPath, looksSquarespace } from "./collection-path.ts";

test("Shopify collection paths are unchanged", () => {
 assert.equal(collectionHandleForPath("/collections/dresses"), "dresses");
 assert.equal(collectionHandleForPath("/collections/all/"), "all");
 assert.equal(collectionHandleForPath("/collections"), null);
 assert.equal(collectionHandleForPath("/collections/dresses/products/x"), null);
});

test("Squarespace: /shop is everything and /shop/{cat} is that category", () => {
 assert.equal(collectionHandleForPath("/shop", { squarespace: true }), "all");
 assert.equal(collectionHandleForPath("/shop/", { squarespace: true }), "all");
 assert.equal(collectionHandleForPath("/shop/tops", { squarespace: true }), "tops");
});

test("Squarespace product pages are not collections", () => {
 assert.equal(collectionHandleForPath("/shop/p/chanel-2000-cruise-top", { squarespace: true }), null);
 assert.equal(collectionHandleForPath("/shop/p", { squarespace: true }), null);
});

test("/shop means nothing on a page that isn't Squarespace", () => {
 assert.equal(collectionHandleForPath("/shop"), null);
 assert.equal(collectionHandleForPath("/shop/tops", { squarespace: false }), null);
});

test("a Squarespace page is recognised by its own asset hosts", () => {
 assert.equal(looksSquarespace(`<script>Static.SQUARESPACE_CONTEXT = {}</script>`), true);
 assert.equal(looksSquarespace(`<img src="https://images.squarespace-cdn.com/x.jpg">`), true);
 assert.equal(looksSquarespace(`<link href="https://cdn.shopify.com/s/x.css">`), false);
 assert.equal(looksSquarespace(null), false);
});
