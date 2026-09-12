import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyEditsWithReport, extractScopedEdits, applyScopedEditsToPage, prepareEditMode, stampEditIds } from "../site-capture.ts";
import { productEditView, PIECE_CLICK_JS, type EditPiece } from "./product-page-edit.ts";

// The editor's "Product page (all N)" opens ONE captured product page to change the design of every
// product page. It has to agree with the save about which element is "#N", let her change the words
// every product page shares, and refuse to hand her a text box for the piece's own name, price and
// description — those belong to Inventory, and whatever she typed there would lie.

const productPage = (o: { title: string; price: string; desc: string; img: string; titleTag?: string }) => `<html><head></head><body>
<header><a href="/">Shop</a><h1 class="logo">Sourced</h1></header>
<main>
<div class="shopify-section" id="product">
 <ol class="breadcrumbs"><li><a href="/collections/new">New Arrivals</a></li><li><span class="crumb">${o.title}</span></li></ol>
 <div class="product__media"><img src="${o.img}"></div>
 <div class="product__info">
  <p class="product__vendor">Sourced by Scottie</p>
  ${o.titleTag ?? `<h1 class="product__title">${o.title}</h1>`}
  <div class="price"><span class="price-item price-item--regular">${o.price}</span></div>
  <form action="/cart/add"><button type="submit" name="add" class="product-form__submit"><span>Add to cart</span></button></form>
  <p class="shipping-note">Free shipping over $100</p>
  <div class="product__description rte"><p>${o.desc}</p><p><strong>Era:</strong> 1990s</p></div>
  <h2 class="accordion__title">Size guide</h2>
 </div>
</div>
<div class="shopify-section" id="about"><h2>About the shop</h2><p>We source by hand.</p></div>
</main>
<footer><p>Thanks for shopping</p></footer>
</body></html>`;

const DRESS = productPage({ title: "Silk Slip Dress", price: "$120.00", desc: "Bias-cut silk slip in champagne, adjustable straps.", img: "dress.jpg" });
const COAT = productPage({ title: "Wool Coat", price: "$300.00", desc: "Double-breasted camel wool coat with horn buttons.", img: "coat.jpg" });
const piece: EditPiece = {
 id: "item-dress", title: "Silk Slip Dress", description: "<p>Bias-cut silk slip in champagne, adjustable straps.</p><p><strong>Era:</strong> 1990s</p>",
 priceCents: 9500, currency: "USD", compareAtCents: null,
};

const editor = (stored: string, p: EditPiece | null = piece) => prepareEditMode(productEditView(stored, p), "sourcedbyscottie", "/products/silk-slip-dress");
const leaf = ($: cheerio.CheerioAPI, text: string) => $("*").filter((_i, el) => $(el).children().length === 0 && $(el).text().trim() === text);
const eidOf = (html: string, text: string) => {
 const $ = cheerio.load(html);
 const hit = $("[data-vya-eid]").filter((_i, el) => $(el).text().trim() === text);
 return hit.length === 1 ? Number(hit.attr("data-vya-eid")) : NaN;
};
// What the editor sends: the number, the new words, and the words it replaces. The save would rescue a
// wrong number by finding those words elsewhere, which would hide a numbering fault — so these tests
// also insist the edit landed AT the number sent.
const saveText = (stored: string, view: string, from: string, to: string) => {
 const eid = eidOf(view, from);
 const r = applyEditsWithReport(stored, { edits: [{ eid, text: to, was: from }] });
 assert.equal(r.skipped, 0, `"${from}" found a place to land`);
 assert.equal(r.resolved.edits?.[0]?.eid, eid, `"${from}" is #${eid} in the editor AND in the save`);
 return r;
};

// ── the editor and the save count the same page ─────────────────────────────────────────────────

test("shared wording below the buy button saves onto the element she clicked", () => {
 // The view swaps the theme's Add-to-cart for VYA's (replacing a numbered span with new links) and
 // rewrites the price — neither may move the numbers of anything below them.
 const r = saveText(DRESS, editor(DRESS), "Free shipping over $100", "Free shipping on everything");
 const $ = cheerio.load(r.html);
 assert.equal($(".shipping-note").text(), "Free shipping on everything");
 assert.equal($(".product__title").text(), "Silk Slip Dress");
});

test("the numbers come from the STORED page, even when the view rewires it", () => {
 const view = editor(DRESS);
 for (const words of ["Sourced by Scottie", "Size guide", "About the shop", "New Arrivals", "Thanks for shopping"]) {
  assert.equal(leaf(cheerio.load(DRESS), words).length, 1, `fixture holds "${words}" once`);
  const r = saveText(DRESS, view, words, "X");
  assert.equal(leaf(cheerio.load(r.html), "X").length, 1, words);
 }
});

// ── the template travels, each piece stays itself ───────────────────────────────────────────────

test("an edit to the shared wording reaches another product page, and that piece keeps its own name", () => {
 const { resolved } = saveText(DRESS, editor(DRESS), "Size guide", "Fit & sizing");
 const tmpl = extractScopedEdits(DRESS, resolved, "body");
 const other = applyScopedEditsToPage(COAT, tmpl, "body");
 assert.equal(other.changed, true);
 const $ = cheerio.load(other.html);
 assert.equal($(".accordion__title").text(), "Fit & sizing");
 assert.equal($(".product__title").text(), "Wool Coat");
 assert.equal($(".price-item").text(), "$300.00");
});

// ── the piece's own fields are Inventory's ──────────────────────────────────────────────────────

test("the piece's name, price and description are not text boxes", () => {
 const $ = cheerio.load(editor(DRESS));
 for (const sel of [".product__title", ".price-item", ".crumb", ".product__description p", ".product__description strong"]) {
  assert.ok($(sel).length > 0, `${sel} is on the page`);
  assert.equal($(sel).filter("[data-vya-eid]").length + $(sel).find("[data-vya-eid]").length, 0, `${sel} carries no text number`);
 }
});

test("…and clicking them names the piece, so the panel can offer it in Inventory", () => {
 const $ = cheerio.load(editor(DRESS));
 for (const sel of [".product__title", ".price-item", ".crumb", ".product__description"]) {
  assert.equal($(sel).closest("[data-vya-item]").attr("data-vya-item"), "item-dress", sel);
  assert.equal($(sel).closest("[data-vya-item]").attr("data-vya-item-title"), "Silk Slip Dress", sel);
 }
 // Shared wording is NOT the piece's: clicking it must still edit it.
 for (const words of ["Sourced by Scottie", "Free shipping over $100", "Size guide"]) {
  assert.equal(leaf($, words).closest("[data-vya-item]").length, 0, words);
 }
});

test("a piece renamed in Inventory since the crawl still has no text box on its old name", () => {
 const $ = cheerio.load(editor(DRESS, { ...piece, title: "Silk Slip Dress – M", description: null }));
 assert.equal($(".product__title[data-vya-eid]").length, 0);
 assert.equal($(".product__description [data-vya-eid]").length, 0);
});

test("a theme that prints the name in a bare <h1> is covered too", () => {
 const bare = productPage({ title: "Silk Slip Dress", price: "$120.00", desc: "Bias-cut silk slip in champagne, adjustable straps.", img: "dress.jpg", titleTag: "<h1>Silk Slip Dress</h1>" });
 const $ = cheerio.load(editor(bare, { ...piece, title: "Silk Slip Dress – M" }));
 assert.equal($("main h1").attr("data-vya-eid"), undefined);
 assert.equal($("main h1").attr("data-vya-item"), "item-dress");
});

test("the header's own heading is not mistaken for the product's", () => {
 const $ = cheerio.load(editor(DRESS));
 assert.ok($("header h1.logo").attr("data-vya-eid"));
});

test("the price she sees is today's, not crawl day's", () => {
 const $ = cheerio.load(editor(DRESS));
 assert.equal($(".price-item").text(), "$95.00");
});

test("the view carries the buy control a shopper can use, never a baked-in sold state", () => {
 // A section she restructures is saved from the view's DOM. A "Sold" control saved into the stored
 // page could never be undone at serve time; an available one is corrected per request.
 const $ = cheerio.load(editor(DRESS));
 assert.equal($("[data-vya-add]").attr("data-vya-add"), "item-dress");
 assert.doesNotMatch($("main").text(), /\bsold\b/i);
});

test("the facts block a shopper reads is shown, and belongs to the piece", () => {
 const $ = cheerio.load(editor(DRESS, { ...piece, detailsHtml: `<section data-vya-details="1"><h3>Size</h3><p>M</p></section>` }));
 assert.equal($("[data-vya-details]").length, 1);
 assert.equal($("[data-vya-details]").attr("data-vya-item"), "item-dress");
 assert.equal($("[data-vya-details] [data-vya-eid]").length, 0);
});

test("a page no piece matches opens exactly as stored, everything editable", () => {
 assert.equal(productEditView(DRESS, null), stampEditIds(DRESS));
});

test("the piece-click bridge is on the page once and parses", () => {
 const html = editor(DRESS);
 assert.equal(html.split("data-vya-piece-click").length - 1, 1);
 assert.doesNotThrow(() => new Function(PIECE_CLICK_JS));
});
