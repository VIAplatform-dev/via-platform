import { test } from "node:test";
import assert from "node:assert/strict";
import { collectAssetUrls, rewritePageUrls, blobIndexFrom } from "./rehost-theme-assets.ts";

const ORIGIN = "https://blummier.com";

test("collects theme assets from markup and from inlined CSS", () => {
 // The CSS half is the point: a store's logo and hero are routinely `url(...)` backgrounds and a
 // font is never an attribute, so a markup-only sweep leaves a store with its layout and none of
 // its branding the day it stops fetching from Shopify.
 const html = `<html><head>
  <style>@font-face{src:url("https://blummier.com/cdn/shop/t/1/assets/brand.woff2?v=9")}
         .hero{background-image:url(/cdn/shop/files/hero.jpg?v=2)}</style>
 </head><body>
  <script src="https://blummier.com/cdn/shop/t/1/assets/global.js?v=3"></script>
  <img src="/cdn/shop/files/logo.png" srcset="/cdn/shop/files/logo.png 1x, /cdn/shop/files/logo@2x.png 2x">
 </body></html>`;
 const urls = collectAssetUrls(html, ORIGIN);
 for (const want of [
  "https://blummier.com/cdn/shop/t/1/assets/brand.woff2?v=9",
  "https://blummier.com/cdn/shop/files/hero.jpg?v=2",
  "https://blummier.com/cdn/shop/t/1/assets/global.js?v=3",
  "https://blummier.com/cdn/shop/files/logo.png",
  "https://blummier.com/cdn/shop/files/logo@2x.png",
 ]) assert.ok(urls.includes(want), `missing ${want}`);
});

test("the fingerprint query survives — it identifies WHICH build of a file", () => {
 const urls = collectAssetUrls(`<script src="/cdn/shop/t/1/assets/theme.js?v=164905933048"></script>`, ORIGIN);
 assert.deepEqual(urls, ["https://blummier.com/cdn/shop/t/1/assets/theme.js?v=164905933048"]);
});

test("trackers and popup apps are never owned — they are dropped at serve time instead", () => {
 const html = `<html><body>
  <script src="https://cdn.shopify.com/extensions/abc/omnisend-55/assets/omnisend-in-shop.js"></script>
  <script src="https://cdn3.hextom.com/js/tms/tms.js"></script>
  <script src="https://www.googletagmanager.com/gtag/js"></script>
  <script src="/cdn/shop/t/1/assets/theme.js"></script>
 </body></html>`;
 const urls = collectAssetUrls(html, ORIGIN);
 assert.deepEqual(urls, ["https://blummier.com/cdn/shop/t/1/assets/theme.js"], "only the theme's own asset");
});

test("assets already on our Blob are not re-taken, so re-running is a no-op", () => {
 const html = `<script src="https://q74gqbmcafgdbaxy.public.blob.vercel-storage.com/theme/blummier/abc.js"></script>`;
 assert.deepEqual(collectAssetUrls(html, ORIGIN), []);
});

test("data: URIs and pages are ignored", () => {
 const html = `<img src="data:image/png;base64,iVBOR">
  <a href="/collections/all">shop</a>
  <link rel="canonical" href="https://blummier.com/collections/all">`;
 assert.deepEqual(collectAssetUrls(html, ORIGIN), []);
});

test("a root-relative asset with no known origin is skipped rather than guessed at", () => {
 assert.deepEqual(collectAssetUrls(`<script src="/cdn/shop/t/1/assets/theme.js"></script>`, null), []);
});

test("an external stylesheet is left to the proxy — moving it would break its own relative url() refs", () => {
 // blummier's real base.css says `url(./sparkle.gif)`. Relative to Shopify that resolves and serves
 // (HTTP 200); relative to a Blob key it 404s. Owning the .css trades a working asset for a broken one.
 const urls = collectAssetUrls(`<link rel="stylesheet" href="/cdn/shop/t/1/assets/base.css">`, ORIGIN);
 assert.deepEqual(urls, []);
});

// The rewrite itself, exercised through the real function by stubbing storage with a fake db module
// is more than a unit test should carry — so the ordering property it depends on is pinned here.
import { rewriteAllForTest } from "./rehost-theme-assets.ts";

test("a shorter asset URL never corrupts a longer one it prefixes (longest-first rewrite)", () => {
 // Reproduced before the fix: `theme.js?v=94` became `blob/AAA.js?v=94` — the WRONG file with a
 // dangling query — because the bare `theme.js` entry rewrote first and ate the middle of it.
 const html = `<script src="https://x.com/cdn/assets/theme.js?v=94"></script><img src="https://x.com/cdn/assets/theme.js">`;
 const map = new Map([
  ["https://x.com/cdn/assets/theme.js", "https://blob/AAA.js"],
  ["https://x.com/cdn/assets/theme.js?v=94", "https://blob/BBB.js"],
 ]);
 let out = html;
 for (const [from, to] of [...map].sort((a, b) => b[0].length - a[0].length)) out = rewriteAllForTest(out, from, to, "https://x.com");
 assert.ok(out.includes(`src="https://blob/BBB.js"`), "the versioned theme file points at ITS blob");
 assert.ok(out.includes(`src="https://blob/AAA.js"`), "the bare one points at its own");
 assert.ok(!out.includes("AAA.js?v=94"), "no dangling query on the wrong file");
});

test("a URL stored with &amp; in the HTML is rewritten even though the collector saw it decoded", () => {
 // The real failure: the attribute reads `?v=1&width=700` through cheerio, the raw page holds
 // `?v=1&amp;width=700`, and a rewrite keyed on the decoded form matched nothing.
 const html = `<img src="https://x.com/cdn/shop/files/logo.png?v=1&amp;width=700">`;
 const out = rewriteAllForTest(html, "https://x.com/cdn/shop/files/logo.png?v=1&width=700", "https://blob/L.png", "https://x.com");
 assert.equal(out, `<img src="https://blob/L.png">`);
});

test("a product photo is one the items table owns — a section image with ?width= is NOT skipped", () => {
 // Shopify adds ?width= to every rendered image. Keying on it excluded the logo, hero and all
 // section images on the test store — exactly the branding the blackout gate exists to protect.
 const html = `<img src="/cdn/shop/files/objects_considered.png?v=1&amp;width=500">
  <img src="/cdn/shop/files/IMG_2773.jpg?v=2&amp;width=700">`;
 const productFiles = new Set(["IMG_2773"]); // only this one is a product photo
 const urls = collectAssetUrls(html, ORIGIN, productFiles);
 assert.ok(urls.some((u) => u.includes("objects_considered.png")), "section image is taken");
 assert.ok(!urls.some((u) => u.includes("IMG_2773")), "the product photo is left to the image cron");
});

test("a product-card image IS taken — a product strip in the site chrome is never replaced at serve time", () => {
 // The exclusion this replaces left two photos per page loading from Shopify on a fresh crawl.
 const html = `<img src="/cdn/shop/files/logo.png?width=300">
  <a href="/products/silk-dress"><img src="/cdn/shop/files/IMG_1.jpg?width=533" srcset="/cdn/shop/files/IMG_1.jpg?width=165 165w"></a>`;
 const urls = collectAssetUrls(html, ORIGIN);
 assert.ok(urls.some((u) => u.includes("logo.png")), "logo taken");
 assert.ok(urls.some((u) => u.includes("IMG_1")), "product-card image taken too");
});

import { variantKey, pickVariant } from "./rehost-theme-assets.ts";

test("a srcset ladder is ONE file: every width variant shares a key, one variant is uploaded", () => {
 const rungs = [165, 360, 533, 720, 940, 1066, 1200, 1500, 1780, 2000, 3000].map((w) => `https://x.com/cdn/shop/files/a.jpg?v=17&width=${w}`);
 const keys = new Set(rungs.map(variantKey));
 assert.equal(keys.size, 1, "all rungs collapse to one key");
 assert.equal([...keys][0], "https://x.com/cdn/shop/files/a.jpg?v=17", "the fingerprint survives, the sizing does not");
 assert.equal(pickVariant(rungs), "https://x.com/cdn/shop/files/a.jpg?v=17&width=2000", "largest rung at or under 2048px — never the 3000px original");
});

test("pickVariant: no sizing → the url itself; everything oversized → the smallest", () => {
 assert.equal(pickVariant(["https://x.com/a.js?v=1"]), "https://x.com/a.js?v=1");
 assert.equal(pickVariant(["https://x.com/a.png?width=4000", "https://x.com/a.png?width=3000"]), "https://x.com/a.png?width=3000");
});

import { rehostPageAssets } from "./rehost-theme-assets.ts";

test("rehostPageAssets: a shared asset uploads once across pages, every rung repoints, &amp; form included", async () => {
 const cache = new Map<string, string>();
 const taken: string[] = [];
 const take = async (u: string) => { taken.push(u); return { url: `https://blob/${taken.length}.bin`, bytes: 10 }; };
 const page1 = `<script src="https://x.com/cdn/shop/t/1/assets/theme.js?v=7"></script>
  <img src="https://x.com/cdn/shop/files/logo.png?v=1&amp;width=300" srcset="https://x.com/cdn/shop/files/logo.png?v=1&amp;width=150 150w, https://x.com/cdn/shop/files/logo.png?v=1&amp;width=300 300w">`;
 const page2 = `<script src="https://x.com/cdn/shop/t/1/assets/theme.js?v=7"></script><p>same theme, second page</p>`;
 const out1 = await rehostPageAssets(page1, "https://x.com", "s", cache, take);
 const out2 = await rehostPageAssets(page2, "https://x.com", "s", cache, take);
 assert.equal(taken.length, 2, "theme.js and logo — two uploads, not three (page 2 hit the cache)");
 assert.ok(taken.some((u) => u.includes("width=300")), "the larger logo rung was the one taken");
 assert.ok(!out1.includes("x.com/cdn"), "page 1 has no source references left");
 assert.ok(!out2.includes("x.com/cdn"), "page 2 has no source references left");
 assert.ok(out1.includes("srcset=\"https://blob/"), "the srcset ladder repointed too");
 const uploaderFailed = async () => null;
 const out3 = await rehostPageAssets(`<img src="https://x.com/cdn/shop/files/hero.jpg">`, "https://x.com", "s", new Map(), uploaderFailed);
 assert.ok(out3.includes("x.com/cdn/shop/files/hero.jpg"), "a failed upload leaves the source reference intact — never a broken URL");
});

test("import-map module URLs are collected — a theme that loads only through an importmap has no src to find", () => {
 const html = `<script type="importmap">{ "imports": { "vendor": "//x.com/cdn/shop/t/56/assets/vendor.bundle.min.js?v=15", "data-island": "//x.com/cdn/shop/t/56/assets/data-island.bundle.js?v=18" } }</script>`;
 const urls = collectAssetUrls(html, "https://x.com");
 assert.ok(urls.includes("https://x.com/cdn/shop/t/56/assets/vendor.bundle.min.js?v=15"));
 assert.ok(urls.includes("https://x.com/cdn/shop/t/56/assets/data-island.bundle.js?v=18"));
});

test("rewriteAll repoints the protocol-relative and root-relative forms, not just the absolute one", () => {
 const html = `<a style="background: url(//x.com/cdn/shop/articles/a.png?v=1)"></a>
  <script type="importmap">{"imports":{"vendor":"//x.com/cdn/shop/t/1/assets/vendor.js?v=15"}}</script>
  <img src="/cdn/shop/files/logo.png"><img src="/cdn/shop/files/logo.png?v=2">`;
 let out = rewriteAllForTest(html, "https://x.com/cdn/shop/articles/a.png?v=1", "https://blob/A.png", "https://x.com");
 out = rewriteAllForTest(out, "https://x.com/cdn/shop/t/1/assets/vendor.js?v=15", "https://blob/V.js", "https://x.com");
 out = rewriteAllForTest(out, "https://x.com/cdn/shop/files/logo.png", "https://blob/L.png", "https://x.com");
 assert.ok(out.includes("url(https://blob/A.png)"), "inline-style protocol-relative background repointed");
 assert.ok(out.includes('"vendor":"https://blob/V.js"'), "importmap value repointed");
 assert.ok(out.includes('src="https://blob/L.png"'), "root-relative src repointed");
 assert.ok(out.includes('src="/cdn/shop/files/logo.png?v=2"'), "a DIFFERENT versioned file is left alone — delimited match only");
});

test("extensionless Shopify font URLs are collected — the extension comes from the response, not the URL", () => {
 const html = `<link rel="preload" href="https://x.com/cdn/fonts/karla/karla_n4.40497e07df527e6a50e58fb17ef1950c72f3e32c" as="font">`;
 assert.deepEqual(collectAssetUrls(html, "https://x.com"), ["https://x.com/cdn/fonts/karla/karla_n4.40497e07df527e6a50e58fb17ef1950c72f3e32c"]);
});

test("rewriting is a single pass: a page with thousands of assets rewrites in well under a second", () => {
 // thenicheshop: 369 pages × ~6,000 urls. The per-url split/join took five hours for one store.
 const map = new Map<string, string>();
 let body = "";
 for (let i = 0; i < 6000; i++) {
  const u = `https://cdn.shopify.com/s/files/1/0/files/img${i}.jpg?v=${i}&width=800`;
  map.set(u, `https://blob.test/theme/x/img${i}.jpg`);
  body += `<img src="${u.replace(/&/g, "&amp;")}" data-a="//cdn.shopify.com/s/files/1/0/files/img${i}.jpg?v=${i}&amp;width=800"> <div style="background:url(/s/files/1/0/files/img${i}.jpg?v=${i}&amp;width=800)"></div>\n`;
 }
 const html = `<html><body>${body}</body></html>`;
 const t0 = performance.now();
 const out = rewritePageUrls(html, map, "https://cdn.shopify.com");
 const ms = performance.now() - t0;
 assert.ok(ms < 1000, `took ${ms.toFixed(0)}ms`);
 assert.ok(!out.includes("cdn.shopify.com/s/files"), "absolute + protocol-relative forms rewritten");
 assert.ok(!out.includes("url(/s/files/1/0/files/img5.jpg"), "root-relative form inside url() rewritten");
 assert.ok(out.includes('src="https://blob.test/theme/x/img5.jpg"'));
});

test("single-pass rewrite keeps the longest-first and delimiter rules", () => {
 const map = new Map<string, string>([
  ["https://s.com/cdn/theme.js", "https://blob.test/theme.js"],
  ["https://s.com/cdn/theme.js?v=94", "https://blob.test/theme.v94.js"],
 ]);
 const html = `<script src="https://s.com/cdn/theme.js?v=94"></script><script src="/cdn/theme.js"></script><a href="/cdn/theme.js?v=2">x</a><script src="https://s.com/cdn/theme.js?v=7"></script>`;
 const out = rewritePageUrls(html, map, "https://s.com");
 assert.ok(out.includes('src="https://blob.test/theme.v94.js"'), "exact longer match wins");
 assert.ok(out.includes('src="https://blob.test/theme.js"'), "root-relative whole-attribute form rewritten");
 assert.ok(out.includes('href="/cdn/theme.js?v=2"'), "root-relative prefix inside a longer path is NOT rewritten");
 assert.ok(out.includes('src="https://blob.test/theme.js?v=7"'), "absolute prefix with an unknown query keeps the query");
});

// ── srcset entries, and the delimiters around them ────────────────────────────────────────────────
const SRCSET_MAP = new Map([["https://shop.example.com/cdn/shop/files/a.jpg", "https://blob.example/theme/x/abc.jpg"]]);
const rw = (html: string) => rewritePageUrls(html, SRCSET_MAP, "https://shop.example.com");

test("a protocol-relative srcset entry is repointed at our copy", () => {
 // THE BUG: the asset was copied to our storage and the page kept loading it from the seller. A
 // srcset entry is followed by a width descriptor and a comma, never by a quote or bracket — so the
 // delimiter guard rejected every one. 104 URLs on one store alone, copied and paid for, unused.
 const out = rw(`<img srcset="//shop.example.com/cdn/shop/files/a.jpg 400w, //other/b.jpg 800w">`);
 assert.match(out, /blob\.example/);
 assert.doesNotMatch(out, /shop\.example\.com\/cdn\/shop\/files\/a\.jpg/);
});

test("a srcset entry with no space after the comma is repointed too", () => {
 const out = rw(`<img srcset="//other/b.jpg 200w,//shop.example.com/cdn/shop/files/a.jpg 400w">`);
 assert.match(out, /blob\.example/);
});

test("a root-relative srcset entry is repointed", () => {
 const out = rw(`<img srcset="/cdn/shop/files/a.jpg 400w, /cdn/shop/files/z.jpg 800w">`);
 assert.match(out, /blob\.example/);
});

test("a root-relative src in quotes still works", () => {
 // The case the old guard was written for — it must keep working.
 assert.match(rw(`<img src="/cdn/shop/files/a.jpg">`), /blob\.example/);
});

test("a url() in CSS still works", () => {
 assert.match(rw(`<style>.x{background:url(/cdn/shop/files/a.jpg)}</style>`), /blob\.example/);
});

test("a path that merely looks like ours inside prose is left alone", () => {
 // Widening the delimiters must not start rewriting text. Nothing here is an asset reference.
 const prose = `<p>Our files live at /cdn/shop/files/a.jpg and always have.</p>`;
 assert.equal(rw(prose), prose);
});

test("a longer path that starts with a mapped one is not truncated", () => {
 // The classic delimiter bug in reverse: eating the tail of a URL.
 const html = `<img srcset="/cdn/shop/files/a.jpg.backup 400w">`;
 assert.equal(rw(html), html);
});

// ── attributes the collector never read ──────────────────────────────────────────────────────────
const seen = (html: string) => collectAssetUrls(html, "https://shop.example.com");

test("a lazysizes background is collected", () => {
 // `data-bgset` is how lazysizes carries a background image. we-thieves' collection hero was one,
 // and it is one of only two assets the whole fleet actually lost at cancellation — because nobody
 // ever looked at the attribute. 39 URLs on that store alone.
 const urls = seen(`<div data-bgset="//shop.example.com/cdn/shop/files/hero.jpg 600w, //shop.example.com/cdn/shop/files/hero-2.jpg 1200w"></div>`);
 assert.ok(urls.some((u) => u.includes("hero.jpg")), urls.join(" "));
});

test("a video source carried in a data attribute is collected", () => {
 // ange-archive's hero video is `<source data-video-source="//…/video.mp4">`. The other real loss.
 const urls = seen(`<video><source data-video-source="//shop.example.com/cdn/shop/videos/hero.mp4"></video>`);
 assert.ok(urls.some((u) => u.endsWith("hero.mp4")), urls.join(" "));
});

test("the media URLs a theme stashes for its own JavaScript are collected", () => {
 const html = `<div data-featured-media-url="//shop.example.com/cdn/shop/files/f.jpg"
   data-product-variant-media="//shop.example.com/cdn/shop/files/v.jpg"
   data-original-src="//shop.example.com/cdn/shop/files/o.jpg"></div>`;
 const urls = seen(html);
 for (const f of ["f.jpg", "v.jpg", "o.jpg"]) assert.ok(urls.some((u) => u.endsWith(f)), `${f} — got ${urls.join(" ")}`);
});

test("the social share image is collected", () => {
 // og:image is never rendered, so no check has ever noticed it — and every share card breaks the
 // day a seller cancels. Between 6 and 304 URLs per store, invisible to the blackout gate.
 const urls = seen(`<meta property="og:image" content="https://shop.example.com/cdn/shop/files/share.jpg">`);
 assert.ok(urls.some((u) => u.endsWith("share.jpg")), urls.join(" "));
});

test("imagesrcset on a preload link is collected", () => {
 const urls = seen(`<link rel="preload" as="image" imagesrcset="//shop.example.com/cdn/shop/files/p.jpg 800w">`);
 assert.ok(urls.some((u) => u.endsWith("p.jpg")), urls.join(" "));
});

test("a data attribute that is not a URL is ignored", () => {
 // The sweep must not start treating every data-* value as an asset.
 const urls = seen(`<div data-section-id="template--123" data-index="4" data-title="Our Story"></div>`);
 assert.deepEqual(urls, []);
});

test("a size template is asked for at one concrete size, not left as a placeholder", () => {
 // bag-crush carries 1,239 `data-rimg-template` URLs with a literal `{size}` in them. Fetching that
 // string 404s; substituting a real width gets the file.
 const urls = seen(`<img data-rimg-template="//shop.example.com/cdn/shop/files/t_{size}.jpg">`);
 assert.ok(urls.length > 0, "expected a concrete URL");
 assert.ok(urls.every((u) => !u.includes("{size}")), urls.join(" "));
});

// ── asking storage once per store, not once per asset ────────────────────────────────────────────
test("the blob index answers from memory instead of a call per asset", () => {
 // THE COST: rehostAsset asked Blob "do I have this?" once per asset. montrose-edit has 8,213 of
 // them, four at a time — about 2,000 sequential round trips, 31 minutes, every run, to be told
 // "yes" 8,213 times. One paginated listing per store answers all of it.
 const idx = blobIndexFrom([
  { pathname: "theme/x/aaaa1111bbbb2222.jpg", url: "https://blob/aaaa.jpg", size: 10 },
  { pathname: "theme/x/cccc3333dddd4444.woff2", url: "https://blob/cccc.woff2", size: 20 },
 ]);
 assert.deepEqual(idx.get("theme/x/aaaa1111bbbb2222"), { url: "https://blob/aaaa.jpg", bytes: 10 });
 assert.equal(idx.get("theme/x/cccc3333dddd4444")?.bytes, 20);
 assert.equal(idx.get("theme/x/never-seen"), undefined);
});

test("the index keeps the first copy when a stem somehow has two extensions", () => {
 // A file re-copied after its content-type changed leaves two objects on the same stem. Either is
 // ours and either serves; picking deterministically stops the page flapping between them.
 const idx = blobIndexFrom([
  { pathname: "theme/x/dup.jpg", url: "https://blob/one.jpg", size: 1 },
  { pathname: "theme/x/dup.png", url: "https://blob/two.png", size: 2 },
 ]);
 assert.equal(idx.get("theme/x/dup")?.url, "https://blob/one.jpg");
});

test("an object that is not under a theme stem is ignored", () => {
 const idx = blobIndexFrom([{ pathname: "products/x/photo.jpg", url: "https://blob/p.jpg", size: 1 }]);
 assert.equal(idx.size, 1, "still indexed by its own stem, not dropped");
 assert.equal(idx.get("products/x/photo")?.url, "https://blob/p.jpg");
});

test("a rimg size template is repointed at our copy, not left on the seller's CDN", () => {
 // bag-crush's theme lazy-loads through `data-rimg-template`: its script reads that attribute,
 // substitutes a width, blanks `src` to an SVG placeholder and loads from there. We were copying
 // the image to Blob and setting `src` correctly, then the theme overwrote `src` from a template
 // still pointing at mybagcrush.com — 1,391 references across her 44 pages, every one of which
 // would die the day she cancels Shopify. `src` looked right in the markup, so nothing caught it.
 const map = new Map([["https://shop.example.com/cdn/shop/files/bag_1024x.jpg?v=9", "https://blob.test/theme/x/aa.jpg"]]);
 const html = `<img src="https://blob.test/theme/x/aa.jpg" data-rimg="lazy" data-rimg-template="//shop.example.com/cdn/shop/files/bag_{size}.jpg?v=9">`;
 const out = rewritePageUrls(html, map, "https://shop.example.com");
 assert.match(out, /data-rimg-template="https:\/\/blob\.test\/theme\/x\/aa\.jpg"/);
 assert.doesNotMatch(out, /\{size\}/); // no placeholder left for the theme to substitute
 assert.doesNotMatch(out, /shop\.example\.com/);
});

test("a rimg template we have no copy of is left exactly as it was", () => {
 // Better a working image on her CDN than a broken one on ours.
 const map = new Map([["https://shop.example.com/cdn/other.jpg", "https://blob.test/theme/x/bb.jpg"]]);
 const html = `<img data-rimg-template="//shop.example.com/cdn/shop/files/bag_{size}.jpg?v=9">`;
 assert.equal(rewritePageUrls(html, map, "https://shop.example.com"), html);
});

test("a root-relative rimg template resolves against the origin", () => {
 const map = new Map([["https://shop.example.com/cdn/shop/files/b_1024x.jpg", "https://blob.test/theme/x/cc.jpg"]]);
 const html = `<img data-rimg-template="/cdn/shop/files/b_{size}.jpg">`;
 assert.match(rewritePageUrls(html, map, "https://shop.example.com"), /data-rimg-template="https:\/\/blob\.test\/theme\/x\/cc\.jpg"/);
});
