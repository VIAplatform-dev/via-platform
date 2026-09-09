import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { collectionTileGrids, injectCollectionTiles, type CollectionTile } from "./collection-tiles.ts";

// A "shop by collection" row the way a real theme writes one.
const tile = (h: string, name: string, img = "cap.jpg") =>
 `<li class="grid__item"><a href="/collections/${h}"><img src="${img}" srcset="a 1x, b 2x" sizes="50vw" alt="${name}"><h3 class="card__heading">${name}</h3></a></li>`;
const row = (...tiles: string[]) => `<ul class="collection-list">${tiles.join("")}</ul>`;
const page = (body: string) => `<html><body>${body}</body></html>`;

const COLS: CollectionTile[] = [
 { title: "Dresses", slug: "dresses", imageUrl: "https://cdn/d.jpg" },
 { title: "Bags", slug: "bags", imageUrl: "https://cdn/b.jpg" },
 { title: "Collars", slug: "collars", imageUrl: null },
];

test("finds a collection-tile row", () => {
 const $ = cheerio.load(page(row(tile("children", "Children"), tile("collars", "Collars"))));
 assert.equal(collectionTileGrids($).length, 1);
});

test("a product grid is not a collection row", () => {
 const grid = `<ul><li><a href="/products/a"><img src="a.jpg"><span>A</span></a></li><li><a href="/products/b"><img src="b.jpg"><span>B</span></a></li></ul>`;
 assert.equal(collectionTileGrids(cheerio.load(page(grid))).length, 0);
});

test("a nav menu of collection links is not a collection row", () => {
 const menu = `<nav><ul><li><a href="/collections/a"><img src="i.png">A</a></li><li><a href="/collections/b"><img src="i.png">B</a></li></ul></nav>`;
 assert.equal(collectionTileGrids(cheerio.load(page(menu))).length, 0);
});

test("a footer link list is not a collection row", () => {
 const f = `<footer><ul><li><a href="/collections/a"><img src="i.png">A</a></li><li><a href="/collections/b"><img src="i.png">B</a></li></ul></footer>`;
 assert.equal(collectionTileGrids(cheerio.load(page(f))).length, 0);
});

test("two links to the SAME collection are not a row of two", () => {
 // A tile whose photo and caption are separate anchors would otherwise count twice.
 const dup = row(tile("children", "Children"), tile("children", "Children"));
 assert.equal(collectionTileGrids(cheerio.load(page(dup))).length, 0);
});

test("only the innermost container is returned", () => {
 const nested = `<div class="wrap">${row(tile("a", "A"), tile("b", "B"))}</div>`;
 const grids = collectionTileGrids(cheerio.load(page(nested)));
 assert.equal(grids.length, 1);
 assert.equal(grids[0].tagName, "ul");
});

test("a captured row is left exactly as it was when nothing has a cover photo", () => {
 // The regression this rule exists for: her collections had no photos yet, so rebuilding the row
 // gave every tile the first tile's stock clip-art and her VYA names. Her own page must survive.
 const src = page(row(tile("children", "Children"), tile("collars", "Collars")));
 const noPhotos: CollectionTile[] = [{ title: "Collection 3", slug: "collection-3", imageUrl: null }];
 assert.equal(injectCollectionTiles(src, noPhotos, { uncapped: true }), src);
});

test("a captured tile keeps its picture and its wording", () => {
 const src = page(row(tile("children", "Children"), tile("collars", "Collars")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, { uncapped: true }));
 assert.deepEqual($(".card__heading").map((_i, e) => $(e).text()).get().slice(0, 2), ["Children", "Collars"]);
 assert.equal($("img").eq(1).attr("src"), "cap.jpg");
});

test("a cover photo she chose replaces that tile's picture, and nothing else", () => {
 const src = page(row(tile("dresses", "Dresses"), tile("collars", "Collars")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, { uncapped: true }));
 assert.equal($("img").eq(0).attr("src"), "https://cdn/d.jpg"); // hers
 assert.equal($("img").eq(1).attr("src"), "cap.jpg");           // untouched
 assert.equal($(".card__heading").eq(0).text(), "Dresses");     // caption not rewritten
});

test("a cover photo drops the lazy-loading hooks that would recompute over it", () => {
 const src = page(row(tile("dresses", "Dresses"), tile("collars", "Collars")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, { uncapped: true }));
 const first = $("img").first();
 assert.equal(first.attr("srcset"), undefined);
 assert.equal(first.attr("sizes"), undefined);
 assert.equal(first.attr("alt"), "Dresses");
});

test("a collection with a photo and no tile is added to the index", () => {
 const src = page(row(tile("collars", "Collars"), tile("children", "Children")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, { uncapped: true }));
 // Dresses and Bags have covers and no tile; Collars has no cover, so it is not invented.
 assert.equal($("li.grid__item").length, 4);
 assert.deepEqual($(".card__heading").map((_i, e) => $(e).text()).get(), ["Collars", "Children", "Dresses", "Bags"]);
});

test("a new tile links to its own collection", () => {
 const src = page(row(tile("collars", "Collars"), tile("children", "Children")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, { uncapped: true }));
 assert.equal($("li.grid__item").eq(2).find("a").attr("href"), "/collections/dresses");
});

test("a collection with no cover photo is never given a neighbour's picture", () => {
 const src = page(row(tile("children", "Children"), tile("collars", "Collars")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, { uncapped: true }));
 assert.equal($(".card__heading").map((_i, e) => $(e).text()).get().includes("Collars"), true);
 assert.equal($("li.grid__item").length, 4); // Collars was already there; it was not added twice
});

test("a fixed row on a homepage does not grow", () => {
 // The tile count in a designed row is the theme's decision, not an accident of crawl day.
 const src = page(row(tile("collars", "Collars"), tile("children", "Children")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, {}));
 assert.equal($("li.grid__item").length, 2);
});

test("a fixed row still takes her cover photos", () => {
 const src = page(row(tile("dresses", "Dresses"), tile("children", "Children")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, {}));
 assert.equal($("li.grid__item").length, 2);
 assert.equal($("img").first().attr("src"), "https://cdn/d.jpg");
});

test("on a VYA origin a new tile stays inside the mirrored site", () => {
 const src = page(row(tile("collars", "Collars"), tile("children", "Children")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, { base: "/site/via-admin", uncapped: true }));
 assert.equal($("li.grid__item").eq(2).find("a").attr("href"), "/site/via-admin/collections/dresses");
});

test("the handle is matched however the theme escaped it", () => {
 const src = page(row(`<li class="grid__item"><a href="/collections/Dresses?sort=new"><img src="cap.jpg"><h3 class="card__heading">Dresses</h3></a></li>`, tile("children", "Children")));
 const $ = cheerio.load(injectCollectionTiles(src, COLS, { uncapped: true }));
 assert.equal($("img").first().attr("src"), "https://cdn/d.jpg");
});

test("no live collections leaves the captured row exactly as it was", () => {
 const src = page(row(tile("children", "Children"), tile("collars", "Collars")));
 assert.equal(injectCollectionTiles(src, [], { uncapped: true }), src);
});

test("a page with no collection row is returned untouched", () => {
 const src = page("<p>About us</p>");
 assert.equal(injectCollectionTiles(src, COLS, { uncapped: true }), src);
});

test("a stylesheet inlined inside a tile is not duplicated onto a new one", () => {
 const withCss = `<ul class="collection-list"><li class="grid__item"><a href="/collections/a"><img src="i.png"><h3 class="card__heading">A</h3></a></li><li class="grid__item"><style>.card__heading{font:1rem}</style><a href="/collections/b"><img src="i.png"><h3 class="card__heading">B</h3></a></li></ul>`;
 const $ = cheerio.load(injectCollectionTiles(page(withCss), COLS, { uncapped: true }));
 assert.equal($("style").length, 1);
});

test("a <picture>'s own candidates can't outvote a cover photo", () => {
 const pic = `<ul class="collection-list"><li class="grid__item"><a href="/collections/dresses"><picture><source srcset="old.avif" type="image/avif"><img src="old.jpg"></picture><h3>Dresses</h3></a></li><li class="grid__item"><a href="/collections/collars"><picture><source srcset="o2.avif"><img src="o2.jpg"></picture><h3>Collars</h3></a></li></ul>`;
 const $ = cheerio.load(injectCollectionTiles(page(pic), COLS, { uncapped: true }));
 assert.equal($("li").eq(0).find("source").length, 0);
 assert.equal($("li").eq(0).find("img").attr("src"), "https://cdn/d.jpg");
 assert.equal($("li").eq(1).find("source").length, 1); // no cover: untouched
});
