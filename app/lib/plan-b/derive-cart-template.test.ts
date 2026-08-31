import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveCartTemplate, type KnownItem } from "./derive-cart-template.ts";

const A: KnownItem = { title: "Monogram Pochette", priceText: "$699.00", imageUrl: "https://cdn/109.jpg", href: "/products/pochette" };
const B: KnownItem = { title: "Coach Carryall", priceText: "$249.00", imageUrl: "https://cdn/222.jpg", href: "/products/coach" };

/** Dawn's cart, two items in it. Structure taken from loved-again's live markup. */
const DAWN_TWO = `<html><body><div id="main-cart-items"><div class="js-contents"><table class="cart-items"><tbody>
 <tr class="cart-item">
  <td class="cart-item__media"><a href="/products/pochette"><img src="https://cdn/109.jpg" alt="Monogram Pochette"></a></td>
  <td class="cart-item__details"><a href="/products/pochette" class="cart-item__name">Monogram Pochette</a></td>
  <td class="cart-item__totals"><span class="price">$699.00</span></td>
 </tr>
 <tr class="cart-item">
  <td class="cart-item__media"><a href="/products/coach"><img src="https://cdn/222.jpg" alt="Coach Carryall"></a></td>
  <td class="cart-item__details"><a href="/products/coach" class="cart-item__name">Coach Carryall</a></td>
  <td class="cart-item__totals"><span class="price">$249.00</span></td>
 </tr>
</tbody></table></div></div>
<div class="totals"><p class="totals__total-value">$948.00</p></div></body></html>`;

/** Horizon's cart. Different element names for everything, and a table HEADER that also matches
 *  any class-based row selector — the trap that broke lamash. */
const HORIZON_TWO = `<html><body><div class="cart-items__wrapper"><table class="cart-items__table">
 <thead><tr role="row" class="cart-items__table-row"><th scope="col">Product image</th><th scope="col">Product information</th></tr></thead>
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
 </tbody></table></div>
<div class="cart__summary"><span class="cart__total">$948.00</span></div></body></html>`;

const derive = (twoItemHtml: string, emptyHtml?: string) => deriveCartTemplate({ twoItemHtml, emptyHtml, items: [A, B] });

// ── It works on a theme we designed for… ─────────────────────────────────────────────────────────
test("finds Dawn's row without being told any of Dawn's class names", () => {
 const t = derive(DAWN_TWO);
 assert.ok(t, "should derive a template");
 assert.match(t!.rowHtml, /cart-item__media/, "the row is the theme's own markup");
 assert.ok(t!.rowHtml.includes("Monogram Pochette"), "the first known item's row");
 assert.ok(!t!.rowHtml.includes("Coach Carryall"), "a row holds ONE line, not the whole table");
});

// ── …and on one we did not. This is the whole point. ─────────────────────────────────────────────
test("finds Horizon's row too, with entirely different names", () => {
 const t = derive(HORIZON_TWO);
 assert.ok(t, "should derive a template");
 assert.match(t!.rowHtml, /cart-items__name/);
 assert.ok(t!.rowHtml.includes("Monogram Pochette"));
 assert.ok(!t!.rowHtml.includes("Coach Carryall"));
});

test("never mistakes a table header for a row", () => {
 const t = derive(HORIZON_TWO);
 assert.ok(!t!.rowHtml.includes("Product image"), "the header's column labels are not a product");
 assert.ok(!/<th[\s>]/.test(t!.rowHtml));
});

// ── Slots, located by matching values we already know ────────────────────────────────────────────
test("locates the title, price, image and link slots on Dawn", () => {
 const t = derive(DAWN_TWO)!;
 assert.ok(t.slots.title, "title slot");
 assert.ok(t.slots.price, "price slot");
 assert.ok(t.slots.image, "image slot");
 assert.ok(t.slots.href, "href slot");
 assert.equal(t.slots.image!.kind, "attr");
 assert.equal(t.slots.image!.attr, "src");
});

test("locates the same slots on Horizon", () => {
 const t = derive(HORIZON_TWO)!;
 assert.ok(t.slots.title && t.slots.price && t.slots.image && t.slots.href);
});

test("a slot is a position in the row, never a class name", () => {
 const t = derive(DAWN_TWO)!;
 assert.ok(Array.isArray(t.slots.title!.path), "paths survive class names we do not understand");
 assert.ok(t.slots.title!.path.every((n) => Number.isInteger(n) && n >= 0));
});

// ── The container the rows live in ───────────────────────────────────────────────────────────────
test("records where rows go", () => {
 assert.ok(Array.isArray(derive(DAWN_TWO)!.itemsPath));
 assert.ok(Array.isArray(derive(HORIZON_TWO)!.itemsPath));
});

// ── Totals, found by matching the sum rather than a class ────────────────────────────────────────
test("finds the subtotal by matching A + B", () => {
 const t = derive(DAWN_TWO)!;
 assert.ok(t.subtotalPaths.length > 0, "$948.00 is neither item's price, so it can only be the total");
});

// ── The empty state, found by diffing ────────────────────────────────────────────────────────────
test("finds the empty state by comparing against an empty cart", () => {
 const empty = `<html><body><div id="main-cart-items"><div class="js-contents"></div></div>
  <div class="cart__empty-text">Your cart is empty</div></body></html>`;
 const t = derive(DAWN_TWO, empty)!;
 assert.ok(t.emptyMarkers.length > 0, "text present only in the empty capture identifies the empty state");
});

// ── Confidence, and refusing to guess ────────────────────────────────────────────────────────────
test("scores its own confidence", () => {
 const t = derive(DAWN_TWO)!;
 assert.ok(t.confidence > 0.6, `a complete derivation should be confident, got ${t.confidence}`);
 assert.ok(t.confidence <= 1);
});

// A miss must be a null, not a bad template — a bad template is what renders a header row as a
// product. The caller falls back to VYA's own cart markup, which is a working page.
test("returns null rather than a guess when the items are not on the page", () => {
 assert.equal(deriveCartTemplate({ twoItemHtml: "<html><body><p>nothing here</p></body></html>", items: [A, B] }), null);
});

test("returns null when only one of the two known items is present", () => {
 const one = `<html><body><table><tbody><tr class="cart-item"><td><img src="https://cdn/109.jpg"></td>
  <td><a href="/products/pochette">Monogram Pochette</a></td><td>$699.00</td></tr></tbody></table></body></html>`;
 assert.equal(deriveCartTemplate({ twoItemHtml: one, items: [A, B] }), null, "one row cannot tell us what repeats");
});

test("survives junk input instead of throwing", () => {
 for (const junk of ["", "<html>", "not html"]) {
  assert.equal(deriveCartTemplate({ twoItemHtml: junk, items: [A, B] }), null);
 }
});

// ── The output has to be usable ──────────────────────────────────────────────────────────────────
test("the derived row is standalone markup that can be cloned per line", () => {
 const t = derive(DAWN_TWO)!;
 assert.match(t.rowHtml.trim(), /^<tr/, "a row, not a fragment of one");
 assert.equal(t.version, 1, "versioned, so a stored template can be invalidated when the shape changes");
});

// ── Fields that describe the template's product and nothing else ─────────────────────────────────
// Found on a real Dawn store: the row carried the VENDOR ("Prada") beside the title, so every cart
// line rendered "PradaMonogram Pochette". We have no vendor to substitute, so the honest thing is to
// find such fields generically — any leaf whose text DIFFERS between the two known rows and is not
// already a slot — and drop them, rather than show the wrong brand on every line.
const WITH_VENDOR = `<html><body><table><tbody>
 <tr class="cart-item"><td><img src="https://cdn/109.jpg"></td>
  <td class="d"><p class="vendor">Prada</p><a href="/products/pochette" class="nm">Monogram Pochette</a><span class="sku">SKU-111</span></td>
  <td><span class="p">$699.00</span></td></tr>
 <tr class="cart-item"><td><img src="https://cdn/222.jpg"></td>
  <td class="d"><p class="vendor">Coach</p><a href="/products/coach" class="nm">Coach Carryall</a><span class="sku">SKU-222</span></td>
  <td><span class="p">$249.00</span></td></tr>
</tbody></table></body></html>`;

test("marks per-product fields we cannot restate", () => {
 const t = derive(WITH_VENDOR)!;
 assert.ok(t.stalePaths.length > 0, "the vendor and SKU differ between the two rows, so they describe one product");
});

test("does not mark the title or the price as stale — those have slots", () => {
 const t = derive(WITH_VENDOR)!;
 const key = (p: number[]) => p.join(".");
 const stale = new Set(t.stalePaths.map(key));
 assert.ok(!stale.has(key(t.slots.title!.path)), "the title is filled, not dropped");
 if (t.slots.price) assert.ok(!stale.has(key(t.slots.price.path)), "the price is filled, not dropped");
});
