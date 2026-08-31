import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { buildCartDrawerSection } from "./cart-drawer.ts";

const LINES = [
 { id: "11111111-1111-1111-1111-111111111111", title: "Monogram Pochette", priceCents: 69900, currency: "USD", image: "https://cdn/109.jpg", href: "/products/louis-vuitton-pochette" },
 { id: "22222222-2222-2222-2222-222222222222", title: "Coach Carryall", priceCents: 24900, currency: "USD", image: null, href: "/products/coach" },
];

/**
 * The drawer exactly as this theme really serves it — structure taken from the live capture
 * (#CartDrawer > .drawer__inner > cart-drawer-items.is-empty > #CartDrawer-Form > #CartDrawer-CartItems),
 * including the `onsubmit="return false"` the crawler stamps on every /cart form.
 */
const PAGE = `<html><body>
 <div id="CartDrawer" class="cart-drawer">
  <div id="CartDrawer-Overlay" class="cart-drawer__overlay"></div>
  <div class="drawer__inner gradient">
   <div class="drawer__inner-empty"><div class="cart-drawer__empty-content">Your cart is empty</div></div>
   <div class="drawer__header"><h2 class="drawer__heading">Your cart</h2></div>
   <cart-drawer-items class="is-empty">
    <form id="CartDrawer-Form" class="cart__contents cart-drawer__form" action="/cart" method="post" onsubmit="return false">
     <div id="CartDrawer-CartItems" class="drawer__contents js-contents">
      <p id="CartDrawer-LiveRegionText" class="visually-hidden"></p>
      <p id="CartDrawer-LineItemStatus" class="visually-hidden"></p>
     </div>
     <div id="CartDrawer-CartErrors"></div>
    </form>
   </cart-drawer-items>
   <div class="drawer__footer">
    <div class="totals"><h2 class="totals__total">Estimated total</h2><p class="totals__total-value">$0.00</p></div>
    <div class="cart__ctas"><button id="CartDrawer-Checkout" class="cart__checkout-button button" type="submit" name="checkout" form="CartDrawer-Form" disabled>Check out</button></div>
   </div>
  </div>
 </div>
</body></html>`;

/** The captured /cart page, whose real <tr class="cart-item"> is what we clone per line. */
const CART_PAGE = `<html><body><table class="cart-items"><tbody>
 <tr class="cart-item">
  <td class="cart-item__media"><a href="/products/old"><img src="https://cdn/old.jpg" alt="Old"></a></td>
  <td class="cart-item__details"><a href="/products/old" class="cart-item__name">Old Product</a><div class="product-option">Colour: Black</div></td>
  <td class="cart-item__quantity"><quantity-input><button name="minus">-</button><input value="1"><button name="plus">+</button></quantity-input>
   <cart-remove-button id="Remove-1" data-index="1"><a href="/cart/change?line=1&quantity=0">Remove</a></cart-remove-button></td>
  <td class="cart-item__totals"><span class="price">$100.00</span></td>
 </tr>
</tbody></table></body></html>`;

const build = (lines = LINES, page = PAGE) => buildCartDrawerSection({ pageHtml: page, rowTemplateHtml: CART_PAGE, lines, checkoutHref: "/checkout?cart=1" });

test("returns null when the page has no cart drawer", () => {
 assert.equal(buildCartDrawerSection({ pageHtml: "<html><body><p>no drawer</p></body></html>", lines: LINES, checkoutHref: "/checkout?cart=1" }), null);
});

// The theme does querySelector('#CartDrawer').innerHTML on what we return, so the element itself
// has to be in the response or the whole update throws.
test("returns markup the theme's own selector can find", () => {
 const $ = cheerio.load(build()!);
 assert.equal($("#CartDrawer").length, 1);
});

test("renders one row per cart line, with title and price", () => {
 const $ = cheerio.load(build()!);
 const rows = $("#CartDrawer-CartItems .cart-item");
 assert.equal(rows.length, 2);
 const text = $("#CartDrawer-CartItems").text();
 assert.match(text, /Monogram Pochette/);
 assert.match(text, /Coach Carryall/);
 assert.match(text, /\$699\.00/);
 assert.match(text, /\$249\.00/);
});

test("clones the theme's own row markup rather than inventing its own", () => {
 const $ = cheerio.load(build()!);
 const $row = $("#CartDrawer-CartItems .cart-item").first();
 // The theme's structural classes must survive, or the drawer's CSS has nothing to style.
 assert.equal($row.find(".cart-item__media").length, 1);
 assert.equal($row.find(".cart-item__name").length, 1);
 assert.ok(!$row.text().includes("Old Product"), "the template's own product must be replaced");
});

test("carries each line's image and product link", () => {
 const $ = cheerio.load(build()!);
 const $row = $("#CartDrawer-CartItems .cart-item").first();
 assert.equal($row.find("img").attr("src"), "https://cdn/109.jpg");
 assert.equal($row.find("a").first().attr("href"), "/products/louis-vuitton-pochette");
});

test("drops the empty state so the drawer shows the items", () => {
 const $ = cheerio.load(build()!);
 assert.equal($(".is-empty").length, 0, "is-empty keeps the drawer visually collapsed");
 assert.equal($(".drawer__inner-empty").length, 0, "the empty-cart block must not sit above a full cart");
});

// This is what actually made Checkout do nothing on a store origin: the crawler stamps
// onsubmit="return false" on every /cart form, and Plan B keeps scripts, so the guard survives and
// blocks the theme's own native submit.
test("removes the capture-time onsubmit guard so the native submit runs", () => {
 const $ = cheerio.load(build()!);
 const $form = $("#CartDrawer-Form");
 assert.equal($form.attr("onsubmit"), undefined);
 assert.equal($form.attr("action"), "/cart");
 assert.equal(($form.attr("method") || "").toLowerCase(), "post");
});

test("keeps the theme's own checkout button, and enables it", () => {
 const $ = cheerio.load(build()!);
 const $btn = $("#CartDrawer-Checkout");
 assert.equal($btn.length, 1);
 assert.equal($btn.attr("name"), "checkout", "the submit name is what tells POST /cart this is a checkout");
 assert.equal($btn.attr("disabled"), undefined, "an empty-cart drawer ships it disabled");
 assert.match($btn.attr("class") || "", /cart__checkout-button/, "the theme's styling must survive");
});

test("totals the lines in the theme's own element", () => {
 const $ = cheerio.load(build()!);
 assert.match($(".totals__total-value").text(), /\$948\.00/); // 69900 + 24900
});

test("a one-of-one piece can never be ordered twice", () => {
 const $ = cheerio.load(build()!);
 const $row = $("#CartDrawer-CartItems .cart-item").first();
 assert.equal($row.find('[name="plus"]').length, 0, "the stepper would offer a second copy of a unique piece");
 assert.equal($row.find('[name="minus"]').length, 0);
});

test("points each row's remove control at its own line", () => {
 const $ = cheerio.load(build()!);
 const idx = $("#CartDrawer-CartItems [data-index]").map((_i, el) => $(el).attr("data-index")).get();
 assert.deepEqual(idx, ["1", "2"], "cloned rows all inherit the template's index otherwise");
});

test("drops variant options that described the template's product", () => {
 const $ = cheerio.load(build()!);
 assert.ok(!$("#CartDrawer-CartItems").text().includes("Colour: Black"));
});

test("an empty cart keeps the empty state and disables checkout", () => {
 const $ = cheerio.load(build([])!);
 assert.equal($("#CartDrawer-CartItems .cart-item").length, 0);
 assert.equal($(".drawer__inner-empty").length, 1, "the empty-cart message belongs on an empty cart");
 assert.ok($("#CartDrawer-Checkout").attr("disabled") !== undefined, "nothing to check out");
});

test("still renders without a row template to clone", () => {
 const out = buildCartDrawerSection({ pageHtml: PAGE, lines: LINES, checkoutHref: "/checkout?cart=1" });
 const $ = cheerio.load(out!);
 assert.equal($("#CartDrawer-CartItems .cart-item").length, 2);
 assert.match($("#CartDrawer-CartItems").text(), /Monogram Pochette/);
});

test("a title containing markup stays inert", () => {
 const evil = [{ ...LINES[0], title: `<img src=x onerror="alert(1)">` }];
 const $ = cheerio.load(build(evil)!);
 const imgs = $("#CartDrawer-CartItems img").toArray();
 assert.ok(imgs.every((i) => !$(i).attr("onerror")), "no handler may survive from a title");
 assert.equal($("#CartDrawer-CartItems .cart-item__name").text().trim(), `<img src=x onerror="alert(1)">`);
});

// ── Picking the row template ──────────────────────────────────────────────────────────────────────
// The bug: Horizon themes call their rows `cart-items__table-row`, which CONTAINS "cart-item" — and
// so does their table HEADER row. The old selector took the first match, cloned the header, and
// rendered "Product image / Product information" as if it were a product.
const HORIZON_CART = `<html><body><table class="cart-items__table">
 <thead><tr role="row" class="cart-items__table-row">
  <th id="productImage" scope="col">Product image</th>
  <th id="productInformation" scope="col">Product information</th>
 </tr></thead>
 <tbody><tr class="cart-items__table-row">
  <td><img src="https://cdn/real.jpg" alt="Real Product"></td>
  <td><a href="/products/real" class="cart-items__name">Real Product</a></td>
  <td><span>£155.00</span></td>
 </tr></tbody>
</table></body></html>`;

test("never clones a table header row as if it were a product", () => {
 const out = buildCartDrawerSection({ pageHtml: PAGE, rowTemplateHtml: HORIZON_CART, lines: LINES, checkoutHref: "/checkout?cart=1" })!;
 assert.ok(!out.includes("Product image"), "the header's column labels must not appear as a cart line");
 assert.ok(!out.includes("Product information"));
 assert.ok(!/<th[\s>]/.test(out), "a header cell has no place in a rendered cart line");
});

test("finds the real row in a theme whose classes we do not recognise", () => {
 const out = buildCartDrawerSection({ pageHtml: PAGE, rowTemplateHtml: HORIZON_CART, lines: LINES, checkoutHref: "/checkout?cart=1" })!;
 const $ = cheerio.load(out);
 // Two lines in, two rows out — cloned from the theme's own <tbody> row.
 assert.equal($("tbody tr, tr").length >= 2, true);
 assert.match($.root().text(), /Monogram Pochette/);
 assert.match($.root().text(), /Coach Carryall/);
 assert.ok(!$.root().text().includes("Real Product"), "the template's own product must be replaced");
});

// ── The derived template wins ─────────────────────────────────────────────────────────────────────
// Once a store's layout has been worked out at import time, the drawer must use it rather than
// re-guessing from class names. This is what makes one renderer serve every theme.
test("prefers a derived template over guessing at the markup", async () => {
 const { deriveCartTemplate } = await import("./derive-cart-template.ts");
 const twoItemHtml = `<html><body><table><tbody>
  <tr class="weird-row-name"><td><img src="https://cdn/a.jpg"></td>
   <td><a href="/products/a" class="weird-name">Known A</a></td><td><span>$10.00</span></td></tr>
  <tr class="weird-row-name"><td><img src="https://cdn/b.jpg"></td>
   <td><a href="/products/b" class="weird-name">Known B</a></td><td><span>$20.00</span></td></tr>
 </tbody></table></body></html>`;
 const template = deriveCartTemplate({
  twoItemHtml,
  items: [
   { title: "Known A", priceText: "10.00", imageUrl: "https://cdn/a.jpg", href: "/products/a" },
   { title: "Known B", priceText: "20.00", imageUrl: "https://cdn/b.jpg", href: "/products/b" },
  ],
 });
 assert.ok(template, "the fixture uses class names nothing in our code knows — derivation must still work");

 const out = buildCartDrawerSection({ pageHtml: PAGE, rowTemplateHtml: CART_PAGE, template, lines: LINES, checkoutHref: "/checkout?cart=1" })!;
 const $ = cheerio.load(out);
 // Rendered from the DERIVED row (weird-row-name), not the Dawn row in CART_PAGE.
 assert.equal($(".weird-row-name").length, 2, "the derived row is what gets cloned");
 assert.equal($(".cart-item").length, 0, "the guessed row must not be used when a template exists");
 assert.match($("#CartDrawer-CartItems").text(), /Monogram Pochette/);
 assert.match($("#CartDrawer-CartItems").text(), /Coach Carryall/);
 assert.ok(!out.includes("Known A"), "the template's own product must not leak");
});

// ── The drawer on a NORMAL page load ──────────────────────────────────────────────────────────────
// Clicking the cart icon opens the drawer that is ALREADY in the page — no request is made. That
// drawer was captured with an empty cart, so a shopper with items in their bag clicked the icon and
// was told "Your cart is empty" while the badge beside it said 1.
test("injectCartDrawer fills the drawer that ships with the page", async () => {
 const { injectCartDrawer } = await import("./cart-drawer.ts");
 const out = injectCartDrawer(PAGE, { rowTemplateHtml: CART_PAGE, lines: LINES, checkoutHref: "/checkout?cart=1" });
 const $ = cheerio.load(out);
 assert.equal($("#CartDrawer-CartItems .cart-item").length, 2, "the visitor's real bag");
 assert.equal($(".drawer__inner-empty").length, 0, "and no empty-cart message over it");
 assert.ok(out.includes("<html") || out.includes("<body"), "returns the whole page, not just the drawer");
});

// An EMPTY bag must clear the captured rows, not leave the crawler's product on the page. This is
// what showed a stranger's Prada heels beside the words "Your cart is empty".
test("an empty bag clears whatever the capture had in it", async () => {
 const { injectCartDrawer } = await import("./cart-drawer.ts");
 const stocked = PAGE.replace('<p id="CartDrawer-LineItemStatus" class="visually-hidden"></p>',
  '<p id="CartDrawer-LineItemStatus" class="visually-hidden"></p><table class="cart-items"><tbody><tr class="cart-item"><td>PRADA BOTANICAL PRINT SATIN HEELS</td><td>£155.00</td></tr></tbody></table>');
 const out = injectCartDrawer(stocked, { lines: [], checkoutHref: "/checkout?cart=1" });
 assert.ok(!out.includes("PRADA BOTANICAL"), "the crawler's cart must not survive into a shopper's empty one");
 assert.ok(!out.includes("£155.00"));
});
