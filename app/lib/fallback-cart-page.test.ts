import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { buildFallbackCartPage } from "./fallback-cart-page.ts";

const LINES = [
 { id: "a1", title: "Rick Owens Performa Jacket", priceCents: 149900, currency: "USD", image: "https://x/1.jpg", href: "/products/rick" },
 { id: "b2", title: "Chanel Flap Bag", priceCents: 550000, currency: "USD", image: null, href: "/products/chanel" },
];

/** A captured page in the shape the crawler stores: inlined <style>, a header, a main, a footer. */
const CHROME = `<!doctype html><html><head>
 <title>Loved Again</title>
 <style data-vya-src="https://x/theme.css">body{font-family:Didot;background:#f4efe9}</style>
</head><body>
 <header id="shopify-section-header"><a href="/">Loved Again</a><a href="/cart">Cart</a></header>
 <main id="MainContent"><div class="home-hero">SHOP THE NEW ARRIVALS</div></main>
 <footer id="shopify-section-footer"><p>© Loved Again</p></footer>
</body></html>`;

test("renders every cart line's title and price", () => {
 const out = buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1");
 assert.match(out, /Rick Owens Performa Jacket/);
 assert.match(out, /Chanel Flap Bag/);
 assert.match(out, /\$1,499\.00/);
 assert.match(out, /\$5,500\.00/);
});

test("shows the subtotal as the sum of the lines", () => {
 const out = buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1");
 assert.match(out, /\$6,999\.00/); // 149900 + 550000
});

// Checkout must be a real link. On VYA's own origin the serve path strips every <script> AFTER the
// cart page is built, so anything depending on a click handler arrives dead — which is why
// injectCartPage's checkout button does nothing on a Plan A cart page today.
test("checkout is a plain link, so it survives script stripping", () => {
 const $ = cheerio.load(buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1"));
 const $a = $("a[data-vya-checkout]");
 assert.equal($a.length, 1);
 assert.equal($a.attr("href"), "/checkout?cart=1");
 assert.equal($a.get(0)?.tagName, "a", "must be an anchor, not a scripted button");
});

test("checkout still works with scripts disabled entirely", () => {
 const out = buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1", { interactive: false });
 const $ = cheerio.load(out);
 assert.equal($("a[data-vya-checkout]").attr("href"), "/checkout?cart=1");
 assert.equal($("script").length, 0, "no script should be emitted when it would only be stripped");
});

// A control that cannot work is worse than no control: without script, Remove would do nothing.
test("omits the remove control when script will be stripped", () => {
 const out = buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1", { interactive: false });
 assert.ok(!out.includes("data-vya-cart-remove"), "no dead Remove buttons");
});

test("an empty cart says so and offers no way to pay for nothing", () => {
 const out = buildFallbackCartPage(CHROME, [], "/checkout?cart=1");
 assert.match(out, /empty/i);
 assert.ok(!out.includes("data-vya-checkout"), "an empty cart must not render a checkout button");
});

// The whole point of building on a captured page rather than a blank one: the shopper stays inside
// the store's own header, footer and typography instead of being dropped onto a VYA-looking page.
test("keeps the store's own chrome and stylesheet", () => {
 const out = buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1");
 assert.match(out, /shopify-section-header/);
 assert.match(out, /shopify-section-footer/);
 assert.match(out, /font-family:Didot/);
 assert.match(out, /© Loved Again/);
});

test("replaces the borrowed page's content instead of rendering the cart underneath it", () => {
 const out = buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1");
 assert.ok(!out.includes("SHOP THE NEW ARRIVALS"), "the home page's hero must not survive into the cart page");
});

// Titles come from seller-controlled inventory, and this HTML is served on the seller's own origin
// where their scripts already run — a title that became live markup would be stored XSS against
// their shoppers. Asserted by PARSING the result rather than grepping it: a title is legitimately
// allowed to appear as inert text inside an alt attribute, and a substring search can't tell the
// difference between that and an injected element.
test("a title containing markup stays inert", () => {
 const evil = [{ ...LINES[0], title: `<img src=x onerror="alert(1)">` }];
 const out = buildFallbackCartPage(CHROME, evil, "/checkout?cart=1");
 const $ = cheerio.load(out);
 const imgs = $("[data-vya-fallback-cart] img").toArray();
 assert.equal(imgs.length, 1, "only the product's own image may exist — the title must not spawn one");
 assert.equal($(imgs[0]).attr("src"), "https://x/1.jpg");
 assert.ok(!$(imgs[0]).attr("onerror"), "no event handler may survive from the title");
 // …and it still reads correctly to a shopper.
 assert.equal($("[data-vya-fallback-cart] a[href='/products/rick']").last().text().trim(), `<img src=x onerror="alert(1)">`);
});

test("each line offers a remove control the cart script can act on", () => {
 const out = buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1");
 assert.match(out, /data-vya-cart-remove="a1"/);
 assert.match(out, /data-vya-cart-remove="b2"/);
});

test("links each line back to its product page", () => {
 const out = buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1");
 assert.match(out, /href="\/products\/rick"/);
});

// captureCartTemplate already failed for these stores; the fallback must not assume anything about
// what the borrowed page contains, or it just moves the 404 somewhere else.
test("still produces a usable page when the capture has no main container", () => {
 const bare = `<!doctype html><html><head><style>body{font-family:Didot}</style></head><body><div>hi</div></body></html>`;
 const out = buildFallbackCartPage(bare, LINES, "/checkout?cart=1");
 assert.match(out, /Rick Owens Performa Jacket/);
 assert.match(out, /data-vya-checkout/);
 assert.match(out, /font-family:Didot/, "the store's typography should survive even without a main container");
});

test("survives an empty or junk capture rather than throwing", () => {
 for (const junk of ["", "not html at all", "<html>"]) {
  const out = buildFallbackCartPage(junk, LINES, "/checkout?cart=1");
  assert.match(out, /Rick Owens Performa Jacket/, `should still render the cart for input ${JSON.stringify(junk)}`);
 }
});

test("does not duplicate the page's stylesheet per line", () => {
 const out = buildFallbackCartPage(CHROME, LINES, "/checkout?cart=1");
 assert.equal(out.split("data-vya-src").length - 1, 1, "the captured <style> must appear exactly once");
});

test("prices in the line's own currency", () => {
 const gbp = [{ ...LINES[0], currency: "GBP" }];
 const out = buildFallbackCartPage(CHROME, gbp, "/checkout?cart=1");
 assert.match(out, /£1,499\.00/);
});
