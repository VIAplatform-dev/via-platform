import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPriceFromHtml, verifyMatchPrices, parseMoney, rankVerifyCandidates } from "./comp-price-verify.ts";

// ── number formats ──
// European stores write "9.995,00" for 9,995 and "9,99" for 9.99. Reading either with a
// US-only parser produced $9.99 for a 9,995 DKK dress (1000× low) and $999 for a 9,99 one
// (100× high) — silent, systematic, and aimed exactly at the stores this feature targets.
test("parseMoney reads US formats", () => {
 assert.equal(parseMoney("450.00"), 45000);
 assert.equal(parseMoney("1,299.00"), 129900);
 assert.equal(parseMoney("1299"), 129900);
 assert.equal(parseMoney(966), 96600);
});

test("parseMoney reads European formats", () => {
 assert.equal(parseMoney("9.995,00"), 999500, "dot=thousands, comma=decimal");
 assert.equal(parseMoney("9,99"), 999, "comma decimal with 2 places");
 assert.equal(parseMoney("1.234.567,89"), 123456789);
 assert.equal(parseMoney("9.995"), 999500, "bare 3-digit group is thousands, not milli-units");
});

test("parseMoney strips symbols and rejects non-prices", () => {
 assert.equal(parseMoney("€1.450,00"), 145000);
 assert.equal(parseMoney("$1,450.00"), 145000);
 assert.equal(parseMoney(""), null);
 assert.equal(parseMoney("free"), null);
 assert.equal(parseMoney(0), null);
});

test("extractPriceFromHtml handles a European og:price amount", () => {
 const html = `<html><head>
 <meta property="og:price:amount" content="9.995,00">
 <meta property="og:price:currency" content="DKK">
 </head><body></body></html>`;
 const r = extractPriceFromHtml(html);
 assert.ok(r);
 assert.equal(r.priceCents, 999500);
 assert.equal(r.currency, "DKK");
});

test("extractPriceFromHtml finds a Product block late in a very large page", () => {
 const filler = "<div>x</div>".repeat(60_000); // ~700KB before the block
 const html = `<html><body>${filler}<script type="application/ld+json">{"@type":"Product","offers":{"price":"1250.00","priceCurrency":"USD"}}</script></body></html>`;
 const r = extractPriceFromHtml(html);
 assert.ok(r, "a heavy page must not hide its structured price");
 assert.equal(r.priceCents, 125000);
});

// ── candidate selection ──
// The 8-fetch budget was being spent on Instagram/TikTok/category pages, which can never
// yield a product price — so genuine product pages further down the list were never fetched.
test("rankVerifyCandidates drops hosts that can never hold a product price", () => {
 const urls = rankVerifyCandidates([
  { link: "https://www.instagram.com/p/abc/" },
  { link: "https://www.tiktok.com/discover/miu-miu" },
  { link: "https://www.pinterest.com/thehunt/x/" },
  { link: "https://www.vogue.com.tw/article/vintage-archives-11" },
  { link: "https://shop.example.com/products/a-dress" },
 ], 8).map((m) => m.link);
 assert.deepEqual(urls, ["https://shop.example.com/products/a-dress"]);
});

test("rankVerifyCandidates puts product-looking URLs ahead of listing pages", () => {
 const ranked = rankVerifyCandidates([
  { link: "https://www.vestiairecollective.com/women-clothing/dresses/miu-miu/beige/" },
  { link: "https://www.1stdibs.com/buy/miu-1999/" },
  { link: "https://www.timesupshop.com/products/fw1999-miu-miu-maxi-dress" },
  { link: "https://www.ebay.com/itm/274106142836" },
 ], 2).map((m) => m.link);
 assert.deepEqual(ranked, [
  "https://www.timesupshop.com/products/fw1999-miu-miu-maxi-dress",
  "https://www.ebay.com/itm/274106142836",
 ], "product pages get the budget before category/search pages");
});

// ── extraction: JSON-LD is the primary source (Shopify/WooCommerce both emit it) ──

const shopifyJsonLd = `<!doctype html><html><head><title>Valentino bag</title>
<script type="application/ld+json">
{"@context":"http://schema.org/","@type":"Product","name":"Valentino – Blummier",
 "offers":{"@type":"Offer","price":"450.00","priceCurrency":"EUR","availability":"http://schema.org/InStock"}}
</script></head><body>product page</body></html>`;

test("extracts price + currency + availability from JSON-LD Product offers", () => {
 const r = extractPriceFromHtml(shopifyJsonLd);
 assert.ok(r);
 assert.equal(r.priceCents, 45000);
 assert.equal(r.currency, "EUR");
 assert.equal(r.availability, "in_stock");
});

const graphJsonLd = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","name":"shop"},
 {"@type":"Product","name":"bag","offers":[{"@type":"Offer","price":966,"priceCurrency":"USD","availability":"https://schema.org/SoldOut"}]}
]}
</script></head><body></body></html>`;

test("handles @graph wrappers, offer arrays, numeric prices, and SoldOut availability", () => {
 const r = extractPriceFromHtml(graphJsonLd);
 assert.ok(r);
 assert.equal(r.priceCents, 96600);
 assert.equal(r.currency, "USD");
 assert.equal(r.availability, "sold");
});

const ogMeta = `<html><head>
<meta property="og:title" content="Vintage dress" />
<meta property="og:price:amount" content="129.99" />
<meta property="og:price:currency" content="GBP" />
</head><body></body></html>`;

test("falls back to og:price meta tags", () => {
 const r = extractPriceFromHtml(ogMeta);
 assert.ok(r);
 assert.equal(r.priceCents, 12999);
 assert.equal(r.currency, "GBP");
});

const microdata = `<html><body>
<div itemscope itemtype="http://schema.org/Product">
 <span itemprop="price" content="88.00"></span>
 <meta itemprop="priceCurrency" content="USD" />
</div></body></html>`;

test("falls back to microdata itemprop price", () => {
 const r = extractPriceFromHtml(microdata);
 assert.ok(r);
 assert.equal(r.priceCents, 8800);
 assert.equal(r.currency, "USD");
});

test("returns null when the page has no structured price", () => {
 assert.equal(extractPriceFromHtml("<html><body><p>Editorial about bags: $100 ideas</p></body></html>"), null);
 assert.equal(extractPriceFromHtml(""), null);
});

test("out-of-stock JSON-LD availability reads as sold", () => {
 const html = shopifyJsonLd.replace("InStock", "OutOfStock");
 const r = extractPriceFromHtml(html);
 assert.ok(r);
 assert.equal(r.availability, "sold");
});

// ── orchestrator: enrich unpriced matches via an injected fetcher (no network in tests) ──

const M = (title: string, link: string, priceCents: number | null = null) => ({ title, priceCents, source: "store", link });

test("verifyMatchPrices fills prices for unpriced matches, converting to USD", async () => {
 const pages: Record<string, string> = { "https://a.example/p1": shopifyJsonLd };
 const fetcher = async (url: string) => pages[url] ?? null;
 const out = await verifyMatchPrices([M("eu bag", "https://a.example/p1")], { fetcher });
 assert.equal(out.length, 1);
 // €450 at the config EUR rate — must exceed $450, never equal it (the €-as-$ bug).
 assert.ok(out[0].priceCents != null && out[0].priceCents > 45000);
 assert.equal(out[0].sold, false);
});

test("verifyMatchPrices marks sold pages as sold comps", async () => {
 const fetcher = async () => graphJsonLd;
 const out = await verifyMatchPrices([M("sold bag", "https://a.example/sold")], { fetcher });
 assert.equal(out[0].priceCents, 96600);
 assert.equal(out[0].sold, true);
});

test("verifyMatchPrices leaves matches untouched on fetch failure or missing price", async () => {
 const fetcher = async () => null;
 const out = await verifyMatchPrices([M("blocked", "https://blocked.example/x")], { fetcher });
 assert.equal(out[0].priceCents, null);
});

test("verifyMatchPrices discards extraction outliers vs the priced cluster", async () => {
 // Cluster of already-priced matches around $400–500; a scraped $9,999 is an extraction error.
 const outlier = shopifyJsonLd.replace('"price":"450.00","priceCurrency":"EUR"', '"price":"9999.00","priceCurrency":"USD"');
 const fetcher = async () => outlier;
 const matches = [
  M("priced 1", "https://x/1", 40000),
  M("priced 2", "https://x/2", 45000),
  M("priced 3", "https://x/3", 50000),
  M("scrape me", "https://x/4"),
 ];
 const out = await verifyMatchPrices(matches, { fetcher });
 const scraped = out.find((m) => m.title === "scrape me");
 assert.ok(scraped);
 assert.equal(scraped.priceCents, null); // >5× cluster median → discarded, not admitted
});

test("verifyMatchPrices only fetches up to the cap and skips non-http links", async () => {
 let calls = 0;
 const fetcher = async () => { calls++; return null; };
 const many = Array.from({ length: 12 }, (_, i) => M(`m${i}`, `https://x/${i}`));
 await verifyMatchPrices([M("ftp", "ftp://bad/x"), ...many], { fetcher, maxPages: 8 });
 assert.equal(calls, 8);
});
