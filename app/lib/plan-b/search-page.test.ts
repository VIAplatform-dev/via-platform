import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { searchItems, scoreItem, applySearchChrome, pickSearchTemplatePath } from "./search-page.ts";

const ITEMS = [
 { title: "Prada Sporty Kitten Heels", brand: "Prada", category: "shoes", description: "black leather" },
 { title: "Gucci by Tom Ford Pumps", brand: "Gucci", category: "shoes", description: "1999 runway" },
 { title: "Silk Slip Dress", brand: "Miu Miu", category: "dresses", description: "care: dry clean, not like prada silk" },
 { title: "Moschino Floral Heels", brand: "Moschino", category: "shoes", description: "" },
];

test("a query matches title, brand and description", () => {
 const hits = searchItems(ITEMS, "prada");
 assert.equal(hits.length, 2);
 assert.equal(hits[0].title, "Prada Sporty Kitten Heels", "the piece actually called Prada ranks above the one that mentions it");
});

test("every term must hit — a two-word search is not an OR", () => {
 assert.deepEqual(searchItems(ITEMS, "prada heels").map((i) => i.title), ["Prada Sporty Kitten Heels"]);
 assert.deepEqual(searchItems(ITEMS, "prada saddlebag"), [], "one unmatched term disqualifies the item");
});

test("search is case- and whitespace-insensitive", () => {
 assert.equal(searchItems(ITEMS, "  GUCCI  ").length, 1);
 assert.equal(searchItems(ITEMS, "tom ford").length, 1);
});

test("an empty query returns nothing rather than everything", () => {
 assert.deepEqual(searchItems(ITEMS, ""), []);
 assert.deepEqual(searchItems(ITEMS, "   "), []);
});

test("regex metacharacters in a query are literal, not a pattern", () => {
 assert.doesNotThrow(() => searchItems(ITEMS, "prada (*.+"));
 assert.deepEqual(searchItems(ITEMS, ".*"), []);
});

test("ties keep the storefront's own order", () => {
 const both = searchItems(ITEMS, "shoes").map((i) => i.title);
 assert.deepEqual(both, ["Prada Sporty Kitten Heels", "Gucci by Tom Ford Pumps", "Moschino Floral Heels"]);
});

test("scoreItem returns 0 for a miss and a positive score for a hit", () => {
 assert.equal(scoreItem(ITEMS[0], ["chanel"]), 0);
 assert.ok(scoreItem(ITEMS[0], ["prada"]) > scoreItem(ITEMS[2], ["prada"]));
});

const TEMPLATE = `<html><head><title>All products – Vintage Archives LA</title><link rel="canonical" href="https://x.com/collections/all"><meta name="robots" content="index, follow"></head><body><header><h1><a href="/">Vintage Archives LA</a></h1><form action="/search" role="search"><input name="q" type="search" value=""></form></header><main><h1 class="collection-title">All products</h1><div class="grid"></div></main></body></html>`;

test("the collection template is restated as a search page", () => {
 const out = applySearchChrome(TEMPLATE, { query: "prada", count: 3 });
 assert.match(out, /Search results for “prada”/);
 assert.match(out, /<title>Search results for “prada” – Vintage Archives LA<\/title>/);
 assert.match(out, /<input name="q" type="search" value="prada">/);
 assert.doesNotMatch(out, /All products<\/h1>/, "the borrowed collection title is gone");
});

test("the store's own name in the header is never renamed", () => {
 const out = applySearchChrome(TEMPLATE, { query: "prada", count: 3 });
 assert.match(out, /<h1><a href="\/">Vintage Archives LA<\/a><\/h1>/);
});

test("no results says so, and says it once", () => {
 const out = applySearchChrome(TEMPLATE, { query: "chanel", count: 0 });
 assert.match(out, /No results for “chanel”/);
 assert.match(out, /data-vya-search-empty/);
 assert.equal((out.match(/data-vya-search-empty/g) || []).length, 1);
});

test("a search result page is not indexed as the collection it borrowed", () => {
 const out = applySearchChrome(TEMPLATE, { query: "prada", count: 1 });
 assert.doesNotMatch(out, /rel="canonical"/);
 assert.match(out, /<meta name="robots" content="noindex, follow">/);
 assert.equal((out.match(/name="robots"/g) || []).length, 1);
});

test("a query is escaped, not injected", () => {
 const attack = '"><script>alert(1)</script>';
 const out = applySearchChrome(TEMPLATE, { query: attack, count: 0 });
 // Asserted structurally, not by substring: the payload legitimately appears verbatim INSIDE the
 // search box's quoted value attribute (where `<` is a literal), and the only question that matters
 // is whether it ever becomes an element.
 const $ = cheerio.load(out);
 assert.equal($("script").length, 0, "the query never becomes a script element");
 assert.equal($('input[name="q"]').attr("value"), attack, "and it survives intact in the box");
 assert.match(out, /&lt;script&gt;/, "the heading and title carry it escaped");
});

test("the template is the closest thing the store has to a catalogue page", () => {
 assert.equal(pickSearchTemplatePath(["/", "/collections/all", "/collections/bags"]), "/collections/all");
 assert.equal(pickSearchTemplatePath(["/", "/collections/bags"]), "/collections/bags");
 assert.equal(pickSearchTemplatePath(["/", "/pages/about"]), "/", "a store with no collection page still gets a page");
 assert.equal(pickSearchTemplatePath([]), null);
 assert.equal(pickSearchTemplatePath(["/", "/search", "/collections/all"]), "/search", "a real captured search page wins");
});

test("the search form posts back to wherever this storefront is served from", () => {
 assert.match(applySearchChrome(TEMPLATE, { query: "x", count: 0 }), /action="\/search"/);
 // Plan A: the theme's bare /search would post to VYA's own root and 404.
 assert.match(applySearchChrome(TEMPLATE, { query: "x", count: 0, action: "/site/blummier/search" }), /action="\/site\/blummier\/search"/);
});

test("a single enormous term is bounded before it reaches a regex", () => {
 const huge = "a".repeat(5000);
 assert.doesNotThrow(() => searchItems(ITEMS, huge));
 assert.deepEqual(searchItems(ITEMS, huge), []);
});

// Bag Crush's only <h1> is its logo, which must never be renamed — so the page had no heading at all.
const LOGO_ONLY = `<html><head><title>All products – Bag Crush</title></head><body><div class="site-header"><h1 class="site-header__heading"><a href="/"><img src="logo.png" alt="Bag Crush"></a></h1></div><main><div class="grid"></div></main></body></html>`;

test("a theme with no page heading to borrow gets one, and keeps its logo", () => {
 const out = applySearchChrome(LOGO_ONLY, { query: "prada", count: 2 });
 assert.match(out, /data-vya-search-heading="1"[^>]*>Search results for “prada”</);
 assert.match(out, /site-header__heading[^>]*><a href="\/"><img src="logo.png"/, "the logo is untouched");
});

test("re-running replaces the inserted heading rather than stacking another", () => {
 const once = applySearchChrome(LOGO_ONLY, { query: "prada", count: 2 });
 const twice = applySearchChrome(once, { query: "gucci", count: 0 });
 assert.equal((twice.match(/data-vya-search-heading/g) || []).length, 1);
 assert.match(twice, /No results for “gucci”/);
 assert.equal((twice.match(/data-vya-search-empty/g) || []).length, 1);
});

test("the inserted heading is escaped", () => {
 const out = applySearchChrome(LOGO_ONLY, { query: "<img src=x onerror=1>", count: 1 });
 const $ = cheerio.load(out);
 assert.equal($("main img").length, 0, "the query never becomes an element");
 assert.match(out, /&lt;img src=x onerror=1&gt;/);
});

test("a term never matches mid-word — the 'zz' / 'dazzling' bug", () => {
 // Real: searching "zz" on Vintage Archives LA returned a sold-out Prada heel whose description
 // says "dazzling", while the predictive drawer (title/brand only) correctly found nothing.
 const dazzling = [{ title: "Prada Burlap Canvas Snakeskin Heels", brand: "Prada", category: "shoes", description: "a dazzling pair" }];
 assert.deepEqual(searchItems(dazzling, "zz"), []);
 assert.equal(searchItems(dazzling, "dazzling").length, 1, "the whole word still matches");
 assert.equal(searchItems(dazzling, "dazz").length, 1, "and so does a prefix of it");
});

test("a term matches across a hyphen, which is a word boundary", () => {
 const tee = [{ title: "Y2K T-Shirt", brand: null, category: "tops", description: null }];
 assert.equal(searchItems(tee, "shirt").length, 1);
 assert.equal(searchItems(tee, "y2k").length, 1);
 assert.equal(searchItems(tee, "hirt").length, 0, "but not mid-word");
});
