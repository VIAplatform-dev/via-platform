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
 // what the theme's CSS styles and its keyboard navigation queries for
 // exact class, not a substring match — the child spans carry `__card-title` / `__card-price` too
 assert.equal((out.match(/class="predictive-search-results__card"/g) || []).length, 2);
 assert.match(out, /class="predictive-search-results__wrapper-products"/);
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
