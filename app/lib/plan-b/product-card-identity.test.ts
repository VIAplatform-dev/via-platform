import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { stampProductCards } from "./product-card-identity.ts";

const ITEMS: Record<string, { id: string; title: string }> = {
 "jumbo-black-with-poly-ribbon": { id: "item-1", title: "Jumbo Black Bag" },
 "silk-slip-dress": { id: "item-2", title: "Silk Slip Dress" },
};
const resolve = (h: string) => ITEMS[h] ?? null;

const card = (h: string, price = "$96.00") =>
 `<li class="card"><a href="/products/${h}?variant=42581570748512"><img src="p.jpg"></a><a class="t" href="/products/${h}">Name</a><span class="price">${price}</span></li>`;
const page = (b: string) => `<html><body><ul class="grid">${b}</ul></body></html>`;

test("a captured card is stamped with its inventory piece", () => {
 const $ = cheerio.load(stampProductCards(page(card("silk-slip-dress")), resolve));
 assert.equal($("li.card").attr("data-vya-item"), "item-2");
 assert.equal($("li.card").attr("data-vya-item-title"), "Silk Slip Dress");
});

test("the price sits inside the stamped card, which is how the editor finds it", () => {
 const $ = cheerio.load(stampProductCards(page(card("silk-slip-dress")), resolve));
 assert.equal($(".price").closest("[data-vya-item]").attr("data-vya-item"), "item-2");
});

test("a card whose photo and caption are separate links is stamped once", () => {
 const $ = cheerio.load(stampProductCards(page(card("silk-slip-dress")), resolve));
 assert.equal($("[data-vya-item]").length, 1);
});

test("the variant query doesn't hide the handle", () => {
 const $ = cheerio.load(stampProductCards(page(card("jumbo-black-with-poly-ribbon")), resolve));
 assert.equal($("[data-vya-item]").attr("data-vya-item"), "item-1");
});

test("an escaped handle still resolves", () => {
 const html = page(`<li class="card"><a href="/products/silk%2Dslip%2Ddress"><img src="p.jpg"></a><span>x</span></li>`);
 assert.equal(cheerio.load(stampProductCards(html, resolve))("[data-vya-item]").attr("data-vya-item"), "item-2");
});

test("each card in a grid gets its own piece", () => {
 const $ = cheerio.load(stampProductCards(page(card("silk-slip-dress") + card("jumbo-black-with-poly-ribbon")), resolve));
 assert.deepEqual($("[data-vya-item]").map((_i, e) => $(e).attr("data-vya-item")).get(), ["item-2", "item-1"]);
});

test("a product she doesn't hold is left exactly as it was", () => {
 const src = page(card("some-sold-thing"));
 assert.equal(stampProductCards(src, resolve), src);
});

test("the card is the wrapper holding the picture, not the whole grid", () => {
 const $ = cheerio.load(stampProductCards(page(card("silk-slip-dress") + card("jumbo-black-with-poly-ribbon")), resolve));
 assert.equal($("ul.grid").attr("data-vya-item"), undefined);
});

test("a bare text link with no card around it still resolves to the piece", () => {
 // A "shop the dress" link in a paragraph: there is no picture, so the link itself is the anchor.
 const html = `<html><body><p>See the <a href="/products/silk-slip-dress">dress</a>.</p></body></html>`;
 const $ = cheerio.load(stampProductCards(html, resolve));
 assert.equal($("[data-vya-item]").length, 1);
 assert.equal($("[data-vya-item]").attr("data-vya-item"), "item-2");
});

test("a page with no product links is returned untouched", () => {
 const src = `<html><body><p>About us</p></body></html>`;
 assert.equal(stampProductCards(src, resolve), src);
});
