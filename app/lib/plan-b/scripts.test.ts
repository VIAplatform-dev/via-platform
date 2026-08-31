import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyScript, shouldKeepScript, rewriteInlineJsUrls, ownOrigins, detectMyshopifyDomain, stripShopifyCommerceUrls } from "./scripts.ts";

const ORIGIN = "https://blummier.com";

test("the store's own theme code is kept — that's the point of Plan B", () => {
 assert.equal(classifyScript("/assets/theme.js", ORIGIN), "keep");
 assert.equal(classifyScript("https://blummier.com/assets/global.js", ORIGIN), "keep");
 assert.equal(classifyScript("https://www.blummier.com/assets/global.js", ORIGIN), "keep");
 assert.equal(classifyScript("https://cdn.shopify.com/s/files/1/theme.js", ORIGIN), "keep");
});

test("outside vendors are stripped even though the origin is isolated", () => {
 // They'd execute on a domain WE operate, under our certificate, sending the seller's shoppers to
 // third parties we never chose.
 for (const src of [
  "https://www.googletagmanager.com/gtm.js?id=X",
  "https://static.klaviyo.com/onsite/js/klaviyo.js",
  "https://connect.facebook.net/en_US/fbevents.js",
  "https://static.hotjar.com/c/hotjar.js",
  "https://widget.gorgias.chat/loader.js",
 ]) {
  assert.equal(classifyScript(src, ORIGIN), "vendor", src);
  assert.equal(shouldKeepScript(src, ORIGIN), false, src);
 }
});

test("Shopify's checkout is stripped on every plan — it takes the order away", () => {
 for (const src of [
  "https://shop.app/checkout-button.js",
  "https://cdn.shopify.com/shopifycloud/shop-js/modules/v2/client.shop-login.js",
  "https://cdn.shopify.com/shopifycloud/portable-wallets/latest/portable-wallets.js",
 ]) {
  assert.equal(classifyScript(src, ORIGIN), "checkout", src);
 }
});

test("the checkout preload bootstrap is stripped even though it's same-origin", () => {
 // /checkouts/internal/preloads.js ships on EVERY Shopify theme, served from the SELLER's own
 // domain — so the sameSite "keep" check would otherwise wave it through (no host-level signal
 // distinguishes it from the theme's own code). Kept, it initializes Shopify's checkout SPA and
 // starts lazy-loading its component chunks (hydrate.js, PaymentButtons.js,
 // ShippingMethodSelector.js, BillingAddressForm.js…) against OUR origin instead of Shopify's real
 // checkout host — every one 404s, and it's checkout machinery running where it never should.
 assert.equal(classifyScript("https://blummier.com/checkouts/internal/preloads.js?locale=en-US", ORIGIN), "checkout");
 assert.equal(shouldKeepScript("https://blummier.com/checkouts/internal/preloads.js?locale=en-US", ORIGIN), false);
});

test("an unrecognised third-party host is dropped, not trusted", () => {
 // Allowlist, not denylist: a denylist silently starts running whatever vendor a seller installs next.
 assert.equal(classifyScript("https://some-new-app.io/widget.js", ORIGIN), "unknown-host");
 assert.equal(classifyScript("//some-new-app.io/widget.js", ORIGIN), "unknown-host", "protocol-relative counts too");
});

test("a relative src is the store's own file, so it is kept", () => {
 // It resolves against the page's own origin — there is no third party involved.
 assert.equal(classifyScript("assets/theme.js", ORIGIN), "keep");
 assert.equal(classifyScript("./bundle.js?v=9", ORIGIN), "keep");
});

// ── The escape hatch that would send carts back to Shopify ──────────────────────────────────────

test("hardcoded absolute store URLs in inline JS are brought home", () => {
 const js = `var routes={cart_add_url:"https://blummier.com/cart/add",cart_url:"https://blummier.com/cart"};`;
 const out = rewriteInlineJsUrls(js, ["https://blummier.com"]);
 assert.match(out, /cart_add_url:"\/cart\/add"/);
 assert.match(out, /cart_url:"\/cart"/);
 assert.ok(!out.includes("https://blummier.com"), "no absolute self-reference survives");
});

test("the .myshopify.com address is rewritten too — apps hardcode it", () => {
 const js = `fetch("https://blummier-shop.myshopify.com/cart/add.js")`;
 const out = rewriteInlineJsUrls(js, ownOrigins("https://blummier.com", "blummier-shop.myshopify.com"));
 assert.equal(out, `fetch("/cart/add.js")`);
});

test("escaped slashes inside embedded JSON are handled", () => {
 const js = `var cfg={"url":"https:\\/\\/blummier.com\\/cart\\/add"};`;
 const out = rewriteInlineJsUrls(js, ["https://blummier.com"]);
 assert.ok(!/blummier\.com/.test(out), `still absolute: ${out}`);
});

test("www is normalised away when rewriting", () => {
 const out = rewriteInlineJsUrls(`x("https://www.blummier.com/search/suggest")`, ["https://blummier.com"]);
 assert.equal(out, `x("/search/suggest")`);
});

test("a protocol-relative self-URL is brought home too — for a real ROUTE", () => {
 // Themes sometimes write a hardcoded ROUTE as protocol-relative ("//store.com/cart/add.js"), not
 // just https://. Only `https?://` was originally required, so a bare `//` never matched, and the
 // request resolved against the seller's real domain instead of the VYA-hosted one it's supposed to
 // bridge to.
 const js = `fetch("//blummier.com/cart/add.js")`;
 const out = rewriteInlineJsUrls(js, ["https://blummier.com"]);
 assert.equal(out, `fetch("/cart/add.js")`);
});

test("a /cdn/ static-asset reference is NEVER brought home, protocol-relative or not", () => {
 // /cdn/ is Shopify's universal static-asset prefix (theme JS/CSS/fonts/images) on every store,
 // regardless of theme — we never mirror these files ourselves, so rewriting them to relative
 // doesn't land on a working copy, it 404s on our own origin. For a stray analytics script that's a
 // wash; for the theme's OWN import map — every "@theme/x" entry is exactly this shape
 // ("//store.com/cdn/shop/t/1/assets/component.js") — it's catastrophic: rewritten to relative,
 // every module 404s and the theme's entire component framework never initializes (this is exactly
 // how a real regression shipped: product galleries, variant pickers, cart drawer, all of it dead).
 const protoRelative = `var s=document.createElement('script');s.src="//blummier.com/cdn/shopifycloud/storefront/assets/shop_events_listener-4e26a9ce.js";document.head.appendChild(s);`;
 assert.equal(rewriteInlineJsUrls(protoRelative, ["https://blummier.com"]), protoRelative, "left exactly as-is");

 const importMapEntry = `{"imports":{"@theme/component":"//blummier.com/cdn/shop/t/1/assets/component.js?v=123"}}`;
 assert.equal(rewriteInlineJsUrls(importMapEntry, ["https://blummier.com"]), importMapEntry, "import map untouched");

 const absoluteCdn = `img.src="https://blummier.com/cdn/shop/files/hero.jpg"`;
 assert.equal(rewriteInlineJsUrls(absoluteCdn, ["https://blummier.com"]), absoluteCdn, "absolute form too, not just protocol-relative");
});

test("genuinely external URLs are left alone", () => {
 const js = `track("https://instagram.com/blummier"); img("https://cdn.shopify.com/x.jpg");`;
 assert.equal(rewriteInlineJsUrls(js, ["https://blummier.com"]), js);
});

test("the .myshopify.com address is read off the page, not required from the caller", () => {
 // Requiring it meant it was never supplied, and every hardcoded Shopify cart URL survived capture.
 const html = `<script>var Shopify = Shopify || {}; Shopify.shop = "stmi2y-ea.myshopify.com";</script>`;
 assert.equal(detectMyshopifyDomain(html), "stmi2y-ea.myshopify.com");
 assert.equal(detectMyshopifyDomain("<html>no shopify here</html>"), null);
});

test("absolute Shopify commerce URLs are neutralised wherever they survive", () => {
 // These belong to Shopify, not the seller's origin, so origin-based rewriting can't reach them —
 // and every one is a route out of VYA's checkout.
 const html = `<a href="https://stmi2y-ea.myshopify.com/cart/add">x</a>
  <script>var u="https:\\/\\/stmi2y-ea.myshopify.com\\/checkout";var p="https://shop.app/pay";</script>`;
 const out = stripShopifyCommerceUrls(html);
 assert.ok(!/myshopify\.com\\?\/(cart|checkout)/.test(out), `cart/checkout still absolute: ${out}`);
 assert.ok(!/shop\.app/.test(out), `Shop Pay survived: ${out}`);
});

test("a myshopify URL that is NOT commerce is left alone", () => {
 // Only the endpoints that take an order away are rewritten; a CDN or asset reference is harmless.
 const html = `<img src="https://stmi2y-ea.myshopify.com/files/logo.png">`;
 assert.equal(stripShopifyCommerceUrls(html), html);
});

test("a theme's libraries on a package CDN are its OWN code, and are kept", () => {
 // Stripping these was a real visible bug: without Swiper the theme's category row collapsed into
 // cramped touching circles, and without the lazy-loader hero videos stayed blank. Neither shows up
 // in a unit test or the harness — only in a browser.
 for (const src of [
  "https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js",
  "https://cdn.jsdelivr.net/npm/vanilla-lazyload@19.1.3/dist/lazyload.min.js",
  "https://unpkg.com/alpinejs@3/dist/cdn.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js",
  "https://code.jquery.com/jquery-3.7.1.min.js",
 ]) {
  assert.equal(classifyScript(src, ORIGIN), "keep", src);
 }
});

test("a tracker served FROM a package CDN is still dropped", () => {
 // Vendor patterns are checked before the library allowlist, so the CDN isn't a way in.
 assert.equal(classifyScript("https://cdn.jsdelivr.net/npm/@segment/analytics.js", ORIGIN), "vendor");
 assert.equal(classifyScript("https://unpkg.com/klaviyo-tracking/dist/k.js", ORIGIN), "vendor");
});
