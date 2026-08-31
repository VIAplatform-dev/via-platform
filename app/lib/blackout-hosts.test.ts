import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksAtCancellation } from "./blackout-hosts.ts";

const block = (url: string) => blocksAtCancellation(url, "blummier.com", "blummier.vyasites.test");

test("Shopify's own hosts are blocked", () => {
 for (const u of [
  "https://cdn.shopify.com/s/files/1/a.jpg",
  "https://blummier.myshopify.com/cart.js",
  "https://monorail-edge.shopifysvc.com/v1/produce",
  "https://checkout.shopify.com/x",
  "https://shop.app/pay",
 ]) assert.equal(block(u), true, u);
});

test("the seller's own domain is blocked — it is Shopify's too", () => {
 // blummier.com is her Shopify custom domain and stops serving the day she cancels. Fifteen of
 // twenty-three stores had assets passing the gate on their own domain that would die for real.
 assert.equal(block("https://blummier.com/cdn/shop/t/1/assets/theme.js"), true);
 assert.equal(block("https://www.blummier.com/cdn/shop/files/logo.png"), true);
});

test("a third party is NOT blocked because its path happens to contain /cdn/", () => {
 // THE BUG. `instafeed.nfcube.com/cdn/instafeed-17.7.0.css` is the Instagram widget app — nothing
 // to do with Shopify — and killing it accounted for 115 of the 213 "lost images" and 6 of the 7
 // "lost videos" across four stores. Their storefronts were fine the whole time.
 assert.equal(block("https://instafeed.nfcube.com/cdn/instafeed-17.7.0.css"), false);
 assert.equal(block("https://cdn.nfcube.com/instafeed-d699680a.js"), false);
});

test("a third party is NOT blocked because its query string names a myshopify domain", () => {
 // The same widget, loaded as `cdn.nfcube.com/instafeed.js?shop=awokevintage.myshopify.com`. The
 // host is nfcube. Matching the whole URL string blocked it on three more stores.
 assert.equal(block("https://cdn.nfcube.com/instafeed.js?shop=awokevintage.myshopify.com"), false);
 assert.equal(block("https://api.nfcube.com/feed/v6?account=k1r5qu-m6.myshopify.com&limit=10"), false);
});

test("Instagram's own image host is not Shopify either", () => {
 assert.equal(block("https://scontent.cdninstagram.com/v/t51/reel.mp4"), false);
});

test("our own hosted store is never blocked", () => {
 // Blocking ourselves would make every page fail and the whole check meaningless.
 assert.equal(block("http://blummier.vyasites.test:3000/cdn/theme.js"), false);
 assert.equal(block("http://blummier.vyasites.test:3000/collections/all"), false);
});

test("a subdomain of a Shopify host counts, a lookalike does not", () => {
 assert.equal(block("https://x.cdn.shopify.com/a.jpg"), true);
 assert.equal(block("https://notshopify.com/a.jpg"), false);
 assert.equal(block("https://cdn.shopify.com.evil.example/a.jpg"), false, "suffix match, not substring");
});

test("rubbish is never blocked, and never throws", () => {
 for (const u of ["", "not a url", "data:image/png;base64,AAA", "blob:http://x/y"]) {
  assert.equal(blocksAtCancellation(u, "blummier.com", "blummier.vyasites.test"), false, u);
 }
});

test("with no known seller domain, only Shopify's own hosts are blocked", () => {
 assert.equal(blocksAtCancellation("https://cdn.shopify.com/a.jpg", null, "x.vyasites.test"), true);
 assert.equal(blocksAtCancellation("https://someshop.com/a.jpg", null, "x.vyasites.test"), false);
});
