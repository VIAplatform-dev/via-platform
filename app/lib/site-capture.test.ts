import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { prepareEditMode, applyEdits, injectCollectionItems, injectLiveGrids, injectShim, deShopify, deLazy, rewireCommerce, injectCartPage, injectSqsCartPage, applyCartState, renderNativeProduct, stripScripts, capturedGridProductHandles, detectGridHandles } from "./site-capture.ts";

const COLL_ITEMS = [
 { id: "a1", title: "1990s Silk Slip", priceCents: 18000, currency: "USD", images: ["https://x/img1.jpg"] },
 { id: "a2", title: "Beaded Clutch", priceCents: 9500, currency: "USD", images: [] },
];

test("injectCollectionItems reuses the theme's own card so the live grid matches the source", () => {
 // The theme's <ul> and its card markup are KEPT (that's what carries the 4-up layout, type and
 // spacing); only the contents are swapped. Replacing them with markup of our own rendered a
 // cramped 6-up grid that looked nothing like the store it was mirroring.
 const html = `<html><body><main><h1>Wedding Guest</h1><ul id="product-grid" class="grid product-grid grid--4-col-desktop">
  <li id="Slide-1" class="grid__item"><a class="full-unstyled-link" href="/products/old"><img src="old.jpg" srcset="old.jpg 1x"></a>
   <h3 class="card__heading"><a class="full-unstyled-link" href="/products/old">STALE product</a></h3>
   <span class="price-item">$999.00 USD</span><form action="/cart/add"><button>Add</button></form></li>
 </ul></main></body></html>`;
 const $ = cheerio.load(injectCollectionItems(html, COLL_ITEMS));
 const $grid = $("#product-grid");
 assert.equal($grid.length, 1, "the theme's grid element survives");
 assert.ok(($grid.attr("class") || "").includes("grid--4-col-desktop"), "…and keeps its layout classes");
 assert.equal($grid.attr("data-vya-collection"), "1", "marked live");
 assert.equal($grid.children("li").length, 2, "one theme card per live item");
 assert.equal($grid.find(".grid__item").length, 2, "cards keep the theme's own classes");

 assert.match($.html(), /1990s Silk Slip/);
 assert.equal($grid.find("a[href='/products/a1']").length > 0, true, "links to the live product");
 assert.equal($grid.find("form").length, 0, "quick-add form (would POST to the old platform) removed");
 assert.equal($grid.find("[id]").length, 0, "cloned ids stripped so they aren't duplicated");
 // Price mirrors the theme's own formatting, which showed 2 decimals and a currency code.
 assert.match($grid.find(".price-item").first().text(), /\$180\.00 USD/);
 assert.ok(!$.html().includes("STALE product"), "stale content gone");
});

// ── Generality ────────────────────────────────────────────────────────────────────────────────
// Grid/card detection must be STRUCTURAL, not Shopify/Dawn class names. An earlier class-name
// version found a grid on only 6 of 20 real storefronts; every other theme fell through to a
// generic substitute that looked nothing like the store. These fixtures are deliberately shaped
// like different theme families — no shared class vocabulary between them.

const THEME_SHAPES: [string, string][] = [
 ["dawn-like", `<ul class="grid product-grid grid--4-col-desktop">
   <li class="grid__item"><a href="/products/x"><img src="a.jpg"></a><h3 class="card__heading"><a href="/products/x">Old</a></h3><span class="price-item">$10.00 USD</span></li>
   <li class="grid__item"><a href="/products/y"><img src="b.jpg"></a><h3 class="card__heading"><a href="/products/y">Old</a></h3><span class="price-item">$20.00 USD</span></li>
   <li class="grid__item"><a href="/products/z"><img src="c.jpg"></a><h3 class="card__heading"><a href="/products/z">Old</a></h3><span class="price-item">$30.00 USD</span></li>
  </ul>`],
 ["prestige-like (no heading tag)", `<div class="ProductList">
   <div class="ProductItem"><a href="/products/x"><img src="a.jpg"><span class="ProductItem__Title">Old One</span><span class="ProductItem__Price">£10</span></a></div>
   <div class="ProductItem"><a href="/products/y"><img src="b.jpg"><span class="ProductItem__Title">Old Two</span><span class="ProductItem__Price">£20</span></a></div>
   <div class="ProductItem"><a href="/products/z"><img src="c.jpg"><span class="ProductItem__Title">Old Three</span><span class="ProductItem__Price">£30</span></a></div>
  </div>`],
 ["bigcommerce-like (flat urls)", `<ul class="productGrid">
   <li class="product"><article><a href="/old-dress/"><img src="a.jpg"></a><h4 class="card-title"><a href="/old-dress/">Old</a></h4><div class="price">$10.00</div></article></li>
   <li class="product"><article><a href="/old-coat/"><img src="b.jpg"></a><h4 class="card-title"><a href="/old-coat/">Old</a></h4><div class="price">$20.00</div></article></li>
   <li class="product"><article><a href="/old-bag/"><img src="c.jpg"></a><h4 class="card-title"><a href="/old-bag/">Old</a></h4><div class="price">$30.00</div></article></li>
  </ul>`],
 ["squarespace-like", `<div class="products-grid">
   <div class="grid-item"><a href="/shop/p/one"><img src="a.jpg"><div class="grid-title">Old</div><div class="product-price">$10</div></a></div>
   <div class="grid-item"><a href="/shop/p/two"><img src="b.jpg"><div class="grid-title">Old</div><div class="product-price">$20</div></a></div>
   <div class="grid-item"><a href="/shop/p/three"><img src="c.jpg"><div class="grid-title">Old</div><div class="product-price">$30</div></a></div>
  </div>`],
];

test("live grids reuse the theme's own card across DIFFERENT theme families", () => {
 for (const [name, grid] of THEME_SHAPES) {
  const out = injectCollectionItems(`<html><body><main>${grid}</main></body></html>`, COLL_ITEMS, (it) => `/p/${it.id}`);
  const $ = cheerio.load(out);
  const $live = $("[data-vya-collection]");
  assert.equal($live.length, 1, `${name}: found the theme's grid`);
  // The theme's own container survives (that's what carries its column layout).
  assert.ok(!($live.attr("style") || "").includes("grid-template-columns"), `${name}: used the theme grid, not a generic substitute`);
  assert.equal($live.children().length, COLL_ITEMS.length, `${name}: one card per live item`);
  assert.ok(out.includes("1990s Silk Slip"), `${name}: live title rendered`);
  assert.ok(!out.includes("Old One") && !out.includes(">Old<"), `${name}: stale content replaced`);
  assert.ok(out.includes("/p/a1"), `${name}: links to the live product`);
 }
});

test("navigation and pagination are never mistaken for product grids", () => {
 // A <ul> of links with icons is shaped like a grid; filling it with products would wreck the nav.
 const html = `<html><body>
  <nav class="header-nav"><ul><li><a href="/a"><img src="i.png">New In</a></li><li><a href="/b"><img src="i.png">Brands</a></li><li><a href="/c"><img src="i.png">Archive</a></li></ul></nav>
  <ul class="pagination__list"><li><a href="?page=1"><img src="p.png">1</a></li><li><a href="?page=2"><img src="p.png">2</a></li><li><a href="?page=3"><img src="p.png">3</a></li></ul>
 </body></html>`;
 const out = injectCollectionItems(html, COLL_ITEMS, (it) => `/p/${it.id}`);
 const $ = cheerio.load(out);
 assert.equal($("nav [data-vya-collection]").length, 0, "nav untouched");
 assert.equal($(".pagination__list[data-vya-collection]").length, 0, "pagination untouched");
 assert.equal($("nav li").length, 3, "nav links intact");
});

test("price substitution finds money by its shape, not by a class name", () => {
 // A theme with no "price" class anywhere — the amount is just text in a span.
 const grid = `<div class="listing">
  <div class="tile"><a href="/x"><img src="a.jpg"><span class="t">Old</span><span class="amt">$10.00</span></a></div>
  <div class="tile"><a href="/y"><img src="b.jpg"><span class="t">Old</span><span class="amt">$20.00</span></a></div>
  <div class="tile"><a href="/z"><img src="c.jpg"><span class="t">Old</span><span class="amt">$30.00</span></a></div>
 </div>`;
 const out = injectCollectionItems(`<html><body>${grid}</body></html>`, COLL_ITEMS, (it) => `/p/${it.id}`);
 assert.match(out, /\$180/, "the live price was written into the theme's own price node");
 assert.ok(!out.includes("$10.00"), "the sample price was replaced");
});

test("injectCollectionItems renders a real <img>, not an empty background div", () => {
 // Dawn ships `a:empty,div:empty,section:empty,…{display:none}`. Rendering the photo as a
 // childless <div style="background:url(...)"> meant the theme hid it outright — live cards
 // showed a title and price above a blank gap. Real <img> elements are never :empty.
 // No theme grid here, so the FALLBACK renderer runs — that's the one that used to emit an
 // empty background div.
 const out = injectCollectionItems(`<html><body><main><h2>Shop</h2></main></body></html>`, COLL_ITEMS);
 const $ = cheerio.load(out);
 const img = $("[data-vya-collection] img").first();
 assert.equal($("[data-vya-collection] img").length, 1, "the item WITH an image renders an <img>");
 assert.equal(img.attr("src"), "https://x/img1.jpg");
 assert.equal(img.attr("alt"), "1990s Silk Slip", "alt text for accessibility");
 assert.match(img.attr("style") || "", /object-fit:cover/);
 // Nothing in the injected grid may be childless — that is the exact shape the theme hides.
 // (CSS :empty counts ANY child node, so the no-image placeholder carries a non-breaking space:
 // U+00A0 is not ASCII whitespace, so it defeats :empty where a plain space would not.)
 $("[data-vya-collection] *").each((_, el) => {
  const $el = $(el);
  if ($el.is("img")) return; // void element, legitimately childless
  assert.ok($el.contents().length > 0, `childless ${(el as { tagName?: string }).tagName} would be hidden by the theme`);
 });
 // The second fixture item has no images — it must still render a visible placeholder.
 const placeholder = $("[data-vya-collection] > div").eq(1).children().first();
 assert.ok(placeholder.text().includes("\u00a0"), "no-image placeholder uses a non-breaking space");
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

// ── injectShim: recovers slideshow/slider/mega-menu interactivity lost when we strip the
// source's JS (site-capture.ts strips ALL <script> — see its top-of-file comment on why).
// These are structural checks (no browser in node --test), so they assert the shim TARGETS
// the real theme markup profiled from live stores, is injected exactly once, and never
// clobbers other injected chrome (the cart drawer's own idempotency guard).

test("injectShim adds the shim script+style before </body>, once", () => {
 const html = `<html><body><p>hi</p></body></html>`;
 const out = injectShim(html);
 assert.match(out, /data-vya-shim="1"/);
 assert.ok(out.indexOf("</body>") > out.indexOf('data-vya-shim="1"'), "shim sits before </body>");
 // Idempotent: running it again on its own output doesn't double-inject.
 const twice = injectShim(out);
 assert.equal(twice, out);
});

test("injectShim falls back to appending when there's no </body>", () => {
 const html = `<p>fragment, no body tag</p>`;
 const out = injectShim(html);
 assert.match(out, /data-vya-shim="1"/);
 assert.ok(out.startsWith(html));
});

test("injectShim targets Dawn's real slideshow-component / slider markup", () => {
 const out = injectShim("<html><body></body></html>");
 // Dawn's hero slideshow + ".slider" rows are laid out by the theme's own CSS, so the shim only
 // needs to WIRE them: target the custom element and the slider buttons Dawn renders server-side.
 assert.match(out, /slideshow-component:not\(\.announcement-bar\)/);
 assert.match(out, /slider-button--prev/);
 assert.match(out, /slider-button--next/);
 // Wires the prev/next controls Dawn already renders (on:click="/previous" / "/next") —
 // the querySelector escapes the colon, so the actual output carries two backslashes here.
 assert.match(out, /on\\\\:click="\/previous"/);
 assert.match(out, /on\\\\:click="\/next"/);
});

test("injectShim rotates the announcement bar without restyling it", () => {
 const out = injectShim("<html><body></body></html>");
 // Dawn already renders one message at a time (grid--1-col + .slider--everywhere); only the
 // auto-rotation is JS. So the shim must drive it WITHOUT adding layout CSS for it.
 assert.match(out, /data-speed/, "uses the theme's own rotation speed");
 assert.match(out, /\.announcement-bar["')\s]/, "the script targets announcement bars");
 assert.doesNotMatch(out, /\.announcement-bar[^\n]*\{[^}]*flex:/, "no layout override for the bar");
});

test("injectShim finds theme-authored sliders structurally, not by one store's class names", () => {
 const out = injectShim("<html><body></body></html>");
 // Naming ".hero-slider-wrapper" only ever fixed the one store that used it. In the browser the
 // shim can read computed styles, so it looks for the SHAPE instead: a flex track that animates
 // transform, holding full-width slides.
 assert.match(out, /getComputedStyle/, "reads real layout rather than guessing from classes");
 assert.match(out, /transitionProperty/);
 assert.match(out, /translateX\(/, "drives the track the way the theme's own JS did");
 assert.doesNotMatch(out, /hero-slider-wrapper/, "no store-specific selector left behind");
});

test("injectShim covers the interactive gaps measured across the store corpus", () => {
 // Frequency of each dead feature across 20 real storefronts, which is why these are the ones
 // handled: predictive search 11/20, quick-add 9/20, sticky header 6/20, image zoom 5/20,
 // collection filters 3/20.
 const out = injectShim("<html><body></body></html>");
 assert.match(out, /input\[type='search'\]/, "search boxes are inert without the theme's widget");
 assert.match(out, /sticky/, "sticky headers were applied by the theme's scroll JS");
 assert.match(out, /quick-add/, "quick-add buttons POSTed to the old platform and are now dead");
 assert.match(out, /data-vya-lightbox/, "image zoom opened via the theme's JS overlay");
 assert.match(out, /sort_by/, "sort + filter forms were submitted by the theme's JS");
});

test("injectShim drives BOTH hand-rolled slider shapes, by structure", () => {
 // Two distinct patterns in the wild, and neither can be found by class name:
 //   • a flex track that animates transform (Blummier's hero)
 //   • slides hidden with display:none, one shown via an "active" class (Bootstrap-style)
 // Only the first was handled, so display:none carousels showed a single frozen slide.
 const out = injectShim("<html><body></body></html>");
 assert.match(out, /transitionProperty/, "flex-transform tracks");
 assert.match(out, /display==="none"/, "display:none / .active carousels");
 assert.match(out, /data-bs-slide/, "including Bootstrap's own control markup");
 assert.doesNotMatch(out, /hero-slider-wrapper|carousel-inner/, "no store-specific selectors");
});

test("injectShim gives library carousels spacing but never restyles the theme's own grids", () => {
 const out = injectShim("<html><body></body></html>");
 // Libraries apply spaceBetween in JS we never load, so the fallback supplies the gap.
 assert.match(out, /\.swiper-wrapper[^{]*\{[^}]*gap:20px/);
 assert.match(out, /calc\(33\.333% - 14px\)/, "slide width accounts for the gap");
 // But Dawn lays out its OWN rows/grids (.grid--4-col-desktop = 25% items, .slider--* = scroll
 // snap). Overriding those flattened the 4-up product grid to 3-up — never do it again.
 assert.doesNotMatch(out, /ul\.slider,\.grid\.slider\{/, "no blanket .slider layout override");
 assert.doesNotMatch(out, /\.slider \.slider__slide/, "no override of Dawn slide widths");
 assert.doesNotMatch(out, /slideshow-component[^{]*\{[^}]*display:flex/, "no override of Dawn slideshows");
});

test("injectShim gives dropdown panels an explicit opaque background", () => {
 const out = injectShim("<html><body></body></html>");
 // Dawn's --color-background is an "R,G,B" triplet meant for rgb(); using it bare would be
 // invalid and leave the panel see-through over the page behind it.
 assert.match(out, /mega-menu\{[^}]*background:#fff/);
});

test("injectShim covers third-party carousel libraries generically by class name", () => {
 const out = injectShim("<html><body></body></html>");
 for (const cls of ["slick-track", "swiper-wrapper", "flickity-slider", "splide__list", "owl-stage"]) {
  assert.ok(out.includes(cls), `missing fallback for ${cls}`);
 }
});

test("injectShim gives mega-menu a hover/click-toggle affordance (it has no native disclosure)", () => {
 const out = injectShim("<html><body></body></html>");
 assert.match(out, /mega-menu\{[^}]*display:none/);
 assert.match(out, /li:hover>mega-menu/);
 assert.match(out, /vya-open/);
});

test("injectShim flips the no-js progressive-enhancement flag some themes gate on", () => {
 const out = injectShim("<html><body></body></html>");
 assert.match(out, /no-js/);
 assert.match(out, /classList\.add\("js"\)/);
});

test("injectShim and injectCart use distinct idempotency markers and coexist", () => {
 const html = `<html><body><p>hi</p></body></html>`;
 const withCart = html.indexOf("</body>") !== -1
  ? html.replace("</body>", `<div id="vya-cart-drawer"></div></body>`)
  : html;
 const out = injectShim(withCart);
 assert.match(out, /vya-cart-drawer/, "cart chrome untouched");
 assert.match(out, /data-vya-shim="1"/, "shim added alongside it");
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

// NOTE: these two originally asserted a "Powered by Shopify → Powered by VYA" text SWAP. That was
// the old behavior; deShopify now REMOVES the credit outright and the badge is added at serve time
// by injectPoweredBy (see its own guard + the comment in deShopify). Updated to the current
// contract — they were previously invisible because this file failed to import under `node --test`.
test("deShopify removes the Powered by Shopify credit and Shop-Pay chrome", () => {
 const html = `<html><body><footer>
  <ul class="list-payment"><li><svg>visa</svg></li><li><svg>amex</svg></li></ul>
  <shop-follow-button>Follow on shop</shop-follow-button>
  <small class="copyright__content">© 2026, To Us Vintage Powered by <a href="https://www.shopify.com?utm=x">Shopify</a></small>
 </footer></body></html>`;
 const $ = cheerio.load(html);
 deShopify($);
 const out = $.html();
 assert.equal($(".list-payment").length, 1, "payment badges KEPT (store's own footer design)");
 assert.equal($("shop-follow-button").length, 0, "Follow on shop removed");
 assert.equal($('a[href*="shopify.com"]').length, 0, "shopify.com link gone");
 assert.doesNotMatch(out, /Powered by <a|Powered by Shopify/, "no Shopify credit left behind");
 assert.match(out, /©\s*2026, To Us Vintage/, "the store's own copyright survives");
});

test("deShopify removes an unlinked 'Powered by Shopify' text node", () => {
 const $ = cheerio.load(`<footer><small>Powered by Shopify</small></footer>`);
 deShopify($);
 assert.doesNotMatch($.html(), /Powered by Shopify/);
});

// ── Regression: a captured Dawn store lost its ENTIRE nav row. Root cause was a substring
// selector — [class*="localization"], meant for the small country/currency picker — matching
// Dawn's MODIFIER flag `header--has-localization`, which sits on the <header> itself. cheerio
// removed the whole header (nav + logo). Real bug, seen on blummier.com.

test("deShopify keeps the header/nav when a theme flags it with a *--has-localization modifier", () => {
 const $ = cheerio.load(`<html><body>
  <header class="header header--middle-center header--has-account header--has-localization">
   <a class="header__logo" href="/">Blummier</a>
   <nav class="header__inline-menu"><ul class="list-menu"><li><a href="/collections/new-in">NEW IN</a></li><li><a href="/collections">BRANDS</a></li></ul></nav>
   <localization-form><form action="/localization"><select class="localization-form__select"></select></form></localization-form>
  </header>
 </body></html>`);
 deShopify($);
 const out = $.html();
 assert.equal($("header").length, 1, "the header itself survives");
 assert.equal($("nav.header__inline-menu").length, 1, "the nav survives");
 assert.match(out, /NEW IN/);
 assert.match(out, /BRANDS/);
 // …and the actual localization widget is still stripped.
 assert.equal($("localization-form").length, 0, "country/currency picker removed");
});

test("deShopify still strips localization widgets that are NOT landmarks", () => {
 const $ = cheerio.load(`<html><body>
  <div class="localization-wrapper"><span>United States (USD $)</span></div>
  <div class="localization-form__currency">USD</div>
  <div class="footer__localization">Country</div>
  <div class="header__icons--localization">picker</div>
  <div class="keep-me">real content</div>
 </body></html>`);
 deShopify($);
 assert.equal($(".localization-wrapper").length, 0);
 assert.equal($(".localization-form__currency").length, 0);
 assert.equal($(".footer__localization").length, 0);
 assert.equal($(".header__icons--localization").length, 0);
 assert.equal($(".keep-me").length, 1, "unrelated content untouched");
});

test("deShopify keeps the header icon bar when localization shares its container", () => {
 // Blummier hangs `header-localization` on the SAME div that holds search/account/wishlist/cart —
 // removing the container took the whole icon bar with it. Only the picker itself should go.
 const $ = cheerio.load(`<html><body><header class="header header--has-localizations">
  <div class="header__icons header__icons--localization header-localization">
   <a href="/search" class="icon-search">search</a>
   <a href="/account" class="icon-account">account</a>
   <a href="/cart" class="icon-cart">cart</a>
   <localization-form><form action="/localization"><span class="icon-search">filter</span>USD $</form></localization-form>
  </div>
 </header></body></html>`);
 deShopify($);
 assert.equal($("div.header__icons").length, 1, "icon bar survives");
 assert.equal($('a[href="/cart"]').length, 1, "cart icon survives");
 assert.equal($('a[href="/account"]').length, 1, "account icon survives");
 assert.equal($('a[href="/search"]').length, 1, "search icon survives");
 assert.equal($("localization-form").length, 0, "…but the currency picker is gone");
});

test("deShopify keeps the footer payment badges (part of the store's own design)", () => {
 const $ = cheerio.load(`<footer><ul class="list-payment"><li><svg>visa</svg></li><li><svg>amex</svg></li></ul></footer>`);
 deShopify($);
 assert.equal($(".list-payment").length, 1);
 assert.equal($(".list-payment li").length, 2);
});

test("deShopify never removes a wrapper that contains the site nav", () => {
 // A payment-badge selector that (wrongly) also matches an ancestor of the nav must not win.
 const $ = cheerio.load(`<html><body>
  <div class="footer-payment-and-nav"><nav><a href="/a">Shop</a></nav></div>
 </body></html>`);
 deShopify($);
 assert.equal($("nav").length, 1, "nav-containing wrapper is protected");
 assert.match($.html(), /Shop/);
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

test("deLazy leaves a <noscript> fallback wrapped under Plan B (keepScripts) — theme JS resolves it", () => {
 // A Plan B page keeps the theme's own script running; it resolves the sibling `[data-rimg=lazy]`
 // image itself, exactly like the real site. Unwrapping the noscript tag here would turn its inert
 // fallback into a second, permanently visible copy stacked next to the one the theme's JS loads —
 // every hero/promo image on the page rendering twice. Left wrapped, its content stays plain text to
 // any selector (a real browser with scripting enabled treats <noscript> content the same way) —
 // the standalone lazy sibling is the only queryable, live `<img>`.
 const $ = cheerio.load(
  `<noscript data-rimg-noscript><img class="hero" data-rimg="noscript" src="//cdn/hero_1800x.jpg"></noscript>` +
  `<img class="hero" data-rimg="lazy" src="//cdn/hero_1800x.jpg" srcset="data:image/svg+xml;utf8,<svg width='10' height='10'></svg>">`
 );
 deLazy($, "https://store.com/", true);
 assert.equal($("noscript").length, 1, "noscript wrapper left intact under Plan B");
 assert.equal($("img.hero").length, 1, "only the standalone lazy image is live/queryable — the noscript one stays inert");
 assert.match($.html(), /<noscript[^>]*><img class="hero" data-rimg="noscript"/, "noscript's own content untouched");
});

test("stripScripts surfaces a <noscript> fallback so a script-free render still shows a photo", () => {
 // Whatever mode a page was originally captured in, a script-free render (Plan A, or Plan B viewed
 // as a fallback) has no JS to resolve the theme's own lazy sibling — so without this, the shopper
 // would see neither image at all. The lazy sibling is left as-is (still `data-rimg="lazy"`): the
 // theme's OWN CSS keeps it opacity:0 forever with no script to flip it to "loaded", so it stays
 // safely invisible without deleting it — it isn't a duplicate to clean up here, just inert markup.
 const html = `<noscript data-rimg-noscript><img class="hero" data-rimg="noscript" src="https://cdn/hero_1800x.jpg"></noscript>` +
  `<img class="hero" data-rimg="lazy" src="https://cdn/hero_1800x.jpg">`;
 const out = stripScripts(html);
 const $ = cheerio.load(out);
 assert.equal($("noscript").length, 0, "noscript unwrapped");
 assert.equal($("img.hero[data-rimg=noscript]").length, 1, "fallback surfaced, visible by default");
 assert.equal($("img.hero[data-rimg=lazy]").length, 1, "lazy sibling untouched — CSS keeps it opacity:0 with no JS to load it");
});

test("deLazy applies a data-bgset background when there is no noscript fallback", () => {
 const $ = cheerio.load(`<div class="banner lazyload" data-bgset="//cdn/b_{width}x.jpg 1200w"></div>`);
 deLazy($, "https://store.com/");
 const style = $("div.banner").attr("style") || "";
 assert.match(style, /background-image:url\('https:\/\/cdn\/b_1600x\.jpg'\)/);
});

// ── Lazy-loaded hero videos ─────────────────────────────────────────────────────────────────────
// A theme lazy-loads its hero video exactly like an image: the real URL sits in `data-src` with
// `preload="none"`, and theme JS promotes it. deLazy handled <img> but not <video>, so the hero
// rendered as an empty box — the source store showed a video, the VYA copy showed nothing.

test("deLazy promotes a lazy video's data-src to a real, absolute src", () => {
 const $ = cheerio.load(`<video data-src="//store.com/cdn/shop/videos/hero.mp4?v=0" muted autoplay playsinline preload="none" loop class="lazy"></video>`);
 deLazy($, "https://store.com/");
 const v = $("video");
 assert.equal(v.attr("src"), "https://store.com/cdn/shop/videos/hero.mp4?v=0", "protocol-relative URL resolved");
 assert.equal(v.attr("data-src"), undefined, "the lazy attribute is consumed");
 assert.equal(v.attr("preload"), "auto", "preload=none would keep an autoplaying hero blank without JS");
 assert.equal(v.attr("autoplay") !== undefined && v.attr("muted") !== undefined, true, "autoplay/muted survive");
});

test("deLazy absolutises a video poster and lazy <source> children", () => {
 const $ = cheerio.load(`<video data-poster="/cdn/poster.jpg"><source data-src="/cdn/hero.mp4" type="video/mp4"></video>`);
 deLazy($, "https://store.com/pages/home");
 assert.equal($("video").attr("poster"), "https://store.com/cdn/poster.jpg");
 assert.equal($("video source").attr("src"), "https://store.com/cdn/hero.mp4");
});

test("deLazy leaves a video that already has a real src alone", () => {
 const $ = cheerio.load(`<video src="https://cdn.store.com/a.mp4"></video>`);
 deLazy($, "https://store.com/");
 assert.equal($("video").attr("src"), "https://cdn.store.com/a.mp4");
});

// ── Plan B keeps the theme's own buy button ─────────────────────────────────────────────────────

test("Plan B keeps the theme's own add-to-cart but still strips Shopify checkout", () => {
 // Their button posts to the RELATIVE /cart/add.js, which on a VYA-served origin is our route —
 // so the seller's real button drives VYA's cart. Replacing it would discard the fidelity we're here for.
 const html = `<form action="/cart/add" method="post">
   <button name="add" class="product-form__submit">Add to cart</button>
   <div class="shopify-payment-button"><button>Buy with Shop</button></div>
 </form>`;
 const out = rewireCommerce(html, "/checkout?item=abc", { keepThemeButtons: true });
 assert.match(out, /name="add"/, "the theme's own button survives");
 assert.match(out, /Add to cart<\/button>/, "and keeps its own label");
 assert.ok(!/shopify-payment-button">/.test(out), "Shop Pay is still stripped — it takes the order away");
 assert.ok(!/data-vya-add/.test(out), "no VYA button is injected over the top");
});

test("Plan A still replaces the buy button with VYA's own", () => {
 const html = `<form action="/cart/add"><button name="add">Add to cart</button></form>`;
 const out = rewireCommerce(html, "/checkout?item=abc");
 assert.match(out, /data-vya-add="abc"/, "Plan A has no theme JS, so VYA supplies the button");
});

// ── Cloned theme cards must not keep the template product's name ────────────────────────────────
// Theme cards routinely carry the product name TWICE — a visible heading plus a visually-hidden or
// hover-overlay copy. Replacing only the first left every card in a live grid showing the right
// product alongside the template product's name, which read as "every product has the same name".

test("a cloned card drops the template's product name everywhere it appears", () => {
 const grid = `<ul class="product-grid">
  <li class="card-wrapper">
   <a href="/products/template"><img src="/t.jpg" alt="Template Product"></a>
   <h3 class="card__heading"><a href="/products/template">Template Product</a></h3>
   <span class="visually-hidden">Template Product</span>
   <span class="price">$10.00</span>
  </li>
  <li class="card-wrapper">
   <a href="/products/b"><img src="/b.jpg" alt="Template Product"></a>
   <h3 class="card__heading"><a href="/products/b">Second</a></h3>
   <span class="visually-hidden">Template Product</span>
   <span class="price">$20.00</span>
  </li>
  <li class="card-wrapper">
   <a href="/products/c"><img src="/c.jpg" alt="x"></a>
   <h3 class="card__heading"><a href="/products/c">Third</a></h3>
   <span class="price">$30.00</span>
  </li>
 </ul>`;
 const items = [
  { id: "i1", title: "Vintage Burberry Heels", priceCents: 35900, currency: "USD", images: ["https://x/1.jpg"] },
  { id: "i2", title: "Vintage Gucci Hobo", priceCents: 21500, currency: "USD", images: ["https://x/2.jpg"] },
 ];
 const out = injectCollectionItems(grid, items, (it) => `/p/${it.id}`);
 const $ = cheerio.load(out);
 const cards = $("[data-vya-collection]").children();
 assert.equal(cards.length, 2);

 cards.each((i, c) => {
  const text = ($(c).text() || "").replace(/\s+/g, " ");
  assert.ok(!text.includes("Template Product"), `card ${i} still shows the template's name: ${text}`);
  assert.ok(text.includes(items[i].title), `card ${i} is missing its own title: ${text}`);
  assert.equal(($(c).find("img").first().attr("alt") || ""), items[i].title, "alt text follows the real product");
 });

 // …and each card shows its OWN name, not a shared one.
 const titles = cards.map((_, c) => ($(c).find(".card__heading").text() || "").trim()).get();
 assert.deepEqual(titles, ["Vintage Burberry Heels", "Vintage Gucci Hobo"]);
});

test("a second price block elsewhere in the card (a quick-view panel) also gets updated", () => {
 // Seen live on a real Shopify "Vessel"-family theme (vintage-archives-la): each card has a hidden
 // quick-view panel with its OWN <product-price> block, a full duplicate of the card's title+price.
 // The title duplicate already gets swept (replaceLeftoverTitle covers "every remaining text node
 // equal to the template's name"), but price substitution only ever touched the ONE element
 // findPriceEl found — so every card's quick-view panel kept showing the template product's price,
 // $375, regardless of which of the 105 real products the card was actually showing.
 const grid = `<ul class="product-grid">
  <li class="card-wrapper">
   <a href="/products/t"><img src="/t.jpg" alt="Template Product"></a>
   <h3 class="card__heading"><a href="/products/t">Template Product</a></h3>
   <span class="price">$375.00</span>
   <div class="quick-view">
    <p>Template Product</p>
    <product-price><span class="price">$375.00</span></product-price>
   </div>
  </li>
  <li class="card-wrapper">
   <a href="/products/b"><img src="/b.jpg" alt="Template Product"></a>
   <h3 class="card__heading"><a href="/products/b">Second</a></h3>
   <span class="price">$375.00</span>
   <div class="quick-view">
    <p>Template Product</p>
    <product-price><span class="price">$375.00</span></product-price>
   </div>
  </li>
 </ul>`;
 const items = [
  { id: "i1", title: "Vintage Burberry Heels", priceCents: 35900, currency: "USD", images: ["https://x/1.jpg"] },
  { id: "i2", title: "Vintage Gucci Hobo", priceCents: 21500, currency: "USD", images: ["https://x/2.jpg"] },
 ];
 const out = injectCollectionItems(grid, items, (it) => `/p/${it.id}`);
 const $ = cheerio.load(out);
 const cards = $("[data-vya-collection]").children();
 assert.equal(cards.length, 2);

 const quickViewPrices = cards.map((_, c) => ($(c).find(".quick-view .price").text() || "").trim()).get();
 assert.ok(!quickViewPrices.includes("$375.00"), `quick-view price still shows the template's $375, got ${JSON.stringify(quickViewPrices)}`);
 assert.deepEqual(quickViewPrices, ["$359.00", "$215.00"], `each card's quick-view must show ITS OWN price, got ${JSON.stringify(quickViewPrices)}`);
});

test("a title that isn't a heading and isn't link text still gets replaced", () => {
 // Seen live on a real Tailwind/Alpine theme (hachi-archive): the title lives in a bare
 // `aria-hidden="true"` div (visually shown, hidden from screen readers — the accessible name comes
 // from an aria-labelledby elsewhere), and the click-through <a> is empty. cardTitleEl's old
 // selector list (card__heading/card-title/product-title/h2-h4) matched none of that, so it fell
 // through to "longest link text" — which found nothing either, since every link is empty. Result:
 // the template's own name survived, verbatim, on every cloned card, because nothing ever
 // identified it as stale in the first place.
 const grid = `<ul class="product-grid">
  <li class="relative group">
   <a class="tile-link" href="/products/template" aria-labelledby="label-1"></a>
   <img src="/t.jpg" alt="Template Product">
   <div class="tile-content-wrapper">
    <div class="break-words" aria-hidden="true">Template Product</div>
    <div class="vya-price">$10.00</div>
   </div>
  </li>
  <li class="relative group">
   <a class="tile-link" href="/products/b" aria-labelledby="label-2"></a>
   <img src="/b.jpg" alt="Template Product">
   <div class="tile-content-wrapper">
    <div class="break-words" aria-hidden="true">Template Product</div>
    <div class="vya-price">$20.00</div>
   </div>
  </li>
 </ul>`;
 const items = [
  { id: "i1", title: "Vintage Burberry Heels", priceCents: 35900, currency: "USD", images: ["https://x/1.jpg"] },
  { id: "i2", title: "Vintage Gucci Hobo", priceCents: 21500, currency: "USD", images: ["https://x/2.jpg"] },
 ];
 const out = injectCollectionItems(grid, items, (it) => `/p/${it.id}`);
 const $ = cheerio.load(out);
 const cards = $("[data-vya-collection]").children();
 assert.equal(cards.length, 2);
 const titles = cards.map((_, c) => ($(c).find(".break-words").text() || "").trim()).get();
 assert.deepEqual(titles, ["Vintage Burberry Heels", "Vintage Gucci Hobo"], `every card must show its OWN name, got ${JSON.stringify(titles)}`);
});

// ── The cart page ───────────────────────────────────────────────────────────────────────────────
// A cart captured while EMPTY renders no line-item markup, so there is nothing to reuse and any
// hand-built substitute looks foreign (wrong fonts, wrong columns, a bright blue button on a
// burgundy storefront). The importer now captures the cart with an item in it, and this clones the
// theme's own row — the same principle the product grids use.

const CART_HTML = `<html><body>
 <div class="shopify-section-group-header-group"><a href="/">Store</a></div>
 <main>
  <h1 class="title title--primary">Your Objects in Waiting</h1>
  <form action="/cart" class="cart__contents critical-hidden" id="cart">
   <p class="cart__empty-text">Looks like you need affection.</p>
   <div id="main-cart-items" class="cart__items"><div class="js-contents">
    <table class="cart-items"><thead><tr><th>OBJECT</th><th>QUANTITY</th><th>TOTAL</th></tr></thead>
    <tbody><tr class="cart-item">
      <td class="cart-item__media"><img src="/t.jpg" alt="Template Boot"></td>
      <td class="cart-item__details"><a href="/products/template" class="cart-item__name">Template Boot</a>
        <div class="product-option">Shoe size: 41</div></td>
      <td class="cart-item__quantity"><quantity-input><button name="minus">-</button><input value="1"><button name="plus">+</button></quantity-input>
        <cart-remove-button><a href="/cart/change?id=1&quantity=0">remove</a></cart-remove-button></td>
      <td class="cart-item__totals"><span class="price">$999.00</span></td>
    </tr></tbody></table>
   </div></div>
   <div class="totals"><h2 class="totals__total">Estimated total</h2><p class="totals__total-value">$999.00 USD</p></div>
   <button name="checkout" class="cart__checkout-button button">Check out</button>
  </form>
 </main><footer>footer</footer></body></html>`;

test("the cart clones the theme's own row rather than inventing markup", () => {
 const lines = [
  { id: "i1", title: "Vintage Burberry Heels", priceCents: 35900, currency: "USD", image: "https://x/1.jpg", href: "/products/a" },
  { id: "i2", title: "Vintage Gucci Hobo", priceCents: 21500, currency: "USD", image: "https://x/2.jpg", href: "/products/b" },
 ];
 const $ = cheerio.load(injectCartPage(CART_HTML, lines, "/checkout?cart=1"));
 const rows = $("tr.cart-item");
 assert.equal(rows.length, 2, "one cloned row per cart line");
 assert.equal($(rows[0]).find(".cart-item__name").text(), "Vintage Burberry Heels");
 assert.equal($(rows[1]).find(".cart-item__name").text(), "Vintage Gucci Hobo");
 assert.ok(!$.html().includes("Template Boot"), "the template product's name never survives");
 assert.match($(rows[0]).text(), /\$359\.00/, "money keeps the theme's two decimals");
 assert.equal($("thead th").length, 3, "the theme's own column headers survive");
 assert.equal($("h1.title").text(), "Your Objects in Waiting", "and its heading");
});

test("the theme's own checkout button is repointed, never replaced", () => {
 // Replacing it produced a bright blue button on a burgundy storefront.
 const $ = cheerio.load(injectCartPage(CART_HTML, [{ id: "i1", title: "X", priceCents: 100, currency: "USD", image: null, href: "/p" }], "/checkout?cart=1"));
 const btn = $("[name='checkout']");
 assert.equal(btn.length, 1);
 assert.equal(btn.text().trim(), "Check out", "the theme's own label and styling");
 assert.equal(btn.attr("data-vya-checkout"), "/checkout?cart=1", "but it goes to VYA");
 assert.equal($("[class*='cart__empty']").length, 0, "no empty notice above a full cart");
});

test("totals are restated in the theme's own elements", () => {
 const lines = [
  { id: "i1", title: "A", priceCents: 35900, currency: "USD", image: null, href: "/a" },
  { id: "i2", title: "B", priceCents: 21500, currency: "USD", image: null, href: "/b" },
 ];
 const $ = cheerio.load(injectCartPage(CART_HTML, lines, "/checkout"));
 assert.equal($(".totals__total-value").text().trim(), "$574.00 USD");
});

test("a one-of-one line cannot ask for a second copy", () => {
 const $ = cheerio.load(injectCartPage(CART_HTML, [{ id: "i1", title: "X", priceCents: 100, currency: "USD", image: null, href: "/p" }], "/c"));
 assert.equal($("[name='minus'], [name='plus']").length, 0, "steppers removed — stock is one-of-one");
 assert.equal($("quantity-input input").attr("readonly"), "readonly");
});

test("an empty cart keeps the theme's chrome and says it is empty", () => {
 const $ = cheerio.load(injectCartPage(CART_HTML, [], "/checkout"));
 assert.match($("#main-cart-items").text(), /empty/i);
 assert.equal($(".shopify-section-group-header-group").length, 1, "header survives");
 assert.equal($("footer").length, 1, "footer survives");
});

// ── Cart state on a captured product page ───────────────────────────────────────────────────────
// A capture is frozen at "0 in cart" and never shows the already-in-your-bag notice, so a shopper
// could hammer Add to cart on a one-of-one piece they already hold and get no feedback at all.

const PDP = `<html><body>
 <label class="quantity__label form__label">Quantity <span class="quantity__rules-cart hidden" aria-hidden="true"><div class="loading__spinner hidden"></div><span>(<span class="quantity-cart">0</span> in cart)</span></span></label>
 <div class="product-form__error-message-wrapper" hidden><span class="product-form__error-message"></span></div>
 <button name="add" class="product-form__submit button">Add to cart</button>
</body></html>`;

test("an item already in the bag disables Add to cart and says why", () => {
 const $ = cheerio.load(applyCartState(PDP, { inCart: true }));
 assert.equal($("[name='add']").attr("disabled"), "disabled", "a one-of-one piece can't be added twice");
 assert.equal($(".product-form__error-message-wrapper").attr("hidden"), undefined, "the theme's own wrapper is revealed");
 assert.match($(".product-form__error-message").text(), /maximum quantity of this item is already in your cart/i);
 assert.match($(".quantity__rules-cart").text(), /\(1 in cart\)/, "the count comes from a NESTED span");
 assert.equal($(".quantity-cart").text(), "1", "the count is its own element, text split around it");
 assert.equal($(".quantity__rules-cart").attr("aria-hidden"), undefined, "and it is un-hidden from screen readers too");
 assert.ok(!($(".quantity__rules-cart").attr("class") || "").includes("hidden"), "the theme hides this at zero");
});

test("an item NOT in the bag stays addable and reads (0 in cart)", () => {
 const $ = cheerio.load(applyCartState(PDP, { inCart: false }));
 assert.equal($("[name='add']").attr("disabled"), undefined);
 assert.notEqual($(".product-form__error-message-wrapper").attr("hidden"), undefined, "the notice stays hidden");
 assert.equal($(".product-form__error-message").text(), "", "and carries no message");
 assert.match($(".quantity__rules-cart").text(), /\(0 in cart\)/);
});

test("a sold piece says so rather than claiming a cart conflict", () => {
 const $ = cheerio.load(applyCartState(PDP, { inCart: false, soldOut: true }));
 assert.match($(".product-form__error-message").text(), /has sold/i);
 assert.equal($("[name='add']").attr("disabled"), "disabled");
});

test("a theme with no error wrapper still gets a notice", () => {
 const bare = `<html><body><button name="add">Add to cart</button></body></html>`;
 const $ = cheerio.load(applyCartState(bare, { inCart: true }));
 assert.equal($("[data-vya-cart-note]").length, 1, "not every theme ships a wrapper to reuse");
 assert.equal($("[name='add']").attr("disabled"), "disabled");
});

test("a sold piece stays on the shelf, badged, rather than vanishing", () => {
 // Hiding sold pieces made a 52-product vintage store render as a 15-product one. The source keeps
 // them visible with a badge, and the archive is part of how people browse.
 const grid = `<ul class="product-grid">
  <li class="card-wrapper"><a href="/products/t"><img src="/t.jpg" alt="T"></a>
   <h3 class="card__heading"><a href="/products/t">Template</a></h3>
   <span class="badge hidden">Sold out</span><span class="price">$10.00</span></li>
  <li class="card-wrapper"><a href="/products/u"><img src="/u.jpg" alt="U"></a>
   <h3 class="card__heading"><a href="/products/u">Two</a></h3>
   <span class="badge hidden">Sold out</span><span class="price">$20.00</span></li>
 </ul>`;
 const items = [
  { id: "a", title: "Still Available", priceCents: 10000, currency: "USD", images: ["https://x/1.jpg"], available: true },
  { id: "b", title: "Already Sold", priceCents: 20000, currency: "USD", images: ["https://x/2.jpg"], available: false },
 ];
 const $ = cheerio.load(injectCollectionItems(grid, items, (it) => `/p/${it.id}`));
 const cards = $("[data-vya-collection]").children();
 assert.equal(cards.length, 2, "both render — the sold one is not dropped");
 assert.equal($(cards[0]).find(".badge").length, 0, "an available piece drops the template's badge entirely");
 const soldBadge = $(cards[1]).find(".badge");
 assert.equal(soldBadge.text(), "Sold out");
 assert.ok(!(soldBadge.attr("class") || "").includes("hidden"), "the theme's own badge is revealed for a sold piece");
 assert.match($(cards[0]).text(), /Still Available/);
 assert.match($(cards[1]).text(), /Already Sold/);
});

// ── Pagination follows the STORE's own pattern ──────────────────────────────────────────────────
// Not a number we picked: the theme tells us its page size by how many cards it rendered, so a site
// showing 12 gets 12 and a site showing 24 gets 24, with no per-store configuration.

const PAGED = (cards: number) => `<html><body><main>
 <h2>52 products</h2>
 <ul id="product-grid" class="product-grid">
  ${Array.from({ length: cards }, (_, i) => `<li class="card-wrapper">
    <a href="/products/p${i}"><img src="/p${i}.jpg" alt="P${i}"></a>
    <h3 class="card__heading"><a href="/products/p${i}">Product ${i}</a></h3>
    <span class="price">$10.00</span></li>`).join("")}
 </ul>
 <nav class="pagination"><ul class="pagination__list">
  <li><span class="pagination__item">1</span></li>
  <li><a class="pagination__item" href="/collections/all?page=2">2</a></li>
  <li><span>…</span></li>
  <li><a class="pagination__item" href="/collections/all?page=5">5</a></li>
 </ul></nav>
</main></body></html>`;

const many = (n: number) => Array.from({ length: n }, (_, i) => ({
 id: `i${i}`, title: `Item ${i}`, priceCents: 1000 + i, currency: "USD", images: [`https://x/${i}.jpg`],
}));

test("page size is read from the theme, not hardcoded", () => {
 // The theme put 12 cards on the page, so 12 is the page size.
 const $ = cheerio.load(injectCollectionItems(PAGED(12), many(51), (it) => `/p/${it.id}`, { page: 1, path: "/collections/all" }));
 assert.equal($("[data-vya-collection]").children().length, 12);
 // A theme that shows 24 gets 24 from the very same code.
 const $wide = cheerio.load(injectCollectionItems(PAGED(24), many(51), (it) => `/p/${it.id}`, { page: 1, path: "/collections/all" }));
 assert.equal($wide("[data-vya-collection]").children().length, 24);
});

test("later pages show different items, and the last page holds the remainder", () => {
 const p1 = cheerio.load(injectCollectionItems(PAGED(12), many(51), (it) => `/p/${it.id}`, { page: 1, path: "/collections/all" }));
 const p2 = cheerio.load(injectCollectionItems(PAGED(12), many(51), (it) => `/p/${it.id}`, { page: 2, path: "/collections/all" }));
 const p5 = cheerio.load(injectCollectionItems(PAGED(12), many(51), (it) => `/p/${it.id}`, { page: 5, path: "/collections/all" }));
 const first = ($: cheerio.CheerioAPI) => $("[data-vya-collection]").children().first().text();
 assert.notEqual(first(p1), first(p2), "page 2 is not page 1 again");
 assert.equal(p5("[data-vya-collection]").children().length, 3, "51 items over 12 per page leaves 3");
});

test("the theme's own pagination links are repointed at real pages", () => {
 const $ = cheerio.load(injectCollectionItems(PAGED(12), many(51), (it) => `/p/${it.id}`, { page: 2, path: "/collections/all" }));
 const hrefs = $("[class*='pagination'] a[href]").map((_, e) => $(e).attr("href")).get();
 assert.ok(hrefs.includes("/collections/all"), "page 1 has no ?page= suffix");
 assert.ok(hrefs.includes("/collections/all?page=3"));
 assert.ok(hrefs.every((h) => h !== "#"), "no dead links");
 // The current page is marked, not linked.
 const current = $("[class*='pagination'] li").filter((_, e) => $(e).find("a[href]").length === 0 && /^\d+$/.test($(e).text().trim()));
 assert.equal(current.text().trim(), "2");
});

test("pagination disappears when everything fits on one page", () => {
 const $ = cheerio.load(injectCollectionItems(PAGED(12), many(4), (it) => `/p/${it.id}`, { page: 1, path: "/collections/all" }));
 assert.equal($("[class*='pagination']").length, 0, "a lone page 1 is noise");
});

test("the theme's catalogue count is restated with ours", () => {
 const $ = cheerio.load(injectCollectionItems(PAGED(12), many(51), (it) => `/p/${it.id}`, { page: 1, path: "/collections/all" }));
 assert.match($("h2").text(), /51 products/, "the frozen '52 products' is ours to correct");
});

test("a collection the store shows on one scroll is not chopped into pages", () => {
 // Pagination is copied from the source's behaviour, not imposed. Without this rule a grid that
 // happened to render three cards would start splitting the collection into pages of three.
 const noPager = `<html><body><main><ul class="product-grid">
  <li class="card-wrapper"><a href="/products/a"><img src="/a.jpg" alt="A"></a>
   <h3 class="card__heading"><a href="/products/a">A</a></h3><span class="price">$10.00</span></li>
  <li class="card-wrapper"><a href="/products/b"><img src="/b.jpg" alt="B"></a>
   <h3 class="card__heading"><a href="/products/b">B</a></h3><span class="price">$20.00</span></li>
 </ul></main></body></html>`;
 const $ = cheerio.load(injectCollectionItems(noPager, many(9), (it) => `/p/${it.id}`, { page: 1, path: "/c" }));
 assert.equal($("[data-vya-collection]").children().length, 9, "all nine render — the source has no pager");
});

test("the sold badge keeps the theme's styled pill, not just its wrapper", () => {
 // Themes nest a styled pill inside a positioning wrapper. Both match [class*='badge'], and writing
 // text into the OUTER one destroys the inner span — where the rounded corners, padding and colour
 // scheme live — leaving bare text floating on the photo.
 const grid = `<ul class="product-grid">
  <li class="card-wrapper"><a href="/products/t"><img src="/t.jpg" alt="T"></a>
   <div class="card__badge bottom left"><span class="badge badge--bottom-left color-scheme-3">Sold out</span></div>
   <h3 class="card__heading"><a href="/products/t">Template</a></h3><span class="price">$10.00</span></li>
  <li class="card-wrapper"><a href="/products/u"><img src="/u.jpg" alt="U"></a>
   <div class="card__badge bottom left"><span class="badge badge--bottom-left color-scheme-3">Sold out</span></div>
   <h3 class="card__heading"><a href="/products/u">Two</a></h3><span class="price">$20.00</span></li>
 </ul>`;
 const $ = cheerio.load(injectCollectionItems(grid, [
  { id: "b", title: "Gone", priceCents: 20000, currency: "USD", images: ["https://x/2.jpg"], available: false },
 ], (it) => `/p/${it.id}`));
 const card = $("[data-vya-collection]").children().first();
 const pill = card.find("span.badge");
 assert.equal(pill.length, 1, "the inner pill survives");
 assert.equal(pill.text(), "Sold out");
 assert.match(pill.attr("class") || "", /color-scheme-3/, "and keeps the classes that style it");
 assert.match(card.find(".card__badge").attr("class") || "", /bottom left/, "wrapper keeps its positioning");
});

// ── A listing created in the portal ─────────────────────────────────────────────────────────────
// Imported products have a page on the source store to capture. A listing the seller adds in the
// portal has none, so the route was fetching {source}/products/{vya-uuid}, getting a 404, and
// telling the shopper "Couldn't load that product" — the seller's newest piece was unreachable.

const PDP_TEMPLATE = `<html><head><title>Old Boots</title>
 <meta property="og:description" content="Old boots description">
 <meta property="og:image" content="https://cdn/old.jpg">
 <script type="application/ld+json">{"@type":"Product","name":"Old Boots","description":"old","image":["https://cdn/old.jpg"],"offers":{"@type":"Offer","price":"575.00","priceCurrency":"USD"}}</script>
 </head><body>
 <div class="shopify-section-group-header-group">chrome</div>
 <h1 class="product__title">Old Boots</h1>
 <div class="price"><span class="price-item">$575.00 USD</span></div>
 <ul class="product__media-list">
   <li class="product__media-item"><img src="/o1.jpg" alt="Old Boots"></li>
   <li class="product__media-item"><img src="/o2.jpg" alt="Old Boots"></li>
   <li class="product__media-item"><img src="/o3.jpg" alt="Old Boots"></li>
 </ul>
 <ul class="thumbnail-list"><li><img src="/o1.jpg"></li><li><img src="/o2.jpg"></li><li><img src="/o3.jpg"></li></ul>
 <div class="product__description rte">Old boots description</div>
 <script>var item = { Name: "Old Boots" };</script>
 <form><input name="id" value="48254150246645"><button name="add">Add to cart</button></form>
 <footer>footer</footer></body></html>`;

const NATIVE = {
 id: "14702ddf-16d6-4922-8207-2a031f1ddfe2",
 title: "Louis Vuitton Noé Bucket Bag",
 priceCents: 346500, currency: "USD",
 images: ["https://cdn/lv.jpg"],
 description: "A limited edition Noé.",
 available: true,
};

test("a portal listing renders into the theme's own product page", () => {
 const $ = cheerio.load(renderNativeProduct(PDP_TEMPLATE, NATIVE));
 assert.equal($("h1").text(), NATIVE.title);
 assert.match($(".price-item").text(), /\$3,465\.00/, "its own price, in the theme's format");
 assert.equal($(".shopify-section-group-header-group").length, 1, "theme chrome survives");
 assert.equal($("footer").length, 1);
 assert.match($(".product__description").text(), /limited edition/);
});

test("the buy form posts the VYA item id, so the theme's button just works", () => {
 const $ = cheerio.load(renderNativeProduct(PDP_TEMPLATE, NATIVE));
 assert.equal($("input[name='id']").attr("value"), NATIVE.id);
 assert.equal($("[name='add']").attr("disabled"), undefined);
});

test("the gallery shows only the images this listing actually has", () => {
 // Left alone, the template's three photos stayed under a one-photo listing.
 const $ = cheerio.load(renderNativeProduct(PDP_TEMPLATE, NATIVE));
 assert.equal($(".product__media-item").length, 1);
 assert.equal($(".product__media-item img").attr("src"), "https://cdn/lv.jpg");
 assert.equal($(".thumbnail-list").length, 0, "one image needs no thumbnail rail");
});

test("nothing of the template product survives — page, meta or payload", () => {
 const html = renderNativeProduct(PDP_TEMPLATE, NATIVE);
 assert.ok(!html.includes("Old Boots"), "including inline analytics payloads");
 const $ = cheerio.load(html);
 assert.match($('meta[property="og:description"]').attr("content") || "", /limited edition/);
 assert.equal($('meta[property="og:image"]').attr("content"), "https://cdn/lv.jpg");
 const ld = JSON.parse($('script[type="application/ld+json"]').html() || "{}");
 assert.equal(ld.name, NATIVE.title);
 assert.equal(ld.offers.price, "3465.00", "structured data must not advertise the wrong price");
});


// ── Layouts that style each slot individually ─────────────────────────────────────────────────
// Squarespace's Fluid Engine gives every block its own id, its own wrapper class and its own
// <style> — grid-area (where the block sits) and --product-block-display-* (which of the product's
// fields it shows). Refilling such a section by emptying it and cloning one card three times threw
// all of that away: the three clones carried the SAME wrapper class, so all three landed in the
// same grid cell, and with their ids stripped the rules hiding title/price/description no longer
// matched — the seller's homepage rendered three full product pages stacked on top of each other.
const FLUID_ENGINE = `<html><body><section><div class="fluid-engine fe-1">
 <div class="fe-block fe-block-a"><style>.fe-block-a{grid-area:1/2/7/6}#block-a{--product-block-display-title:none}</style>
  <div class="sqs-block product-block" id="block-a"><a href="/shop/p/one"><img src="/a.jpg" alt="Old A"></a>
   <div class="product-title">Old A</div><div class="product-price">$10.00</div>
   <div class="product-excerpt">Frozen copy about the old piece.</div></div></div>
 <div class="fe-block fe-block-b"><style>.fe-block-b{grid-area:7/4/13/8}#block-b{--product-block-display-title:none}</style>
  <div class="sqs-block product-block" id="block-b"><a href="/shop/p/two"><img src="/b.jpg" alt="Old B"></a>
   <div class="product-title">Old B</div><div class="product-price">$20.00</div>
   <div class="product-excerpt">Frozen copy about the old piece.</div></div></div>
 <div class="fe-block fe-block-c"><style>.fe-block-c{grid-area:1/18/13/26}#block-c{--product-block-display-title:none}</style>
  <div class="sqs-block product-block" id="block-c"><a href="/shop/p/three"><img src="/c.jpg" alt="Old C"></a>
   <div class="product-title">Old C</div><div class="product-price">$30.00</div>
   <div class="product-excerpt">Frozen copy about the old piece.</div></div></div>
 <div class="fe-block fe-block-btn"><style>.fe-block-btn{grid-area:13/4/15/8}</style>
  <div class="sqs-block button-block" id="block-btn"><a class="sqs-block-button-element" href="/shop">SHOP NOW</a></div></div>
</div></section></body></html>`;

const THREE = [
 { id: "i1", title: "Live Piece One", priceCents: 55000, currency: "USD", images: ["https://x/1.jpg"] },
 { id: "i2", title: "Live Piece Two", priceCents: 43700, currency: "USD", images: ["https://x/2.jpg"] },
 { id: "i3", title: "Live Piece Three", priceCents: 22000, currency: "USD", images: ["https://x/3.jpg"] },
];

test("a live grid keeps each slot's own identity and styles", () => {
 const out = injectLiveGrids(FLUID_ENGINE, [THREE], (it) => `/p/${it.id}`);
 const $ = cheerio.load(out);
 for (const slot of ["a", "b", "c"]) {
  assert.equal($(`.fe-block-${slot}`).length, 1, `slot ${slot} is still its own block, not a clone of another`);
  assert.equal($(`#block-${slot}`).length, 1, `slot ${slot} keeps the id its CSS is written against`);
  assert.match(out, new RegExp(`\\.fe-block-${slot}\\{grid-area`), `slot ${slot} keeps the rule that positions it`);
  assert.match(out, new RegExp(`#block-${slot}\\{--product-block-display-title`), `slot ${slot} keeps the rule that styles it`);
 }
 assert.equal($(".fe-block").length, 4, "and the section's non-product blocks are left where they were");
 assert.match($(".button-block").text(), /SHOP NOW/, "the seller's own button survives the refill");
 // Still live inventory, in the slots the theme laid out.
 assert.match($("#block-a").text(), /Live Piece One/);
 assert.match($("#block-c").text(), /Live Piece Three/);
 assert.ok(!out.includes("Old A") && !out.includes("Old B"), "stale product names gone");
 assert.match($("#block-b").text(), /\$437\.00/, "live price, in the theme's own format");
});

test("a live grid with more pieces than slots clones for the extras only", () => {
 // A collection page shows the whole collection, so it can outgrow the slots the capture had.
 // (A homepage strip is capped at the slot count instead — see the "as many pieces as the theme
 // showed there" test.)
 const many = [...THREE, { id: "i4", title: "Live Piece Four", priceCents: 10000, currency: "USD", images: ["https://x/4.jpg"] }];
 const $ = cheerio.load(injectCollectionItems(FLUID_ENGINE, many, (it) => `/p/${it.id}`));
 // Three captured slots hold the first three; the fourth arrives as a clone, and a clone must
 // never duplicate an id the page already uses.
 assert.equal($("#block-a").length, 1);
 assert.equal($("#block-b").length, 1);
 assert.equal($("#block-c").length, 1);
 assert.match($(".fluid-engine").text(), /Live Piece Four/);
 const ids = $(".fluid-engine [id]").map((_, el) => $(el).attr("id")).get();
 assert.equal(new Set(ids).size, ids.length, "no duplicate ids");
});

test("a filter that matches nothing empties the grid without taking the section with it", () => {
 const $ = cheerio.load(injectCollectionItems(FLUID_ENGINE, [], (it) => `/p/${it.id}`, { renderEmpty: true }));
 assert.equal($(".product-block").length, 0, "no captured piece is left for the shopper to click");
 assert.match($(".button-block").text(), /SHOP NOW/, "the section's own blocks stay put");
 assert.equal($("style").length, 4, "and so does the CSS that lays them out");
});

test("a live grid with fewer pieces than slots drops the slots it doesn't fill", () => {
 const $ = cheerio.load(injectLiveGrids(FLUID_ENGINE, [THREE.slice(0, 2)], (it) => `/p/${it.id}`));
 assert.equal($(".product-block").length, 2, "two pieces, two product blocks");
 assert.equal($("#block-c").length, 0, "the unfilled slot goes rather than showing a sold-through capture");
 assert.match($(".button-block").text(), /SHOP NOW/, "non-product blocks are still untouched");
});
test("a homepage strip shows as many pieces as the theme showed there", () => {
 // A "featured" rail is designed for a handful. Handing it the whole catalogue turned a 3-product
 // strip into 251 cards, blew the page past a megabyte, and left a carousel with 251 slides unable
 // to render — the page looked empty below the hero.
 const page = `<html><body><main>
  <ul class="product-grid featured"><li class="card-wrapper"><a href="/products/a"><img src="/a.jpg" alt="A"></a>
    <h3 class="card__heading"><a href="/products/a">A</a></h3><span class="price">$1.00</span></li>
   <li class="card-wrapper"><a href="/products/b"><img src="/b.jpg" alt="B"></a>
    <h3 class="card__heading"><a href="/products/b">B</a></h3><span class="price">$2.00</span></li>
   <li class="card-wrapper"><a href="/products/c"><img src="/c.jpg" alt="C"></a>
    <h3 class="card__heading"><a href="/products/c">C</a></h3><span class="price">$3.00</span></li>
  </ul></main></body></html>`;
 const items = Array.from({ length: 251 }, (_, i) => ({
  id: `i${i}`, title: `Item ${i}`, priceCents: 1000, currency: "USD", images: ["https://x/a.jpg"],
 }));
 const $ = cheerio.load(injectLiveGrids(page, [items], (it) => `/p/${it.id}`));
 assert.equal($("[data-vya-collection]").children().length, 3, "three slots, three pieces");
 assert.match($("[data-vya-collection]").text(), /Item 0/, "and they are the live ones");
});

test("a localization form that wraps a whole region loses only its picker", () => {
 // One theme puts its ENTIRE footer inside <form class="shopify-localization-form">, so removing the
 // currency widget deleted 3,400 characters of footer — links, policies, newsletter and all. Same
 // family of bug as the [class*="localization"] selector that once ate whole headers.
 const $ = cheerio.load(`<footer><form class="shopify-localization-form" action="/localization">
   <select name="country_code"><option>US</option></select>
   <div class="footer-blocks">
    <a href="/pages/about">About</a><a href="/policies/refund-policy">Returns</a>
    <a href="/policies/privacy-policy">Privacy</a><a href="/pages/contact">Contact</a>
    <p>Join the crush list — stay in the know about new arrivals.</p>
   </div>
  </form></footer>`);
 deShopify($);
 assert.equal($("select[name='country_code']").length, 0, "the picker goes");
 assert.equal($(".footer-blocks").length, 1, "the footer it was wrapping stays");
 assert.equal($("a[href]").length, 4, "every footer link survives");
 assert.match($("footer").text(), /crush list/);
});

test("a bare localization widget is still removed outright", () => {
 const $ = cheerio.load(`<footer><form class="shopify-localization-form" action="/localization">
   <select name="country_code"><option>US</option></select><span>USD</span>
  </form><p>© 2026</p></footer>`);
 deShopify($);
 assert.equal($("form.shopify-localization-form").length, 0, "nothing else was inside it");
 assert.match($("footer").text(), /© 2026/);
});

test("guarding a container must not gut it either", () => {
 // The first attempt at the guard preserved the localization <form> and then removed
 // [class*="disclosure-list"] inside it — which is how this theme builds its footer link lists. It
 // deleted 180 footer links while carefully keeping the wrapper. Only form CONTROLS may go.
 const $ = cheerio.load(`<footer><form class="shopify-localization-form" action="/localization">
   <select name="country_code"><option>US</option></select>
   <ul class="disclosure-list"><li><a href="/a">A</a></li><li><a href="/b">B</a></li>
     <li><a href="/c">C</a></li><li><a href="/d">D</a></li><li><a href="/e">E</a></li></ul>
   <p>Join the crush list — stay in the know.</p>
  </form></footer>`);
 deShopify($);
 assert.equal($("select[name='country_code']").length, 0, "the control goes");
 assert.equal($(".disclosure-list").length, 1, "the footer's link list is NOT a picker");
 assert.equal($("footer a[href]").length, 5, "every link survives");
});

test("a 'shop by collection' row is not mistaken for a product grid", () => {
 // Structurally identical to a product grid — tiles with an image, a link and a caption — but the
 // links point at /collections/. Without the distinction, a homepage collection row was replaced
 // with individual items and the shopper saw products where the seller had put category tiles.
 const page = `<html><body><main>
  <ul class="collection-list">
   <li><a href="/collections/crush-edit"><img src="/1.jpg" alt="Crush Edit"></a><h3>Crush Edit</h3></li>
   <li><a href="/collections/last-crush"><img src="/2.jpg" alt="Last Crush"></a><h3>Last Crush</h3></li>
   <li><a href="/collections/crush-collective"><img src="/3.jpg" alt="Collective"></a><h3>Collective</h3></li>
  </ul>
  <ul class="product-grid">
   <li class="card-wrapper"><a href="/products/a"><img src="/a.jpg" alt="A"></a>
    <h3 class="card__heading"><a href="/products/a">A</a></h3><span class="price">$1.00</span></li>
   <li class="card-wrapper"><a href="/products/b"><img src="/b.jpg" alt="B"></a>
    <h3 class="card__heading"><a href="/products/b">B</a></h3><span class="price">$2.00</span></li>
   <li class="card-wrapper"><a href="/products/c"><img src="/c.jpg" alt="C"></a>
    <h3 class="card__heading"><a href="/products/c">C</a></h3><span class="price">$3.00</span></li>
  </ul></main></body></html>`;
 const items = [
  { id: "i1", title: "Live Piece One", priceCents: 1000, currency: "USD", images: ["https://x/1.jpg"] },
  { id: "i2", title: "Live Piece Two", priceCents: 2000, currency: "USD", images: ["https://x/2.jpg"] },
 ];
 const $ = cheerio.load(injectLiveGrids(page, [items, items], (it) => `/p/${it.id}`));
 // The collection row is untouched…
 assert.equal($(".collection-list").attr("data-vya-collection"), undefined, "collection tiles are not a product grid");
 assert.match($(".collection-list").text(), /Crush Edit/);
 assert.equal($(".collection-list a[href='/collections/crush-edit']").length, 1);
 // …and the real product grid still goes live.
 assert.equal($(".product-grid").attr("data-vya-collection"), "1");
 assert.match($(".product-grid").text(), /Live Piece One/);
});

test("a sold badge must not displace the card's image", () => {
 // Prepending the badge inside the image link made themes that manage their own responsive images
 // (Editions marks them data-rimg) drop the photo — every sold card rendered as an empty tile.
 const grid = `<ul class="product-grid">
  <li class="card-wrapper"><div class="product-item__image">
    <a class="product-item__image-link" href="/products/t"><img src="/t.jpg" data-rimg alt="T"></a></div>
   <h3 class="product-item__title">T</h3><span class="price">$10.00</span></li>
  <li class="card-wrapper"><div class="product-item__image">
    <a class="product-item__image-link" href="/products/u"><img src="/u.jpg" data-rimg alt="U"></a></div>
   <h3 class="product-item__title">U</h3><span class="price">$20.00</span></li>
 </ul>`;
 const $ = cheerio.load(injectCollectionItems(grid, [
  { id: "b", title: "Gone", priceCents: 20000, currency: "USD", images: ["https://x/2.jpg"], available: false },
 ], (it) => `/p/${it.id}`));
 const card = $("[data-vya-collection]").children().first();
 assert.equal(card.find("img").length, 1, "the photo survives");
 assert.equal(card.find("img").attr("src"), "https://x/2.jpg");
 assert.match(card.text(), /Sold out/, "and it is still badged");
 // The badge must come AFTER the image in document order.
 const kids = card.find(".product-item__image-link").children().toArray().map((e) => (e as { tagName: string }).tagName);
 assert.ok(kids.indexOf("img") < kids.indexOf("span"), `image must precede the badge, got ${kids.join(",")}`);
});

test("a sold badge must not re-position the theme's image link", () => {
 // Editions sizes a square card with `.product-item__image--square{height:0;padding-bottom:100%}`
 // and fills it with `.product-item__image-link{position:absolute;…;height:100%}`. Stamping an
 // inline `position:relative` on that link (to anchor our badge) beat the theme's rule, the link
 // fell back into normal flow at 0px tall, and the absolutely-positioned <img> inside it inherited
 // that 0px — every sold tile rendered blank while the image itself loaded fine. Seen live in
 // DevTools: link height 0, img naturalWidth 3024, opacity 1.
 const grid = `<ul class="product-grid">
  <li class="card-wrapper"><div class="product-item__image product-item__image--square">
    <a class="product-item__image-link" href="/products/t"><img src="/t.jpg" alt="T"></a></div>
   <h3 class="product-item__title">T</h3><span class="price">$10.00</span></li>
  <li class="card-wrapper"><div class="product-item__image product-item__image--square">
    <a class="product-item__image-link" href="/products/u"><img src="/u.jpg" alt="U"></a></div>
   <h3 class="product-item__title">U</h3><span class="price">$20.00</span></li>
 </ul>`;
 const out = injectCollectionItems(grid, [
  { id: "b", title: "Gone", priceCents: 20000, currency: "USD", images: ["https://x/2.jpg"], available: false },
 ], (it) => `/p/${it.id}`);
 const $ = cheerio.load(out);
 const link = $("[data-vya-collection] .product-item__image-link").first();
 assert.ok(!/position/.test(link.attr("style") || ""), `no inline position on the theme's link, got style="${link.attr("style")}"`);
 assert.match(link.text(), /Sold out/, "badge still inside the media element");
 // The badge anchors via a LOW-specificity rule the theme's own positioning can override.
 assert.equal(link.attr("data-vya-sold-host"), "1");
 assert.match(out, /\[data-vya-sold-host\]\s*\{\s*position:\s*relative/, "one page-level rule positions the host when the theme doesn't");
 assert.equal($("style[data-vya-sold]").length, 1, "the rule is emitted once, not per card");
});

test("collection-scoped product urls resolve to the same product page", () => {
 // Shopify serves every product at BOTH /products/x and /collections/y/products/x. Themes use the
 // scoped form for navigation and for their quick-shop fetch, so leaving it unrouted meant clicking
 // "Quick Shop" fetched a 404 and the panel never appeared.
 const html = `<html><body>
  <a href="https://store.com/collections/all/products/silk-dress">A</a>
  <a href="https://store.com/products/silk-dress">B</a>
  <a href="https://store.com/collections/new-in/products/wool-coat?variant=9">C</a>
 </body></html>`;
 const $ = cheerio.load(html);
 // mirrors the capture-time rewriter
 const rewrite = (full: string, base: string) => {
  const u = new URL(full); const p = u.pathname; const q = u.search;
  const scoped = p.match(/^\/collections\/[^/]+(\/products\/[^/]+)\/?$/i);
  if (scoped) return base + scoped[1] + q;
  if (/^\/products\//.test(p)) return base + p + q;
  return base + p + q;
 };
 const hrefs = $("a").map((_, e) => rewrite($(e).attr("href")!, "")).get();
 assert.deepEqual(hrefs, ["/products/silk-dress", "/products/silk-dress", "/products/wool-coat?variant=9"]);
});

test("each cloned card's quick-shop points at its own product", () => {
 // The hooks carry the TEMPLATE product's id, so every card's quick-shop opened the same wrong item.
 const grid = `<ul class="product-grid">
  <li class="card-wrapper"><a href="/products/t"><img src="/t.jpg" alt="T"></a>
   <h3 class="card__heading"><a href="/products/t">T</a></h3><span class="price">$10.00</span>
   <button class="product-item__quick-shop-button" data-quickshop-trigger></button>
   <div class="product-item__quickshop" data-product-quickshop="999" data-product-quickshop-url="/collections/all/products/"></div></li>
  <li class="card-wrapper"><a href="/products/u"><img src="/u.jpg" alt="U"></a>
   <h3 class="card__heading"><a href="/products/u">U</a></h3><span class="price">$20.00</span>
   <button class="product-item__quick-shop-button" data-quickshop-trigger></button>
   <div class="product-item__quickshop" data-product-quickshop="999" data-product-quickshop-url="/collections/all/products/"></div></li>
 </ul>`;
 const items = [
  { id: "i1", title: "One", priceCents: 1000, currency: "USD", images: ["https://x/1.jpg"], sourceId: "one-handle" },
  { id: "i2", title: "Two", priceCents: 2000, currency: "USD", images: ["https://x/2.jpg"], sourceId: "two-handle" },
 ];
 const $ = cheerio.load(injectCollectionItems(grid, items, (it) => `/products/${it.sourceId}`));
 const ids = $("[data-product-quickshop]").map((_, e) => $(e).attr("data-product-quickshop")).get();
 assert.deepEqual(ids, ["one-handle", "two-handle"], "each card gets its own product");
 assert.equal($("[data-quickshop-trigger]").length, 2, "the trigger survives cloning");
});

test("a live card hands the theme's image library nothing to reprocess", () => {
 // We set a final src; leaving the theme's hooks lets it recompute one from a srcset we removed,
 // and its CSS hides an image it considers unloaded ([data-rimg=lazy]{opacity:0}).
 const grid = `<ul class="product-grid">
  <li class="card-wrapper"><a class="link" href="/products/t" aria-label="Template Piece">
    <img src="/t.jpg" data-rimg="lazy" data-rimg-scale="2" srcset="/t@2x.jpg 2x" sizes="50vw" class="product-item__image-primary" alt="T"></a>
   <canvas data-rimg-canvas></canvas>
   <h3 class="card__heading"><a href="/products/t">T</a></h3><span class="price">$10.00</span></li>
  <li class="card-wrapper"><a class="link" href="/products/u" aria-label="Template Piece">
    <img src="/u.jpg" data-rimg="lazy" class="product-item__image-primary" alt="U"></a>
   <h3 class="card__heading"><a href="/products/u">U</a></h3><span class="price">$20.00</span></li>
 </ul>`;
 const $ = cheerio.load(injectCollectionItems(grid, [
  { id: "i1", title: "Celine Triomphe", priceCents: 52000, currency: "USD", images: ["https://x/1.jpg"], available: false },
 ], (it) => `/p/${it.id}`));
 const img = $("[data-vya-collection] img").first();
 assert.equal(img.attr("src"), "https://x/1.jpg");
 assert.equal(img.attr("data-rimg"), undefined, "no lazy hook to hide it");
 assert.equal(img.attr("srcset"), undefined);
 assert.equal(img.attr("data-rimg-scale"), undefined);
 assert.match(img.attr("class") || "", /product-item__image-primary/, "the styled class stays");
 assert.equal($("[data-rimg-canvas]").length, 0, "placeholder canvas removed");
 assert.equal($("[data-vya-collection] a[aria-label]").first().attr("aria-label"), "Celine Triomphe", "and it announces the right piece");
});

test("a listing with 2 real photos fills the theme's own hover-swap slot", () => {
 // The real site's grid swaps to a second angle on hover via a native class/CSS pair
 // (`.product-item__image-alternate`, revealed by the theme's own stylesheet on :hover). Earlier
 // this got collapsed to one image unconditionally on the theory that a second photo had "no live
 // equivalent" — wrong when the listing actually has one; the theme's own slot IS the live
 // equivalent, just needs this item's own second photo instead of the template's.
 const grid = `<ul class="product-grid">
  <li class="card-wrapper">
   <div class="product-item__image">
    <a class="link" href="/products/t" aria-label="Template Piece">
     <img src="/t-alt.jpg" data-rimg="lazy" class="product-item__image-alternate" alt="T alt">
    </a>
    <img src="/t.jpg" class="product-item__image-primary" alt="T">
   </div>
   <h3 class="card__heading"><a href="/products/t">T</a></h3><span class="price">$10.00</span></li>
 </ul>`;
 const $ = cheerio.load(injectCollectionItems(grid, [
  { id: "i1", title: "Celine Triomphe", priceCents: 52000, currency: "USD", images: ["https://x/1.jpg", "https://x/2.jpg"] },
 ], (it) => `/p/${it.id}`));
 const card = $("[data-vya-collection]");
 assert.equal(card.find("img").length, 2, "both the primary and the theme's hover slot survive");
 assert.equal(card.find(".product-item__image-primary").attr("src"), "https://x/1.jpg");
 assert.equal(card.find(".product-item__image-alternate").attr("src"), "https://x/2.jpg", "the item's OWN second photo, not the template's");
 assert.equal(card.find(".product-item__image-alternate").attr("data-rimg"), undefined, "lazy hooks cleared same as the primary");
});

test("the FIRST card in the grid isn't blindly used as template when a later one has the hover slot", () => {
 // The card chosen to clone determines whether ANY card on the page can ever show a hover-swap
 // image — the first card in the grid just happens to belong to whichever product was captured
 // there. If that one product only has a single photo, picking it blindly would mean no card could
 // ever show a second image on hover, even for items that have one.
 const grid = `<ul class="product-grid">
  <li class="card-wrapper"><a class="link" href="/products/x"><img src="/x.jpg" class="product-item__image-primary" alt="X"></a>
   <h3 class="card__heading"><a href="/products/x">X</a></h3><span class="price">$5.00</span></li>
  <li class="card-wrapper">
   <div class="product-item__image">
    <a class="link" href="/products/y"><img src="/y-alt.jpg" class="product-item__image-alternate" alt="Y alt"></a>
    <img src="/y.jpg" class="product-item__image-primary" alt="Y">
   </div>
   <h3 class="card__heading"><a href="/products/y">Y</a></h3><span class="price">$8.00</span></li>
 </ul>`;
 const $ = cheerio.load(injectCollectionItems(grid, [
  { id: "i1", title: "Celine Triomphe", priceCents: 52000, currency: "USD", images: ["https://x/1.jpg", "https://x/2.jpg"] },
 ], (it) => `/p/${it.id}`));
 const card = $("[data-vya-collection]");
 assert.equal(card.find(".product-item__image-alternate").attr("src"), "https://x/2.jpg", "the 2-image card was used as the template");
});

test("a listing with only 1 photo still collapses to a single image", () => {
 // No live equivalent for the hover slot when there's nothing to put in it — same as before this
 // feature existed. Hovering must not reveal a blank or a stale template photo.
 const grid = `<ul class="product-grid">
  <li class="card-wrapper">
   <div class="product-item__image">
    <a class="link" href="/products/t" aria-label="Template Piece">
     <img src="/t-alt.jpg" class="product-item__image-alternate" alt="T alt">
    </a>
    <img src="/t.jpg" class="product-item__image-primary" alt="T">
   </div>
   <h3 class="card__heading"><a href="/products/t">T</a></h3><span class="price">$10.00</span></li>
 </ul>`;
 const $ = cheerio.load(injectCollectionItems(grid, [
  { id: "i1", title: "Celine Triomphe", priceCents: 52000, currency: "USD", images: ["https://x/1.jpg"] },
 ], (it) => `/p/${it.id}`));
 const card = $("[data-vya-collection]");
 assert.equal(card.find("img").length, 1, "alternate slot dropped — nothing to show on hover");
 assert.equal(card.find("img").attr("src"), "https://x/1.jpg");
});

// Bag Crush's collection template wraps the whole page in `<section class="collection-page
// has-pagination">`. That matched the pagination selector, came first in document order, and
// contained the grid — so a collection with one page of items had the entire section removed and
// served as a blank page. Real markup, reduced.
test("a section merely CLASSED 'has-pagination' is not the pager, and is never removed", () => {
 const html = `<html><body><main><section id="content" class="collection-page has-pagination infinite_scroll">
  <div class="collection-page__product-list collection-page__product-list--4-columns"><article class="product-item"><a href="/products/a"><img src="a.jpg"><span class="price">$10.00</span><h3>A</h3></a></article><article class="product-item"><a href="/products/b"><img src="b.jpg"><span class="price">$20.00</span><h3>B</h3></a></article><article class="product-item"><a href="/products/c"><img src="c.jpg"><span class="price">$30.00</span><h3>C</h3></a></article></div>
  <div class="pagination"><ul class="pagination__page-list"><li class="pagination__page pagination__page--current">1</li><li class="pagination__page"><a href="/collections/all?page=2">2</a></li></ul></div>
 </section></main></body></html>`;
 // The theme rendered three cards, so its page size is three: these three items are one page —
 // exactly the case that used to blank the page. The grid is named `collection-page__product-list`,
 // which GRID_SELECTORS does NOT match, so this also pins the productGrids-based exclusion.
 const out = injectCollectionItems(html, [
  { id: "1", title: "Prada Tote", priceCents: 55000, currency: "USD", images: ["p.jpg"], sourceId: "prada-tote" },
  { id: "2", title: "Dior Bag", priceCents: 42000, currency: "USD", images: ["d.jpg"], sourceId: "dior-bag" },
  { id: "3", title: "Fendi Baguette", priceCents: 39000, currency: "USD", images: ["f.jpg"], sourceId: "fendi-baguette" },
 ], (it) => `/products/${it.sourceId}`, { page: 1, path: "/collections/all", renderEmpty: true });

 assert.match(out, /id="content"/, "the collection section survives");
 assert.match(out, /Prada Tote/);
 assert.match(out, /Dior Bag/);
 assert.doesNotMatch(out, /href="\/products\/[abc]"/, "the captured cards are replaced, not joined by a second grid");
 assert.doesNotMatch(out, /pagination__page-list/, "the real pager is what gets removed on a single page");
});

test("capturedGridProductHandles reads the real handles a manually-curated collection page listed", () => {
 const html = `<html><body><main><section id="content"><ul class="product-grid">
  <li class="grid__item"><a href="/products/dolce-gabbana-rose-heels"><img src="a.jpg"><h3>Rose Heels</h3><span class="price">$240</span></a></li>
  <li class="grid__item"><a href="/products/dolce-gabbana-colorful-strappy-heels"><img src="b.jpg"><h3>Strappy Heels</h3><span class="price">$250</span></a></li>
  <li class="grid__item"><a href="/products/dolce-gabbana-ss-2004"><img src="c.jpg"><h3>SS 2004</h3><span class="price">$300</span></a></li>
 </ul></section></main></body></html>`;
 assert.deepEqual(capturedGridProductHandles(html), [
  "dolce-gabbana-rose-heels", "dolce-gabbana-colorful-strappy-heels", "dolce-gabbana-ss-2004",
 ]);
});

test("capturedGridProductHandles dedupes and ignores non-grid product links (e.g. a header nav item)", () => {
 const html = `<html><body>
  <nav><a href="/products/featured-pick">Featured</a></nav>
  <main><ul class="product-grid">
   <li class="grid__item"><a href="/products/a"><img src="a.jpg"><h3>A</h3><span class="price">$10</span></a></li>
   <li class="grid__item"><a href="/products/a?variant=123"><img src="a.jpg"><h3>A</h3><span class="price">$10</span></a></li>
   <li class="grid__item"><a href="/products/b"><img src="b.jpg"><h3>B</h3><span class="price">$20</span></a></li>
  </ul></main>
 </body></html>`;
 assert.deepEqual(capturedGridProductHandles(html), ["a", "b"]);
});

test("capturedGridProductHandles returns nothing for a page with no real product grid", () => {
 const html = `<html><body><main><p>Coming soon.</p></main></body></html>`;
 assert.deepEqual(capturedGridProductHandles(html), []);
});

// ── Horizon-generation grids live in CUSTOM ELEMENTS ────────────────────────────────
// Unique Vintage's homepage nests its products as
//   slideshow-container > slideshow-slides > slideshow-slide > product-card
// Scanning only ul/ol/div/section never reached <slideshow-slides>, so detection returned ZERO
// grids and the store rendered frozen stock from the capture instead of live inventory — sold
// pieces still on sale, portal additions invisible. Measured across 88 captured pages, adding
// custom elements to the scan gained 5 grids and lost none.
test("a grid built from custom elements is detected", () => {
 const card = (n: number) =>
  `<slideshow-slide class="resource-list__slide"><div class="resource-list__item">` +
  `<product-card><a href="/products/piece-${n}"><img src="/i/${n}.jpg"><span>Piece ${n}</span></a></product-card>` +
  `</div></slideshow-slide>`;
 const html = `<html><body><slideshow-container><slideshow-slides>${[1, 2, 3, 4].map(card).join("")}</slideshow-slides></slideshow-container></body></html>`;
 assert.equal(detectGridHandles(html).length, 1);
});

test("a lone custom-element card is not mistaken for a grid", () => {
 const html = `<html><body><product-card><a href="/products/only"><img src="/i.jpg"><span>Only</span></a></product-card></body></html>`;
 assert.equal(detectGridHandles(html).length, 0);
});

test("injectSqsCartPage no-ops on a non-Squarespace page (no #sqs-cart-root)", () => {
 const html = `<html><body><div id="content">not squarespace</div></body></html>`;
 assert.equal(injectSqsCartPage(html, [], "/checkout?cart=1"), html);
});

test("injectSqsCartPage replaces Squarespace's own (unreliable) client-rendered mount with a real, server-rendered listing", () => {
 const html = `<html><body><main><div id="sqs-cart-root"><script type="application/json">{"storeCurrency":"USD"}</script><div id="sqs-cart-container"></div></div></main></body></html>`;
 const lines = [
  { id: "i1", title: "Chanel Heels", priceCents: 20000, currency: "USD", image: "https://x/a.jpg", href: "/products/chanel-heels" },
  { id: "i2", title: "Gucci Flats", priceCents: 15000, currency: "USD", image: null, href: "/products/gucci-flats" },
 ];
 const out = injectSqsCartPage(html, lines, "/checkout?cart=1");
 assert.match(out, /Chanel Heels/);
 assert.match(out, /Gucci Flats/);
 assert.match(out, /\$200\.00/);
 assert.match(out, /\$350\.00/, "subtotal");
 assert.match(out, /href="\/checkout\?cart=1"/);
});

test("injectSqsCartPage disarms Squarespace's own mount so it can't re-render over ours", () => {
 const html = `<html><body><main><div id="sqs-cart-root"><div id="sqs-cart-container"></div></div></main></body></html>`;
 const out = injectSqsCartPage(html, [], "/checkout?cart=1");
 const $ = cheerio.load(out);
 assert.equal($("#sqs-cart-root").length, 0, "the real id Squarespace's bundle looks up must be gone");
 assert.equal($("#sqs-cart-container").length, 0);
});

test("injectSqsCartPage shows a real empty-cart message, not a blank page, for an empty cart", () => {
 const html = `<html><body><main><div id="sqs-cart-root"><div id="sqs-cart-container"></div></div></main></body></html>`;
 const out = injectSqsCartPage(html, [], "/checkout?cart=1");
 assert.match(out, /nothing in your shopping cart/i);
 assert.doesNotMatch(out, /href="\/checkout\?cart=1"/, "no checkout button with nothing to check out");
});
