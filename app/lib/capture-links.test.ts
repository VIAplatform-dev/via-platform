import test from "node:test";
import assert from "node:assert/strict";
import { normalizePath, linkTargets, partitionByReachability } from "./capture-links.ts";

// The cost of getting this wrong is not a broken page — it is a seller told that a collection she
// retired is live on her shop, or told that a collection she is selling from is not. Both are worse
// than no label at all, so the edges matter more than the happy path here.

test("a link target is reduced to the shape captured paths are stored in", () => {
 assert.equal(normalizePath("/collections/bottoms"), "/collections/bottoms");
 assert.equal(normalizePath("/collections/bottoms/"), "/collections/bottoms");
 assert.equal(normalizePath("/collections/bottoms?sort=price"), "/collections/bottoms");
 assert.equal(normalizePath("/collections/bottoms#grid"), "/collections/bottoms");
 assert.equal(normalizePath("/"), "/");
});

test("links off the site are not links to our pages", () => {
 for (const href of ["mailto:hi@x.com", "tel:+15551234", "javascript:void(0)", "#main", "", "   "]) {
  assert.equal(normalizePath(href), null, href);
 }
 assert.equal(normalizePath("//evil.example/collections/x"), null);
 assert.equal(normalizePath("https://instagram.com/tess", "tesselizabethvintage.com"), null);
});

test("an absolute link to her own site counts, www or not", () => {
 assert.equal(normalizePath("https://tesselizabethvintage.com/collections/bottoms", "tesselizabethvintage.com"), "/collections/bottoms");
 assert.equal(normalizePath("https://www.tesselizabethvintage.com/collections/bottoms", "tesselizabethvintage.com"), "/collections/bottoms");
 assert.equal(normalizePath("https://tesselizabethvintage.com/collections/bottoms", "https://www.tesselizabethvintage.com"), "/collections/bottoms");
});

test("a relative link is refused rather than guessed at", () => {
 // Resolving it needs the page's own path, and guessing a base would invent link targets that
 // silently mark a genuinely orphaned collection as live.
 assert.equal(normalizePath("bottoms"), null);
 assert.equal(normalizePath("../collections/bottoms"), null);
});

test("every href in the markup is found, quoted however the theme wrote it", () => {
 const html = `
  <nav><a href="/collections/all">All</a><a href='/collections/antique'>Antique</a>
  <a href=/journal >Journal</a><a class="x" data-y="z" href="/collections/bottoms?p=2">Bottoms</a></nav>
  <a href="https://instagram.com/tess">IG</a><a href="#top">Top</a>`;
 const t = linkTargets(html, "tesselizabethvintage.com");
 assert.ok(t.has("/collections/all"));
 assert.ok(t.has("/collections/antique"));
 assert.ok(t.has("/journal"));
 assert.ok(t.has("/collections/bottoms"));
 assert.ok(!t.has("/top"));
 assert.equal([...t].some((p) => p.includes("instagram")), false);
});

test("pages the site leads to are kept apart from the ones it doesn't", () => {
 const home = `<nav><a href="/collections/all">Shop all</a><a href="/collections/bottoms">Bottoms</a><a href="/journal">Journal</a></nav>`;
 const { linked, unlinked } = partitionByReachability(
  ["/", "/collections/all", "/collections/bottoms", "/journal", "/collections/commission-7", "/collections/collection-3"],
  [home],
 );
 assert.deepEqual(linked, ["/", "/collections/all", "/collections/bottoms", "/journal"]);
 assert.deepEqual(unlinked, ["/collections/commission-7", "/collections/collection-3"]);
});

test("the homepage is never marked unlinked, even when nothing points at it", () => {
 const { linked, unlinked } = partitionByReachability(["/"], ["<nav><a href='/journal'>J</a></nav>"]);
 assert.deepEqual(linked, ["/"]);
 assert.deepEqual(unlinked, []);
});

test("a trailing slash on either side is still the same page", () => {
 // The capture stores "/collections/bottoms"; her nav writes "/collections/bottoms/". Treating those
 // as different pages would grey out a collection she is actively selling from.
 const { unlinked } = partitionByReachability(["/collections/bottoms/"], [`<a href="/collections/bottoms">B</a>`]);
 assert.deepEqual(unlinked, []);
});

test("no source html means nothing is claimed either way", () => {
 // A capture we can't read links from must not mark the whole shop as dead — better an unlabelled
 // strip than one telling her every collection is orphaned.
 const { linked, unlinked } = partitionByReachability(["/", "/collections/a", "/collections/b"], []);
 assert.deepEqual(linked, ["/"]);
 assert.equal(unlinked.length, 2);
});

test("links found on any of the source pages count, not just the first", () => {
 const home = `<a href="/collections/all">All</a>`;
 const index = `<a href="/collections/commission-7">Commission 7</a>`;
 const { unlinked } = partitionByReachability(["/collections/all", "/collections/commission-7"], [home, index]);
 assert.deepEqual(unlinked, []);
});
