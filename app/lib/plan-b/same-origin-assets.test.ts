import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { sameOriginAssets } from "./same-origin-assets.ts";

const ORIGIN = "https://angearchive.com";

// A browser-verified failure, not a hypothetical: a sweep of all 22 hosted storefronts found 39
// cross-origin scripts on this store, 35 of them ES modules. Modules REQUIRE CORS headers, the
// seller's own domain does not send them for our origin, and Chrome refuses every one — so the
// theme's entire JavaScript never runs. Add to cart is then a button with nothing bound to it.
const PAGE = `<html><head>
 <script src="https://angearchive.com/cdn/shop/t/1/assets/quick-add.js?v=1020" type="module"></script>
 <script src="https://angearchive.com/cdn/shopifycloud/importmap-polyfill/es-modules-shim.2.4.0.js"></script>
 <link rel="modulepreload" href="https://angearchive.com/cdn/shop/t/1/assets/cart.js?v=99">
 <link rel="preload" as="font" href="https://angearchive.com/cdn/fonts/inter.woff2">
 <script src="https://cdn.shopify.com/shopifycloud/shop-js/loader.js"></script>
 <script src="https://www.googletagmanager.com/gtag/js?id=G-XYZ"></script>
 <script src="/cdn/shop/t/1/assets/already-relative.js"></script>
 <script>console.log("inline stays put")</script>
</head><body><img src="https://angearchive.com/cdn/shop/files/photo.jpg?v=2"></body></html>`;

const out = () => sameOriginAssets(PAGE, ORIGIN);

test("theme scripts on the store's own domain become same-origin", () => {
 const $ = cheerio.load(out());
 const src = $('script[type="module"]').attr("src");
 assert.equal(src, "/cdn/shop/t/1/assets/quick-add.js?v=1020", "must go through VYA's /cdn proxy");
});

test("the query string survives — theme assets are fingerprinted by it", () => {
 assert.match(out(), /already-relative\.js/);
 assert.match(out(), /quick-add\.js\?v=1020/);
});

test("classic scripts are rewritten too, not just modules", () => {
 const $ = cheerio.load(out());
 const polyfill = $('script[src*="es-modules-shim"]').attr("src");
 assert.equal(polyfill, "/cdn/shopifycloud/importmap-polyfill/es-modules-shim.2.4.0.js");
});

test("modulepreload and preload hints follow, or the browser fetches them twice", () => {
 const $ = cheerio.load(out());
 assert.equal($('link[rel="modulepreload"]').attr("href"), "/cdn/shop/t/1/assets/cart.js?v=99");
 assert.equal($('link[rel="preload"]').attr("href"), "/cdn/fonts/inter.woff2");
});

test("images on the store's own domain come through the proxy as well", () => {
 const $ = cheerio.load(out());
 assert.equal($("img").attr("src"), "/cdn/shop/files/photo.jpg?v=2");
});

// Only /cdn/ — that is the one path shape the proxy knows how to serve. Rewriting anything else
// would point the browser at a VYA route that has no idea what to do with it.
test("leaves paths the proxy cannot serve alone", () => {
 const page = `<html><body><script src="https://angearchive.com/apps/reviews/widget.js"></script></body></html>`;
 const $ = cheerio.load(sameOriginAssets(page, ORIGIN));
 assert.equal($("script").attr("src"), "https://angearchive.com/apps/reviews/widget.js");
});

test("third-party hosts are untouched", () => {
 const $ = cheerio.load(out());
 assert.equal($('script[src*="googletagmanager"]').attr("src"), "https://www.googletagmanager.com/gtag/js?id=G-XYZ");
 assert.equal($('script[src*="cdn.shopify.com"]').attr("src"), "https://cdn.shopify.com/shopifycloud/shop-js/loader.js");
});

test("inline scripts are left exactly as they are", () => {
 assert.match(out(), /inline stays put/);
});

test("an already-relative asset is not touched twice", () => {
 const $ = cheerio.load(out());
 assert.equal($('script[src*="already-relative"]').attr("src"), "/cdn/shop/t/1/assets/already-relative.js");
});

// The store's .myshopify.com address serves the same assets and appears in plenty of captures.
test("the myshopify address counts as the store's own domain", () => {
 const page = `<html><body><script src="https://lamash-store.myshopify.com/cdn/shop/t/1/assets/x.js" type="module"></script></body></html>`;
 const $ = cheerio.load(sameOriginAssets(page, "https://lamash.com", "lamash-store.myshopify.com"));
 assert.equal($("script").attr("src"), "/cdn/shop/t/1/assets/x.js");
});

test("protocol-relative urls are handled", () => {
 const page = `<html><body><script src="//angearchive.com/cdn/shop/t/1/assets/y.js"></script></body></html>`;
 const $ = cheerio.load(sameOriginAssets(page, ORIGIN));
 assert.equal($("script").attr("src"), "/cdn/shop/t/1/assets/y.js");
});

test("http and https forms of the same domain both count", () => {
 const page = `<html><body><script src="http://angearchive.com/cdn/shop/t/1/assets/z.js"></script></body></html>`;
 const $ = cheerio.load(sameOriginAssets(page, ORIGIN));
 assert.equal($("script").attr("src"), "/cdn/shop/t/1/assets/z.js");
});

test("returns the page unchanged when there is no capture origin to compare against", () => {
 assert.equal(sameOriginAssets(PAGE, null), PAGE);
 assert.equal(sameOriginAssets(PAGE, ""), PAGE);
});

test("survives junk instead of throwing", () => {
 for (const junk of ["", "<html>", "not html"]) {
  assert.equal(typeof sameOriginAssets(junk, ORIGIN), "string");
 }
});

// ── Import maps and inline scripts ───────────────────────────────────────────────────────────────
// Rewriting only HTML attributes left three stores still broken: modern Shopify themes resolve most
// of their modules through an IMPORT MAP, and reference more assets from inside inline scripts.
// Those URLs never appear as a src attribute, so the first pass never saw them.
test("import map specifiers are made same-origin", () => {
 const page = `<html><head><script type="importmap">{"imports":{
  "@theme/section-hydration":"https://angearchive.com/cdn/shop/t/1/assets/section-hydration.js?v=17",
  "@theme/cart":"//angearchive.com/cdn/shop/t/1/assets/cart.js",
  "vendor":"https://cdn.jsdelivr.net/npm/x.js"}}</script></head></html>`;
 const out = sameOriginAssets(page, ORIGIN);
 assert.match(out, /"@theme\/section-hydration":"\/cdn\/shop\/t\/1\/assets\/section-hydration\.js\?v=17"/);
 assert.match(out, /"@theme\/cart":"\/cdn\/shop\/t\/1\/assets\/cart\.js"/);
 assert.match(out, /https:\/\/cdn\.jsdelivr\.net/, "third-party specifiers stay put");
});

test("own-domain urls inside inline scripts are made same-origin", () => {
 const page = `<html><body><script>
  const a = "https://angearchive.com/cdn/shop/t/1/assets/a.js";
  import("//angearchive.com/cdn/shop/t/1/assets/b.js");
 </script></body></html>`;
 const out = sameOriginAssets(page, ORIGIN);
 assert.ok(!out.includes("angearchive.com/cdn/"), "no own-domain cdn url should survive");
 assert.match(out, /"\/cdn\/shop\/t\/1\/assets\/a\.js"/);
});

// JSON embedded in JavaScript escapes its slashes; the same URL then reads https:\/\/host\/cdn\/…
test("escaped-slash urls inside inline scripts are handled", () => {
 const page = `<html><body><script>var m={"u":"https:\\/\\/angearchive.com\\/cdn\\/shop\\/t\\/1\\/assets\\/c.js"}</script></body></html>`;
 const out = sameOriginAssets(page, ORIGIN);
 assert.ok(!/angearchive\.com\\?\/cdn/.test(out), "the escaped form must be rewritten too");
});

test("inline scripts that mention the domain outside /cdn are left alone", () => {
 const page = `<html><body><script>var shop="https://angearchive.com/products/x";</script></body></html>`;
 assert.match(sameOriginAssets(page, ORIGIN), /https:\/\/angearchive\.com\/products\/x/);
});

test("a data: URI in a srcset survives untouched — its own commas are not separators", () => {
 // A srcset is comma-separated, but a data: URI CONTAINS a comma. Splitting on commas cut
 // `data:image/svg+xml;utf8,<svg…>` in half and rejoining with ", " put a space after the comma —
 // which in a srcset separates a URL from its descriptor, so the candidate became nonsense. The
 // browser prefers srcset over src, so our correctly re-hosted `src` was never used: 29 images on
 // every bag-crush product page rendered blank and the thumbnail strip collapsed to a sliver.
 const svg = "data:image/svg+xml;utf8,<svg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201%201'/>";
 const html = `<img src="https://cdn.shopify.com/s/files/1/a.jpg" srcset="${svg}" data-rimg="lazy">`;
 const out = sameOriginAssets(html, "https://shop.example.com", null);
 assert.ok(out.includes(`srcset="${svg}"`), `srcset was altered: ${out.slice(0, 200)}`);
 assert.ok(!out.includes("utf8, <svg"), "a space was inserted after the data URI's comma");
});

test("a real multi-URL srcset is still rewritten", () => {
 // The fix must not stop the thing this function exists to do.
 const html = `<img srcset="https://cdn.shopify.com/a.jpg 400w, https://cdn.shopify.com/b.jpg 800w">`;
 const out = sameOriginAssets(html, "https://shop.example.com", null);
 assert.ok(out.includes("400w") && out.includes("800w"), "descriptors were lost");
});
