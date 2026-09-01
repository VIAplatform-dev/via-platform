import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyLivePrice } from "./live-price.ts";

const GBP = { priceCents: 229500, currency: "GBP" };

test("the price a shopper reads is the price the cart will charge", () => {
 // blummier: every captured page carries the price from crawl day, in the currency the crawl saw.
 // The record says £2,295; the page said $3,169; the cart charges the record. 12 of 12 sampled.
 const html = `<div class="price"><span class="price-item price-item--regular">$3,169.00</span></div>`;
 const $ = cheerio.load(applyLivePrice(html, GBP));
 assert.equal($(".price-item").text(), "£2,295.00");
});

test("a theme that names its price element differently is still corrected", () => {
 // sourcedbyscottie's theme: product__price--regular, not price-item.
 const html = `<div class="product__price" data-price-wrapper=""><span data-product-price="" class="product__price--regular">$195.00</span></div>`;
 const $ = cheerio.load(applyLivePrice(html, { priceCents: 21000, currency: "USD" }));
 assert.equal($(".product__price--regular").text(), "$210.00");
});

test("text that merely sits inside a price block is left alone", () => {
 // The bug in my first attempt at measuring this: a wrapper whose class mentions price also holds
 // the title, and "Plein Sud Jeans 1990s…" contains something that looks like a number.
 const html = `<div class="product__price-and-badge"><h1>Custo Barcelona 2000s Airbrushed Top</h1>
  <div class="product__price"><span class="product__price--regular">$135.00</span></div></div>`;
 const $ = cheerio.load(applyLivePrice(html, { priceCents: 14500, currency: "USD" }));
 assert.equal($("h1").text(), "Custo Barcelona 2000s Airbrushed Top", "the title is untouched");
 assert.equal($(".product__price--regular").text(), "$145.00");
});

test("the theme's own formatting is mirrored, not replaced with ours", () => {
 const withCode = cheerio.load(applyLivePrice(`<span class="price-item">$550.00 USD</span>`, { priceCents: 42000, currency: "USD" }));
 assert.equal(withCode(".price-item").text(), "$420.00 USD", "a theme that prints the code keeps it");
 const noDecimals = cheerio.load(applyLivePrice(`<span class="price-item">$550</span>`, { priceCents: 42000, currency: "USD" }));
 assert.equal(noDecimals(".price-item").text(), "$420", "a theme that prints whole pounds keeps them");
});

test("a sale price we cannot vouch for is removed rather than restated", () => {
 // A compare-at price from crawl day is a claim about a discount that may no longer be true.
 const html = `<div class="price"><span class="price-item price-item--regular">$100.00</span>
  <s class="price-item price-item--compare">$200.00</s></div>`;
 const $ = cheerio.load(applyLivePrice(html, { priceCents: 9000, currency: "USD" }));
 assert.equal($(".price-item--regular").text(), "$90.00");
 assert.equal($("s").length, 0, "the struck-through price is gone");
});

test("money outside a price element is not touched", () => {
 // "Free shipping over $200" is copy, not this piece's price.
 const html = `<p class="shipping-note">Free shipping over $200.00</p><span class="price-item">$50.00</span>`;
 const $ = cheerio.load(applyLivePrice(html, { priceCents: 9000, currency: "USD" }));
 assert.equal($(".shipping-note").text(), "Free shipping over $200.00");
 assert.equal($(".price-item").text(), "$90.00");
});

test("structured data and social meta carry the live price too", () => {
 const html = `<meta property="product:price:amount" content="3169.00">
  <meta property="product:price:currency" content="USD">
  <script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":"3169.00","priceCurrency":"USD"}}</script>
  <span class="price-item">$3,169.00</span>`;
 const $ = cheerio.load(applyLivePrice(html, GBP));
 assert.equal($('meta[property="product:price:amount"]').attr("content"), "2295.00");
 assert.equal($('meta[property="product:price:currency"]').attr("content"), "GBP");
 const ld = JSON.parse($('script[type="application/ld+json"]').text());
 assert.equal(ld.offers.price, "2295.00");
 assert.equal(ld.offers.priceCurrency, "GBP");
});

test("the page states the price it is showing, so a check never has to read the theme's markup", () => {
 // The same lesson as the collection rails: a check that has to guess which element is the price
 // gets it wrong (mine matched "EU 39" and a fragment of a product title). The page says it plainly.
 const $ = cheerio.load(applyLivePrice(`<head></head><span class="price-item">$3,169.00</span>`, GBP));
 assert.equal($('meta[name="vya:product-price"]').attr("content"), "229500 GBP");
});

test("an item with no price recorded leaves the captured page untouched", () => {
 // Nothing better to say than what the seller's own page said; inventing "£0.00" would be worse.
 const html = `<span class="price-item">$3,169.00</span>`;
 const $ = cheerio.load(applyLivePrice(html, { priceCents: null, currency: "GBP" }));
 assert.equal($(".price-item").text(), "$3,169.00");
 assert.equal($('meta[name="vya:product-price"]').length, 0);
});

test("a page whose price block was captured empty gets the price put back", () => {
 // sourcedbyscottie: one captured page holds <div class="product__price-and-badge"></div> and no
 // money anywhere, while the seller's own page shows $115.00. The shopper could not see the price.
 const html = `<html><head></head><body><h1>White Cotton Shirt</h1>
  <div class="product__block product__price-and-badge"></div></body></html>`;
 const $ = cheerio.load(applyLivePrice(html, { priceCents: 11500, currency: "USD" }));
 assert.equal($(".product__price-and-badge").text().trim(), "$115.00");
});

test("a page that already shows the price is not given a second one", () => {
 const html = `<div class="price"><span class="price-item">$50.00</span></div><div class="price-footer"></div>`;
 const out = applyLivePrice(html, { priceCents: 9000, currency: "USD" });
 assert.equal((out.match(/\$90\.00/g) || []).length, 1);
});

test("an empty element that is hidden, or is a sale badge, is not where the price goes", () => {
 const html = `<html><head></head><body>
  <span class="product__price--off hidden"></span>
  <span class="price-item--compare"></span>
  <div class="product__price"></div></body></html>`;
 const $ = cheerio.load(applyLivePrice(html, { priceCents: 11500, currency: "USD" }));
 assert.equal($(".product__price").text().trim(), "$115.00");
 assert.equal($(".product__price--off").text().trim(), "");
});

// ── the guard ────────────────────────────────────────────────────────────────────────────────────
// The stamp is written FROM the item record, so comparing the two proves nothing. What has to be
// checked is that the price a shopper reads is the stamped one — i.e. that the rewrite above
// actually reached the theme's own element on this particular theme.
import { pageShowsPrice } from "./live-price.ts";

test("the live price being visible on the page is what passes", () => {
 assert.equal(pageShowsPrice("Valentino Dress £2,295.00 Add to cart", 229500, "GBP"), true);
});

test("a theme we failed to rewrite is caught — the stale price is there and ours is not", () => {
 assert.equal(pageShowsPrice("Valentino Dress $3,169.00 Add to cart", 229500, "GBP"), false);
});

test("the theme's formatting does not decide the answer", () => {
 for (const shown of ["£2,295.00", "£2295.00", "£2,295", "GBP 2,295.00", "2,295.00 GBP"]) {
  assert.equal(pageShowsPrice(`Dress ${shown} Add to cart`, 229500, "GBP"), true, shown);
 }
});

test("the same digits under a different currency is not a match", () => {
 // "$2,295.00" where the record says £2,295.00 is the exact bug this is here to catch.
 assert.equal(pageShowsPrice("Dress $2,295.00", 229500, "GBP"), false);
});

test("an unrelated number of the same size does not count as the price", () => {
 assert.equal(pageShowsPrice("Sourced in Milan. Item 2295. Free shipping over $200.", 229500, "GBP"), false);
});

test("a whole-pound price still matches a page that prints decimals, and the reverse", () => {
 assert.equal(pageShowsPrice("Dress £150.00", 15000, "GBP"), true);
 assert.equal(pageShowsPrice("Dress £150", 15000, "GBP"), true);
});

// ── a markdown the seller is running ─────────────────────────────────────────────────────────────
// we-thieves shows "Kon Dangle Earrings £82.60" struck through from £120. Her feed carries both
// numbers and the client already parses them; they were then dropped, so her hosted store showed a
// flat price and she lost the markdown — a selling tool, and a visible difference from her own shop.

test("a piece on sale shows both prices, the way the seller's own page does", () => {
 const html = `<div class="price"><span class="price-item price-item--regular">$50.00</span></div>`;
 const $ = cheerio.load(applyLivePrice(html, { priceCents: 8260, currency: "USD", compareAtCents: 12000 }));
 assert.equal($(".price-item--regular").text(), "$82.60");
 const was = $("[data-vya-compare-at]");
 assert.equal(was.length, 1, "the original price is shown");
 assert.match(was.text(), /\$120(\.00)?/);
});

test("a piece not on sale shows one price and no stale markdown", () => {
 // A compare-at from crawl day is a discount claim we cannot vouch for. Removed unless the record
 // says the sale is live.
 const html = `<div class="price"><span class="price-item price-item--regular">$100.00</span>
  <s class="price-item price-item--compare">$200.00</s></div>`;
 const $ = cheerio.load(applyLivePrice(html, { priceCents: 9000, currency: "USD" }));
 assert.equal($(".price-item--regular").text(), "$90.00");
 assert.equal($("[data-vya-compare-at]").length, 0);
 assert.equal($("s").length, 0, "and the captured one is gone");
});

test("an original that is not actually higher is not shown as a markdown", () => {
 const $ = cheerio.load(applyLivePrice(`<span class="price-item">$50.00</span>`, { priceCents: 9000, currency: "USD", compareAtCents: 9000 }));
 assert.equal($("[data-vya-compare-at]").length, 0);
});

test("the markdown is stated in the page too, so a check can read it", () => {
 const $ = cheerio.load(applyLivePrice(`<head></head><span class="price-item">$50.00</span>`, { priceCents: 8260, currency: "USD", compareAtCents: 12000 }));
 assert.equal($('meta[name="vya:product-compare-at"]').attr("content"), "12000 USD");
});

test("a theme that names its price with custom ELEMENTS, not classes, is still rewritten", () => {
 // Shopify's newer themes mark the price up as <price-list><sale-price>…</sale-price>. Our selectors
 // looked only at class names, and `class="h4 text-on-sale"` says nothing about price — so the one
 // element holding the money was never matched. feathers served a Karl Lagerfeld dress at $200 with
 // a $498 markdown beside it, frozen at crawl day, while the cart charged $125 and her own site said
 // $125. The page contradicted our own record and nothing on it was true.
 const html = `<div class="product-info__block-item" data-block-type="price"><price-list class="price-list price-list--product">` +
  `<sale-price class="h4 text-on-sale"> <span class="sr-only">Sale price</span>$200.00 USD</sale-price>` +
  `<compare-at-price class="h5 text-subdued line-through"> <span class="sr-only">Regular price</span>$498.00 USD</compare-at-price>` +
  `</price-list></div>`;
 const out = applyLivePrice(html, { priceCents: 12500, currency: "USD", compareAtCents: null });
 assert.match(out, /\$125\.00 USD/, "the price a shopper is charged must be the price shown");
 assert.ok(!out.includes("$200.00"), "the crawl-day price is gone");
 assert.ok(!out.includes("$498.00"), "a markdown we cannot vouch for is gone");
});

test("a live markdown on such a theme is kept, and restated from the feed", () => {
 const html = `<price-list class="price-list"><sale-price class="text-on-sale"> <span class="sr-only">Sale price</span>$200.00</sale-price>` +
  `<compare-at-price class="line-through"> <span class="sr-only">Regular price</span>$498.00</compare-at-price></price-list>`;
 const out = applyLivePrice(html, { priceCents: 12500, currency: "USD", compareAtCents: 49800 });
 assert.match(out, /\$125\.00/, "the live price is shown");
});
