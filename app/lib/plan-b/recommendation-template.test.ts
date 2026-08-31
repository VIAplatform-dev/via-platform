import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import {
 isUsableRecommendationTemplate, markRecommendationForms, renderRecommendationSection,
 sanitizeRecommendationTemplate, sourceRecommendationsUrl, templateSectionId,
} from "./recommendation-template.ts";

/** A stripped-down copy of a real "Shapes"-family strip: an Alpine island per card, a theme-classed
 *  grid, and the quick-buy form whose hidden `id` our bridge resolves. */
const card = (n: number, title: string, price: string) => `
<li><div class="product-tile relative">
 <data-island class="contents" x-data="QuickBuy({&quot;id&quot;:${n}})" src="//shop.example/island.js">
  <div class="product-tile__container">
   <a href="/products/p${n}?pr_rec_id=abc" class="product-tile__featured-media">
    <div class="product-media-object pb-media-shadow"><img src="//shop.example/${n}.jpg" alt="${title}" srcset="//shop.example/${n}.jpg 200w" class="bg-scheme-background"></div>
   </a>
   <div class="product-tile mt-5 text-center">
    <h3 class="font-body text-base">${title}</h3>
    <span class="mt-2.5 inline-block" x-html="formatMoney(currentPrice)">${price}</span>
   </div>
   <form method="post" action="/cart/add" class="quick-buy-product-form" onsubmit="return false">
    <input type="hidden" name="id" value="${n}0000">
    <button class="push-btn" type="submit" :disabled="!currentVariantAvailable"><span class="push-btn__surface" x-text="addToCartText">Add to Cart</span><span class="visually-hidden">, ${title}</span></button>
   </form>
   <div class="added-panel" x-show="addedToCart" x-cloak>Added to Cart! <a href="/cart">View cart</a></div>
  </div>
 </data-island>
</div></li>`;

const TEMPLATE = `<div id="shopify-section-template--111__related-products" class="shopify-section">
<div class="related-products">
 <section data-related-products-section class="bg-scheme-background" data-color-scheme="scheme4">
  <div class="section-content px-section">
   <h2 class="font-heading heading-standard text-center">You may also like</h2>
   <ul class="grid lg:grid-cols-3 gap-theme" role="list">
    ${card(1, "Versailles Tank Top", "$44.00")}
    ${card(2, "Haband Sheer Top", "$44.00")}
    ${card(3, "Attrak Blue Denim Shorts", "$49.00")}
   </ul>
  </div>
  <script>window.themeAnalytics = 1;</script>
 </section>
</div></div>`;

const ITEMS = [
 { id: "a1", title: "Green Patterned Top", priceCents: 4900, currency: "USD", images: ["https://vya.test/green.jpg"], sourceId: "green-patterned-top", available: true },
 { id: "a2", title: "Silk Land Tank Top", priceCents: 4700, currency: "USD", images: ["https://vya.test/silk.jpg"], sourceId: "silk-land-tank-top", available: true },
];
const hrefFor = (it: { id: string; sourceId?: string | null }) => `/products/${it.sourceId || it.id}`;

const SECTION = "template--999__related-products";
const render = () => renderRecommendationSection(TEMPLATE, ITEMS, hrefFor, SECTION) || "";

test("sourceRecommendationsUrl asks the source store the question the theme asked us", () => {
 assert.equal(
  sourceRecommendationsUrl("https://shop.example", "template--111__related-products", "8458021961898", 6),
  "https://shop.example/recommendations/products?section_id=template--111__related-products&limit=6&product_id=8458021961898",
 );
});

test("sanitize takes the Alpine island out but leaves the card it wrapped in place", () => {
 const $ = cheerio.load(sanitizeRecommendationTemplate(TEMPLATE), null, false);
 assert.equal($("data-island").length, 0, "island unwrapped");
 assert.equal($(".product-tile__container").length, 3, "the cards it wrapped are all still there");
 assert.equal($("[x-data], [x-html], [x-text], [\\:disabled]").length, 0, "no directive left to evaluate");
 assert.equal($("script").length, 0, "the source's own scripts are gone");
});

test("sanitize leaves the theme's server-rendered price behind for us to overwrite", () => {
 // The price element is `x-html="formatMoney(currentPrice)"` with the real amount inside it as a
 // fallback. Removing the ELEMENT along with the directive would leave the card price-less.
 const $ = cheerio.load(sanitizeRecommendationTemplate(TEMPLATE), null, false);
 assert.match($("ul li").first().text(), /\$44\.00/);
});

test("sanitize keeps Alpine's hidden panels hidden — a shopper must never be told 'Added to Cart!' unprompted", () => {
 const $ = cheerio.load(sanitizeRecommendationTemplate(TEMPLATE), null, false);
 const panel = $(".added-panel").first();
 assert.equal(panel.length, 1, "the element stays, in case the theme's layout counts on it");
 assert.match(panel.attr("style") || "", /display:none/);
});

test("renders one theme card per live piece, in the theme's own markup", () => {
 const $ = cheerio.load(render(), null, false);
 const cards = $("ul li");
 assert.equal(cards.length, ITEMS.length);
 assert.equal($(".product-tile").length > 0, true, "the theme's card class survived");
 assert.equal($("h2").text().trim(), "You may also like");
 assert.equal($("section").attr("data-color-scheme"), "scheme4", "and its colour band");
});

test("each card shows OUR piece — its photo, name, price and link", () => {
 const $ = cheerio.load(render(), null, false);
 const first = $("ul li").first();
 assert.equal(first.find("img").attr("src"), "https://vya.test/green.jpg");
 assert.equal(first.find("h3").text().trim(), "Green Patterned Top");
 assert.match(first.text(), /\$49/);
 assert.equal(first.find("a").first().attr("href"), "/products/green-patterned-top");
});

test("no card is left carrying the source store's own product", () => {
 const out = render();
 for (const stale of ["Versailles Tank Top", "Haband Sheer Top", "shop.example/1.jpg", "pr_rec_id"]) {
  assert.ok(!out.includes(stale), `template's own ${stale} still in the strip`);
 }
});

test("the theme's add-to-cart form points at this piece and is intercepted, not submitted", () => {
 const $ = cheerio.load(render(), null, false);
 const form = $("form[action='/cart/add']").first();
 assert.equal(form.attr("data-vya-rec-add"), "");
 assert.equal(form.attr("onsubmit"), undefined, "the capture's blanket neutraliser is lifted");
 assert.equal(form.find("input[name='id']").attr("value"), "green-patterned-top");
 // The interceptor itself is NOT in here: a <script> assigned through innerHTML never runs, so it
 // is injected into the page instead (see recommendationAddScript).
 assert.ok(!render().includes("<script"), "no script that could never execute");
});

test("the section is renamed to the one THIS page asked for — per-section custom CSS is scoped to it", () => {
 const out = render();
 assert.equal(templateSectionId(out), SECTION);
 assert.ok(!out.includes("template--111__related-products"), "no trace of the id it was captured under");
});

test("a template with no grid to fill is refused rather than rendered broken", () => {
 const empty = `<div id="shopify-section-x" class="shopify-section"><div class="related-products"><section><h2>You may also like</h2><ul class="grid"></ul></section></div></div>`;
 assert.equal(renderRecommendationSection(empty, ITEMS, hrefFor, SECTION), null);
 assert.equal(isUsableRecommendationTemplate(empty, ITEMS[0]), false);
 assert.equal(isUsableRecommendationTemplate(TEMPLATE, ITEMS[0]), true);
});

test("markRecommendationForms only claims forms that post to the cart", () => {
 const html = `<form action="/search"><input name="q"></form><form action="/cart/add"><input name="id" value="x"></form>`;
 const $ = cheerio.load(markRecommendationForms(html), null, false);
 assert.equal($("form[action='/search']").attr("data-vya-rec-add"), undefined);
 assert.equal($("form[action='/cart/add']").attr("data-vya-rec-add"), "");
});
