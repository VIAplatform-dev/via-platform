import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { deriveCartTemplate, type KnownItem } from "./derive-cart-template.ts";
import { renderCartRows } from "./render-cart.ts";

const A: KnownItem = { title: "Monogram Pochette", priceText: "$699.00", imageUrl: "https://cdn/109.jpg", href: "/products/pochette" };
const B: KnownItem = { title: "Coach Carryall", priceText: "$249.00", imageUrl: "https://cdn/222.jpg", href: "/products/coach" };

const DAWN_TWO = `<html><body><table class="cart-items"><tbody>
 <tr class="cart-item">
  <td class="cart-item__media"><a href="/products/pochette"><img src="https://cdn/109.jpg" alt="Monogram Pochette"></a></td>
  <td class="cart-item__details"><a href="/products/pochette" class="cart-item__name">Monogram Pochette</a><div class="product-option">Colour: Tan</div></td>
  <td class="cart-item__quantity"><quantity-input><button name="minus">-</button><input value="1"><button name="plus">+</button></quantity-input></td>
  <td class="cart-item__totals"><span class="price">$699.00</span></td>
 </tr>
 <tr class="cart-item">
  <td class="cart-item__media"><a href="/products/coach"><img src="https://cdn/222.jpg" alt="Coach Carryall"></a></td>
  <td class="cart-item__details"><a href="/products/coach" class="cart-item__name">Coach Carryall</a></td>
  <td class="cart-item__quantity"><quantity-input><input value="1"></quantity-input></td>
  <td class="cart-item__totals"><span class="price">$249.00</span></td>
 </tr>
</tbody></table></body></html>`;

const HORIZON_TWO = `<html><body><table class="cart-items__table">
 <thead><tr class="cart-items__table-row"><th scope="col">Product image</th><th scope="col">Product information</th></tr></thead>
 <tbody>
  <tr class="cart-items__table-row">
   <td><img src="https://cdn/109.jpg" alt="Monogram Pochette"></td>
   <td><a href="/products/pochette" class="cart-items__name">Monogram Pochette</a></td>
   <td><span class="cart-items__price">$699.00</span></td>
  </tr>
  <tr class="cart-items__table-row">
   <td><img src="https://cdn/222.jpg" alt="Coach Carryall"></td>
   <td><a href="/products/coach" class="cart-items__name">Coach Carryall</a></td>
   <td><span class="cart-items__price">$249.00</span></td>
  </tr>
 </tbody></table></body></html>`;

const LINES = [
 { id: "aaa", title: "Rick Owens Jacket", priceCents: 149900, currency: "USD", image: "https://cdn/rick.jpg", href: "/products/rick" },
 { id: "bbb", title: "Chanel Flap Bag", priceCents: 550000, currency: "USD", image: null, href: "/products/chanel" },
];

const dawn = () => deriveCartTemplate({ twoItemHtml: DAWN_TWO, items: [A, B] })!;
const horizon = () => deriveCartTemplate({ twoItemHtml: HORIZON_TWO, items: [A, B] })!;

test("renders one row per line", () => {
 const $ = cheerio.load(`<table><tbody>${renderCartRows(dawn(), LINES)}</tbody></table>`);
 assert.equal($("tr.cart-item").length, 2);
});

test("puts each line's own title, price and image in", () => {
 const $ = cheerio.load(`<table><tbody>${renderCartRows(dawn(), LINES)}</tbody></table>`);
 const text = $.root().text();
 assert.match(text, /Rick Owens Jacket/);
 assert.match(text, /Chanel Flap Bag/);
 assert.match(text, /\$1,499\.00/);
 assert.match(text, /\$5,500\.00/);
 assert.equal($("img").first().attr("src"), "https://cdn/rick.jpg");
});

test("none of the template's own product survives", () => {
 const out = renderCartRows(dawn(), LINES);
 assert.ok(!out.includes("Monogram Pochette"));
 assert.ok(!out.includes("Coach Carryall"));
 assert.ok(!out.includes("https://cdn/109.jpg"));
});

// The same renderer, a completely different theme — no branch, no second code path.
test("works identically on a theme with different names for everything", () => {
 const $ = cheerio.load(`<table><tbody>${renderCartRows(horizon(), LINES)}</tbody></table>`);
 assert.equal($("tr").length, 2);
 assert.match($.root().text(), /Rick Owens Jacket/);
 assert.match($.root().text(), /Chanel Flap Bag/);
 assert.ok(!$.root().text().includes("Product image"), "a header cell is not a product line");
});

test("keeps the theme's own structure so its CSS still applies", () => {
 const $ = cheerio.load(`<table><tbody>${renderCartRows(dawn(), LINES)}</tbody></table>`);
 assert.equal($(".cart-item__media").length, 2);
 assert.equal($(".cart-item__name").length, 2);
});

test("links each row at its own product", () => {
 const $ = cheerio.load(`<table><tbody>${renderCartRows(dawn(), LINES)}</tbody></table>`);
 assert.equal($("tr").first().find("a").first().attr("href"), "/products/rick");
});

test("drops the image when a line has none, rather than showing the template's", () => {
 const $ = cheerio.load(`<table><tbody>${renderCartRows(dawn(), LINES)}</tbody></table>`);
 assert.equal($("tr").eq(1).find("img").length, 0);
});

// One-of-one stock: a quantity stepper offers a second copy of something unique.
test("neutralises quantity steppers", () => {
 const $ = cheerio.load(`<table><tbody>${renderCartRows(dawn(), LINES)}</tbody></table>`);
 assert.equal($("[name='plus'], [name='minus']").length, 0);
 assert.equal($("quantity-input input").first().attr("readonly"), "readonly");
});

test("drops variant options that described the template's product", () => {
 const out = renderCartRows(dawn(), LINES);
 assert.ok(!out.includes("Colour: Tan"));
});

test("gives each row a remove control pointing at its own line", () => {
 const $ = cheerio.load(`<table><tbody>${renderCartRows(dawn(), LINES)}</tbody></table>`);
 const ids = $("[data-vya-cart-remove]").map((_i, el) => $(el).attr("data-vya-cart-remove")).get();
 assert.deepEqual(ids, ["aaa", "bbb"]);
});

test("a title containing markup stays inert", () => {
 const evil = [{ ...LINES[0], title: `<img src=x onerror="alert(1)">` }];
 const $ = cheerio.load(`<table><tbody>${renderCartRows(dawn(), evil)}</tbody></table>`);
 assert.equal($("img[onerror]").length, 0, "no handler may survive from a title");
 assert.equal($(".cart-item__name").text().trim(), `<img src=x onerror="alert(1)">`);
});

test("no lines renders nothing", () => {
 assert.equal(renderCartRows(dawn(), []), "");
});

test("prices in each line's own currency", () => {
 const gbp = [{ ...LINES[0], currency: "GBP" }];
 const $ = cheerio.load(`<table><tbody>${renderCartRows(dawn(), gbp)}</tbody></table>`);
 assert.match($.root().text(), /£1,499\.00/);
});

// Caught on a real Horizon store: the row rendered "£600.00 … £155.00" — the derived price slot was
// filled, but the theme's SECOND money element (unit price vs line total) kept the template's own
// price. One-of-one stock means both are always the same number, so every money string in the row
// belongs to this line.
const TWO_PRICE = `<html><body><table><tbody>
 <tr class="row"><td><img src="https://cdn/109.jpg"></td>
  <td><a href="/products/pochette" class="nm">Monogram Pochette</a></td>
  <td><span class="unit">$699.00</span></td><td><span class="total">$699.00</span></td></tr>
 <tr class="row"><td><img src="https://cdn/222.jpg"></td>
  <td><a href="/products/coach" class="nm">Coach Carryall</a></td>
  <td><span class="unit">$249.00</span></td><td><span class="total">$249.00</span></td></tr>
</tbody></table></body></html>`;

test("no money from the template survives anywhere in the row", () => {
 const t = deriveCartTemplate({ twoItemHtml: TWO_PRICE, items: [A, B] })!;
 const out = renderCartRows(t, [LINES[0]]);
 assert.ok(!out.includes("699.00"), "the template's price must not appear beside the real one");
 assert.ok(!out.includes("249.00"));
 const $ = cheerio.load(`<table><tbody>${out}</tbody></table>`);
 assert.equal($(".unit").text().trim(), "$1,499.00");
 assert.equal($(".total").text().trim(), "$1,499.00");
});

test("drops per-product fields rather than showing the template's", () => {
 const withVendor = `<html><body><table><tbody>
  <tr class="r"><td><img src="https://cdn/109.jpg"></td>
   <td><p class="vendor">Prada</p><a href="/products/pochette" class="nm">Monogram Pochette</a></td>
   <td><span class="p">$699.00</span></td></tr>
  <tr class="r"><td><img src="https://cdn/222.jpg"></td>
   <td><p class="vendor">Coach</p><a href="/products/coach" class="nm">Coach Carryall</a></td>
   <td><span class="p">$249.00</span></td></tr>
 </tbody></table></body></html>`;
 const t = deriveCartTemplate({ twoItemHtml: withVendor, items: [A, B] })!;
 const out = renderCartRows(t, [LINES[0]]);
 assert.ok(!out.includes("Prada"), "the template product's brand must not appear on every line");
 assert.ok(!out.includes("Coach"));
 assert.match(out, /Rick Owens Jacket/);
});

// The theme's own remove control is often an icon button with no text — Horizon uses a trash glyph.
// Unrecognised, we appended our OWN "Remove" button beside it, so every line had two.
test("uses the theme's own remove control instead of adding a second one", () => {
 const withTrash = `<html><body><table><tbody>
  <tr class="r"><td><img src="https://cdn/109.jpg"></td>
   <td><a href="/products/pochette" class="nm">Monogram Pochette</a></td>
   <td><button type="button" class="quantity__remove" aria-label="Remove item"><svg></svg></button></td>
   <td><span class="p">$699.00</span></td></tr>
  <tr class="r"><td><img src="https://cdn/222.jpg"></td>
   <td><a href="/products/coach" class="nm">Coach Carryall</a></td>
   <td><button type="button" class="quantity__remove" aria-label="Remove item"><svg></svg></button></td>
   <td><span class="p">$249.00</span></td></tr>
 </tbody></table></body></html>`;
 const t = deriveCartTemplate({ twoItemHtml: withTrash, items: [A, B] })!;
 const $ = cheerio.load(`<table><tbody>${renderCartRows(t, [LINES[0]])}</tbody></table>`);
 assert.equal($("[data-vya-cart-remove]").length, 1, "exactly one remove control per line");
 assert.equal($("[data-vya-cart-remove]").attr("class"), "quantity__remove", "…and it is the theme's own");
 assert.ok(!$.root().text().includes("Remove"), "no second, text-labelled button of ours");
});
