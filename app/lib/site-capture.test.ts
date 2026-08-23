import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { prepareEditMode, applyEdits, injectCollectionItems, deShopify, deLazy } from "./site-capture.ts";

const COLL_ITEMS = [
 { id: "a1", title: "1990s Silk Slip", priceCents: 18000, currency: "USD", images: ["https://x/img1.jpg"] },
 { id: "a2", title: "Beaded Clutch", priceCents: 9500, currency: "USD", images: [] },
];

test("injectCollectionItems replaces a theme product grid with live VYA cards", () => {
 const html = `<html><body><main><h1>Wedding Guest</h1><ul id="product-grid"><li class="old">STALE product 1</li><li class="old">STALE product 2</li></ul></main></body></html>`;
 const out = injectCollectionItems(html, COLL_ITEMS);
 const $ = cheerio.load(out);
 assert.equal($("#product-grid").length, 0, "the static grid is gone");
 assert.equal($(".old").length, 0, "stale products removed");
 assert.equal($("[data-vya-collection] [data-vya-add]").length, 2, "one add-to-bag per live item");
 assert.match(out, /1990s Silk Slip/);
 assert.match(out, /data-vya-add="a1"/);
 assert.match(out, /\$180/); // formatted price
 assert.match($("[data-vya-collection]").html() || "", /font-family:inherit/); // theme-inheriting
});

test("injectCollectionItems falls back to after the heading when no grid is found", () => {
 const html = `<html><body><main><h2>Cool Stuff</h2><p>some copy</p></main></body></html>`;
 const out = injectCollectionItems(html, COLL_ITEMS);
 const $ = cheerio.load(out);
 assert.equal($("[data-vya-collection]").length, 1);
 // grid sits immediately after the heading
 assert.ok($("h2").next().is("[data-vya-collection]"));
});

test("injectCollectionItems is a no-op when the collection has no items", () => {
 const html = `<html><body><ul id="product-grid"><li>keep me</li></ul></body></html>`;
 assert.equal(injectCollectionItems(html, []), html);
});

// A theme that uses NEITHER .shopify-section NOR <section> — the fallback path.
const PLAIN = `<!doctype html><html><head></head><body>
<header><nav>nav</nav></header>
<main>
  <div class="block a"><h2>Alpha</h2><p>alpha body</p></div>
  <div class="block b"><h2>Bravo</h2><p>bravo body</p></div>
  <div class="block c"><h2>Charlie</h2><p>charlie body</p></div>
</main>
<footer><p>footer</p></footer>
</body></html>`;

function secTexts(html: string): string[] {
 const $ = cheerio.load(html);
 // The three content blocks, in document order, by their h2.
 return $("main > div").map((_, el) => $(el).find("h2").first().text()).get();
}

test("prepareEditMode tags sections via the main-children fallback (no <section> in theme)", () => {
 const out = prepareEditMode(PLAIN, "shop", "/");
 const $ = cheerio.load(out);
 const secs = $("[data-vya-sec]");
 assert.equal(secs.length, 3, "all three top-level content blocks become sections");
 // header/footer must NOT be tagged as sections
 assert.equal($("header[data-vya-sec]").length, 0);
 assert.equal($("footer[data-vya-sec]").length, 0);
 // text leaves are editable
 assert.ok($("[data-vya-eid]").length >= 6, "headings + paragraphs are editable");
});

test("applyEdits reorders sections by the `sections` order array", () => {
 const out = applyEdits(PLAIN, { sections: [2, 0, 1] });
 assert.deepEqual(secTexts(out), ["Charlie", "Alpha", "Bravo"]);
});

test("applyEdits duplicates (repeat index) and deletes (omit index)", () => {
 const dup = applyEdits(PLAIN, { sections: [0, 0, 1, 2] });
 assert.deepEqual(secTexts(dup), ["Alpha", "Alpha", "Bravo", "Charlie"]);
 const del = applyEdits(PLAIN, { sections: [1, 2] });
 assert.deepEqual(secTexts(del), ["Bravo", "Charlie"]);
});

test("text edits are preserved through a section reorder in the same save", () => {
 // eid ordering follows document order of text leaves: 0=Alpha,1=alpha body,2=Bravo,...
 const out = applyEdits(PLAIN, { edits: [{ eid: 0, text: "ALPHA!" }], sections: [2, 1, 0] });
 const $ = cheerio.load(out);
 assert.deepEqual(secTexts(out), ["Charlie", "Bravo", "ALPHA!"]);
 assert.equal($("main > div").last().find("h2").text(), "ALPHA!", "edited text rode along with its reordered section");
});

test("legacy dupSecs/deleteSecs still work when no `sections` array is sent", () => {
 const out = applyEdits(PLAIN, { deleteSecs: [1] });
 assert.deepEqual(secTexts(out), ["Alpha", "Charlie"]);
});

// A Shopify-style theme: .shopify-section wrappers take precedence over the fallback.
const SHOPIFY = `<!doctype html><html><body>
<div class="shopify-section s1"><h2>One</h2></div>
<div class="shopify-section s2"><h2>Two</h2></div>
<div class="shopify-section s3"><h2>Three</h2></div>
</body></html>`;

test("applyEdits applies text styles (merged) and section background", () => {
 const out = applyEdits(PLAIN, {
  styles: [{ eid: 0, style: "color:#c00;text-align:center;font-size:28px" }],
  secStyles: [{ sec: 1, style: "background-color:#f5f0e8" }],
 });
 const $ = cheerio.load(out);
 const h2 = $("main > div").first().find("h2");
 assert.match(h2.attr("style") || "", /color:#c00/);
 assert.match(h2.attr("style") || "", /text-align:center/);
 assert.match(h2.attr("style") || "", /font-size:28px/);
 assert.match($("main > div").eq(1).attr("style") || "", /background-color:#f5f0e8/);
});

test("style deltas keep !important so they can override a theme's own styles", () => {
 const out = applyEdits(PLAIN, { styles: [{ eid: 0, style: "color:#c00 !important;font-size:30px !important" }] });
 const style = cheerio.load(out)("main > div").first().find("h2").attr("style") || "";
 assert.match(style, /color:#c00 !important/);
 assert.match(style, /font-size:30px !important/);
});

test("style controls drop disallowed properties and dangerous values", () => {
 const out = applyEdits(PLAIN, { styles: [{ eid: 0, style: "color:#c00;position:fixed;background:url(x);font-size:20px" }] });
 const style = cheerio.load(out)("main > div").first().find("h2").attr("style") || "";
 assert.match(style, /color:#c00/);
 assert.match(style, /font-size:20px/);
 assert.ok(!/position/.test(style), "position is not whitelisted");
 assert.ok(!/url\(/.test(style), "url() values are stripped");
});

test("a style delta merges over an element's existing inline style", () => {
 const HTML = `<main><div><p style="margin:0;color:blue">hi</p></div></main>`;
 // p is the only editable leaf → eid 0.
 const out = applyEdits(HTML, { styles: [{ eid: 0, style: "color:#111;font-size:18px" }] });
 const st = cheerio.load(out)("p").attr("style") || "";
 assert.match(st, /margin:0/);       // preserved
 assert.match(st, /color:#111/);     // overridden
 assert.match(st, /font-size:18px/); // added
});

test("applyEdits inserts a new theme-inheriting block between existing sections", () => {
 // Order: original 0, a new text block, original 1.
 const out = applyEdits(PLAIN, { sections: [0, { new: "text", text: "Our Promise\nEvery piece is one of one." }, 1, 2] });
 const $ = cheerio.load(out);
 const blocks = $("main > div, main > [data-vya-block]");
 // New block is present, inherits (no hard-coded font-family/color values beyond inherit).
 const added = $("[data-vya-block]");
 assert.equal(added.length, 1);
 assert.match(added.html() || "", /Our Promise/);
 assert.match(added.attr("style") || "", /font-family:inherit/);
 assert.equal($("[data-vya-block] h2").text(), "Our Promise");
 // It sits after the first original section (Alpha) and before Bravo.
 const texts = blocks.map((_, el) => $(el).find("h2").first().text()).get();
 assert.deepEqual(texts, ["Alpha", "Our Promise", "Bravo", "Charlie"]);
});

test("added blocks survive a later edit round (re-detected as sections)", () => {
 // First add a block, then in a second round reorder treating it as an existing section.
 const round1 = applyEdits(PLAIN, { sections: [0, 1, 2, { new: "divider" }] });
 const tagged = cheerio.load(prepareEditMode(round1, "shop", "/"));
 assert.equal(tagged("[data-vya-sec]").length, 4, "the added divider is re-detected as a section");
});

test("links are tagged and applyEdits rewrites a link's href by id", () => {
 const LINKS = `<!doctype html><html><body><nav><a href="/old-home">Home</a><a href="/shop">Shop</a></nav><a class="btn" href="/old-cta">Shop the sale</a></body></html>`;
 const tagged = prepareEditMode(LINKS, "shop", "/");
 assert.equal(cheerio.load(tagged)("[data-vya-link]").length, 3, "every anchor is tagged");
 // Repoint link #0 (Home) and #2 (the CTA button).
 const out = applyEdits(LINKS, { links: [{ id: 0, href: "/" }, { id: 2, href: "/collections/sale" }] });
 const $ = cheerio.load(out);
 const hrefs = $("a").map((_, el) => $(el).attr("href")).get();
 assert.deepEqual(hrefs, ["/", "/shop", "/collections/sale"]);
});

test("shopify-section wrappers are used as sections and reorder correctly", () => {
 const tagged = prepareEditMode(SHOPIFY, "shop", "/");
 assert.equal(cheerio.load(tagged)("[data-vya-sec]").length, 3);
 const out = applyEdits(SHOPIFY, { sections: [2, 1, 0] });
 const $ = cheerio.load(out);
 assert.deepEqual($(".shopify-section h2").map((_, el) => $(el).text()).get(), ["Three", "Two", "One"]);
});

// The inline Shopify credit is REMOVED, not rewritten — injectPoweredBy adds a fixed
// "Powered by VYA" badge instead, so no inline credit belongs in the seller's footer.
test("deShopify removes the Powered by Shopify credit and payment/Shop-Pay chrome", () => {
 const html = `<html><body><footer>
  <ul class="list-payment"><li><svg>visa</svg></li><li><svg>amex</svg></li></ul>
  <shop-follow-button>Follow on shop</shop-follow-button>
  <small class="copyright__content">© 2026, To Us Vintage Powered by <a href="https://www.shopify.com?utm=x">Shopify</a></small>
 </footer></body></html>`;
 const $ = cheerio.load(html);
 deShopify($);
 const out = $.html();
 assert.equal($(".list-payment").length, 0, "payment badges removed");
 assert.equal($("shop-follow-button").length, 0, "Follow on shop removed");
 assert.equal($('a[href*="shopify.com"]').length, 0, "shopify.com link gone");
 assert.doesNotMatch(out, /Powered by Shopify/);
 // Removing the <a> must not strand the lead-in text — "© 2026, Store Powered by" reads broken.
 assert.doesNotMatch(out, /Powered by/, "no dangling 'Powered by' left behind");
 assert.match($(".copyright__content").text().trim(), /^© 2026, To Us Vintage$/);
});

test("deShopify removes an unlinked 'Powered by Shopify' text node", () => {
 const $ = cheerio.load(`<footer><small>Powered by Shopify</small></footer>`);
 deShopify($);
 assert.doesNotMatch($.html(), /Powered by/);
});

test("deLazy fills lazysizes {width} templates and promotes data-src", () => {
 const $ = cheerio.load(`<img class="grid-product__image lazyload" data-src="//cdn/shop/a_{width}x.jpg" data-widths="[180,360,1080,1800]">`);
 deLazy($, "https://store.com/");
 const img = $("img");
 assert.equal(img.attr("src"), "https://cdn/shop/a_1080x.jpg", "{width} filled with the largest ≤1200 rung, absolutized");
 assert.ok(!/\{width\}/.test(img.attr("src") || ""), "no template left");
 assert.ok(!img.hasClass("lazyload") && img.hasClass("lazyloaded"), "flipped to visible");
});

test("deLazy unwraps a bg <noscript> fallback but dedupes a product one", () => {
 const $ = cheerio.load(
  `<div class="hero lazyload" data-bgset="//cdn/hero_{width}x.jpg"></div><noscript><img class="hero" src="//cdn/hero_1800x.jpg"></noscript>` +
  `<a><img class="p lazyload" data-src="//cdn/p_600x.jpg"></a><noscript><img class="p" src="//cdn/p_600x.jpg"></noscript>`
 );
 deLazy($, "https://store.com/");
 assert.equal($("img.hero").length, 1, "hero fallback surfaced");
 assert.equal($("img.hero").attr("src"), "https://cdn/hero_1800x.jpg");
 assert.equal($("img.p").length, 1, "product image not duplicated (noscript dropped)");
});

test("deLazy applies a data-bgset background when there is no noscript fallback", () => {
 const $ = cheerio.load(`<div class="banner lazyload" data-bgset="//cdn/b_{width}x.jpg 1200w"></div>`);
 deLazy($, "https://store.com/");
 const style = $("div.banner").attr("style") || "";
 assert.match(style, /background-image:url\('https:\/\/cdn\/b_1600x\.jpg'\)/);
});
