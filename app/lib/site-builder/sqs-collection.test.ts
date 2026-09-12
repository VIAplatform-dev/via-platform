import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { injectCollectionItems, type CollectionCardItem } from "../site-capture.ts";
import { collectionHandleForPath, looksSquarespace } from "./collection-path.ts";
import { SQS_SHOP } from "./fixtures.ts";

// F5: Squarespace shop pages now go live through the same fill as Shopify collection pages. Their card
// puts the name and the price inside ONE price-classed wrapper (.product-list-title-price), and the fill
// used to write the price over that wrapper — so turning /shop live would have wiped every name.

const live = (i: number, extra: Partial<CollectionCardItem> = {}): CollectionCardItem => ({ id: `it${i}`, title: `Live Piece Number ${i}`, priceCents: 10000 * i + 55, currency: "USD", images: [`https://blob/p${i}.jpg`], sourceId: `h${i}`, available: true, ...extra });

test("a Squarespace /shop page is recognised as the whole shop", () => {
 assert.equal(looksSquarespace(SQS_SHOP), true);
 assert.equal(collectionHandleForPath("/shop", { squarespace: looksSquarespace(SQS_SHOP) }), "all");
});

test("the live fill keeps each card's name AND price on a Squarespace shop page", () => {
 const out = injectCollectionItems(SQS_SHOP, [live(1), live(2), live(3, { available: false })], (it) => `/products/${it.sourceId}`, { path: "/shop" });
 const $ = cheerio.load(out);
 const cards = $(".product-list-item[data-vya-item]");
 assert.equal(cards.length, 3);
 cards.each((i, el) => {
  assert.equal($(el).find(".product-list-item-title").text().trim(), `Live Piece Number ${i + 1}`);
  assert.match($(el).find(".product-list-item-price").text(), new RegExp(`\\$${(i + 1) * 100}\\.55`));
 });
 assert.doesNotMatch($.root().text(), /Chanel 2000 Cruise Top|Dior Saddle Bag/, "no capture-day pieces left");
});

test("a Shopify card's price wrapper is still written as before (no name inside it)", () => {
 const card = `<li class="grid__item"><a href="/products/a"><img src="a.jpg"></a><h3 class="card__heading">Coat</h3><div class="price"><span class="price-item price-item--regular">$120.00</span></div></li>`;
 const page = `<html><body><ul class="product-grid">${card}${card.replace(/Coat/g, "Skirt")}${card.replace(/Coat/g, "Bag")}</ul></body></html>`;
 const $ = cheerio.load(injectCollectionItems(page, [live(1)], () => "/p"));
 assert.equal($(".card__heading").first().text(), "Live Piece Number 1");
 assert.match($(".price").first().text(), /\$100\.55/);
});
