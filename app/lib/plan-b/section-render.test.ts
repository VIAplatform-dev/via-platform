import { test } from "node:test";
import assert from "node:assert/strict";
import { requestedSectionId, extractSection, emptySection, predictiveSearchEmptySection, predictiveSearchResultsSection, isPredictiveSearchEmptyId } from "./section-render.ts";

const P = (qs: string) => new URLSearchParams(qs);

test("an ordinary page request is not a section request", () => {
 assert.equal(requestedSectionId(P("")), null);
 assert.equal(requestedSectionId(P("q=chanel&page=2")), null);
});

test("accepts the id with or without Shopify's DOM prefix", () => {
 assert.equal(requestedSectionId(P("section_id=template--123__main")), "template--123__main");
 assert.equal(requestedSectionId(P("section_id=shopify-section-template--123__main")), "template--123__main");
});

test("refuses a malformed or hostile section id rather than reflecting it into markup", () => {
 for (const bad of ["<script>", "a b", "../../etc", "x\"onload=1", "a".repeat(200)]) {
  assert.equal(requestedSectionId(P(`section_id=${encodeURIComponent(bad)}`)), null, bad);
 }
});

test("extracts the section wrapper, not the whole page", () => {
 const page = `<html><body><div id="shopify-section-header">HEAD</div><main><section id="shopify-section-template--1__main" class="shopify-section"><p>grid</p></section></main></body></html>`;
 const out = extractSection(page, "template--1__main")!;
 assert.match(out, /id="shopify-section-template--1__main"/);
 assert.match(out, /<p>grid<\/p>/);
 assert.ok(!out.includes("HEAD"), "must not carry the rest of the page");
});

test("a section that isn't on the page returns null so the caller can fall back", () => {
 assert.equal(extractSection(`<div id="shopify-section-a"></div>`, "b"), null);
});

test("the fallback is a real, correctly-identified section — morphSection() needs the id", () => {
 // Given a 404 or the full page the theme THROWS; given this it morphs an empty section and moves on.
 const out = emptySection("predictive-search");
 assert.match(out, /id="shopify-section-predictive-search"/);
 assert.match(out, /class="shopify-section"/);
});

test("empty predictive-search state carries the class the theme queries for", () => {
 const out = predictiveSearchEmptySection("predictive-search-empty");
 // querySelector('.predictive-search-empty-section') — missing it throws inside the search drawer.
 assert.match(out, /class="predictive-search-empty-section"/);
 // morph is childrenOnly, so the results div must live INSIDE the empty-section element.
 const inner = out.slice(out.indexOf("predictive-search-empty-section"));
 assert.match(inner, /id="predictive-search-results"/);
 // the theme prepends recently-viewed here and bails out if it's absent
 assert.match(inner, /id="predictive-search-products"/);
});

test("results use the theme's own class names, not ours", () => {
 const out = predictiveSearchResultsSection("predictive-search", [
  { title: "Chanel Flap", href: "/products/chanel-flap", image: "https://x/img.jpg", price: "$5,000" },
  { title: "Dior Saddle", href: "/products/dior", image: null, price: "$2,500" },
 ]);
 // What the theme's CSS styles and its keyboard navigation queries for. Matched as a CLASS TOKEN
 // rather than the whole attribute: the real theme puts `--product` beside it on the card and three
 // classes on the list, and pinning the exact attribute string here asserted our own simplified
 // markup was correct — which is precisely how the drawer shipped rendering two giant cards a row.
 assert.equal((out.match(/class="predictive-search-results__card[ "]/g) || []).length, 2);
 assert.match(out, /class="[^"]*\bpredictive-search-results__wrapper-products\b[^"]*"/);
 assert.match(out, /role="option"/);
 assert.ok(!out.includes("data-single-result-url"), "only a LONE result gets the Enter-key shortcut");
});

test("a single result gets data-single-result-url so Enter jumps straight to it", () => {
 const out = predictiveSearchResultsSection("s", [{ title: "Only", href: "/products/only", image: null, price: "$1" }]);
 assert.match(out, /data-single-result-url="\/products\/only"/);
});

test("no results falls back to the empty state, not an empty string", () => {
 assert.match(predictiveSearchResultsSection("s", []), /predictive-search-empty-section/);
});

test("titles and urls are escaped — a product name is seller-supplied text", () => {
 const out = predictiveSearchResultsSection("s", [
  { title: `Bag <img src=x onerror="alert(1)">`, href: `/products/x"onmouseover="alert(1)`, image: null, price: "$1" },
 ]);
 assert.ok(!out.includes("<img src=x"), "title must not become markup");
 assert.ok(!/href="[^"]*"on\w+="/.test(out), "href must not break out of its attribute");
});

test("isPredictiveSearchEmptyId matches the naming themes actually use", () => {
 assert.equal(isPredictiveSearchEmptyId("predictive-search-empty"), true);
 assert.equal(isPredictiveSearchEmptyId("predictive_search_empty"), true);
 assert.equal(isPredictiveSearchEmptyId("template--1__main"), false);
});

test("predictiveSearchResultsSection carries #predictive-search-count — required by the \"Shapes\"-family theme convention", () => {
 // Its PredictiveSearch component does `.querySelector(\"#predictive-search-count\").textContent`
 // with NO null check; missing this id throws inside the fetch handler and its own .catch() resets
 // the search box to empty on every keystroke. Confirmed against the theme's real code.
 const out = predictiveSearchResultsSection("predictive-search", [
  { title: "Chanel Flap", href: "/products/chanel-flap", image: null, price: "$5,000" },
 ]);
 assert.match(out, /id="predictive-search-count"/);
 assert.match(out, />1 result</);
});

test("predictiveSearchResultsSection's count is plural for more than one result, singular for exactly one", () => {
 const two = predictiveSearchResultsSection("s", [
  { title: "A", href: "/products/a", image: null, price: "$1" },
  { title: "B", href: "/products/b", image: null, price: "$2" },
 ]);
 assert.match(two, />2 results</);
});

test("predictiveSearchEmptySection also carries #predictive-search-count — same theme, same null-unsafe read", () => {
 const out = predictiveSearchEmptySection("predictive-search-empty");
 assert.match(out, /id="predictive-search-count"/);
});

// The search drawer rendered two enormous cards per row with the title and price run together,
// where the seller's own site shows four tidy ones. Nothing was missing from the response — the
// products, titles and prices were all there — so every content check passed it. What was missing
// was the nesting the theme's CSS actually selects on. These lock that shape in.

test("results hang the grid off the class the theme's CSS actually styles", () => {
 const html = predictiveSearchResultsSection("predictive-search", [
  { title: "1930s Enamel Dangle Brooch", href: "/products/brooch", image: "https://cdn/x.png", price: "$50.00" },
  { title: "1930s Mini Locket Charm", href: "/products/locket", image: "https://cdn/y.png", price: "$75.00" },
 ]);
 // The grid lives on __list, on a <ul>. A bare wrapper div matches no rule and every card renders
 // at its natural size — which is the bug this whole family of assertions exists to catch.
 assert.match(html, /<ul class="[^"]*predictive-search-results__list[^"]*"/);
 assert.match(html, /list-unstyled/);
 assert.equal((html.match(/<li class="predictive-search-results__card /g) || []).length, 2);
 assert.match(html, /predictive-search-results__card--product/);
});

test("each result is a resource-card, which is what sizes the photograph", () => {
 const html = predictiveSearchResultsSection("predictive-search", [
  { title: "1930s Mini Locket Charm", href: "/products/locket", image: "https://cdn/y.png", price: "$75.00" },
 ]);
 assert.match(html, /class="resource-card"/);
 assert.match(html, /class="resource-card__media"/);
 assert.match(html, /--resource-card-aspect-ratio: 4 \/ 5/);
 assert.match(html, /class="resource-card__image"/);
 assert.match(html, /class="resource-card__content"/);
 assert.match(html, /class="resource-card__title paragraph">1930s Mini Locket Charm</);
});

test("the price is its own block, not a span welded to the title", () => {
 const html = predictiveSearchResultsSection("predictive-search", [
  { title: "Brooch", href: "/products/b", image: null, price: "$50.00" },
 ]);
 // "Brooch$50" on one line was the visible symptom: two inline spans with nothing between them.
 assert.ok(!/Brooch<\/span><span[^>]*>\$50/.test(html), "title and price are still welded together");
 assert.match(html, /<div class="price__regular"><span class="price">\$50\.00<\/span><\/div>/);
});

test("keeps the heading and the count the drawer expects", () => {
 const html = predictiveSearchResultsSection("predictive-search", [
  { title: "A", href: "/products/a", image: null, price: "$1.00" },
  { title: "B", href: "/products/b", image: null, price: "$2.00" },
 ]);
 assert.match(html, /predictive-search-results__title">Products</);
 assert.match(html, /id="predictive-search-products"/);
 assert.match(html, /id="predictive-search-count"[^>]*>2 results</);
 assert.match(html, /role="status">2 search results found</);
});

test("a lone result still carries the jump-straight-there attribute", () => {
 const one = predictiveSearchResultsSection("predictive-search", [{ title: "Only", href: "/products/only", image: null, price: "$9.00" }]);
 assert.match(one, /data-single-result-url="\/products\/only"/);
 assert.match(one, /1 result</);
 const two = predictiveSearchResultsSection("predictive-search", [
  { title: "A", href: "/products/a", image: null, price: "" },
  { title: "B", href: "/products/b", image: null, price: "" },
 ]);
 assert.ok(!two.includes("data-single-result-url"), "two results must not jump anywhere");
});

test("a piece with no photograph still renders a card rather than a hole", () => {
 const html = predictiveSearchResultsSection("predictive-search", [{ title: "No photo", href: "/products/n", image: null, price: "$5.00" }]);
 assert.match(html, /class="resource-card__media"/);
 assert.ok(!html.includes("<img"), "no image element when there is no image");
 assert.match(html, /No photo/);
});

test("a title with markup in it cannot break out into the drawer", () => {
 const html = predictiveSearchResultsSection("predictive-search", [
  { title: '<script>alert(1)</script> "Dress"', href: "/products/x?a=1&b=2", image: null, price: "$1.00" },
 ]);
 assert.ok(!html.includes("<script>"), "script tag survived into the drawer");
 assert.match(html, /&lt;script&gt;/);
 assert.match(html, /href="\/products\/x\?a=1&amp;b=2"/);
});
