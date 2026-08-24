import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { prepareEditMode, applyEdits, injectCollectionItems, injectShim, deShopify, deLazy } from "./site-capture.ts";

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

test("deLazy applies a data-bgset background when there is no noscript fallback", () => {
 const $ = cheerio.load(`<div class="banner lazyload" data-bgset="//cdn/b_{width}x.jpg 1200w"></div>`);
 deLazy($, "https://store.com/");
 const style = $("div.banner").attr("style") || "";
 assert.match(style, /background-image:url\('https:\/\/cdn\/b_1600x\.jpg'\)/);
});
