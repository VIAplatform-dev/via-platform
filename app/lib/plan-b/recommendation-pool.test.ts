import { test } from "node:test";
import assert from "node:assert/strict";
import { refererProductHandle, pickRecommendationPool, recommendationCardsHtml, injectRecommendationAddHandler } from "./recommendation-pool.ts";

test("refererProductHandle reads the handle out of a real product-page URL", () => {
 assert.equal(refererProductHandle("http://store.vyasites.test:3333/products/attrak-dark-denim-shorts"), "attrak-dark-denim-shorts");
 assert.equal(refererProductHandle("http://store.vyasites.test:3333/products/x?variant=1"), "x");
});

test("refererProductHandle returns null for anything that isn't a product page", () => {
 assert.equal(refererProductHandle("http://store.vyasites.test:3333/"), null);
 assert.equal(refererProductHandle(null), null);
 assert.equal(refererProductHandle(undefined), null);
 assert.equal(refererProductHandle("not a url"), null);
});

const ITEMS = [
 { id: "1", sourceId: "attrak-dark-denim-shorts", category: "shorts" },
 { id: "2", sourceId: "gap-striped-shorts", category: "shorts" },
 { id: "3", sourceId: "football-italian-charm", category: "charms" },
 { id: "4", sourceId: "chili-pepper-italian-charm", category: "charms" },
];

test("scopes recommendations to the anchor's own category — a shorts page recommends other shorts, not charms", () => {
 const pool = pickRecommendationPool(ITEMS, "http://x/products/attrak-dark-denim-shorts");
 assert.deepEqual(pool.map((i) => i.id), ["2"]);
});

test("the anchor itself is never included in its own recommendations", () => {
 const pool = pickRecommendationPool(ITEMS, "http://x/products/attrak-dark-denim-shorts");
 assert.ok(!pool.some((i) => i.id === "1"));
});

test("falls back to everything-but-the-anchor when nothing else shares its category", () => {
 const lonely = [...ITEMS, { id: "5", sourceId: "one-of-a-kind", category: "unique" }];
 const pool = pickRecommendationPool(lonely, "http://x/products/one-of-a-kind");
 assert.deepEqual(pool.map((i) => i.id).sort(), ["1", "2", "3", "4"]);
});

test("falls back to the full list — not empty — when there's no referer at all", () => {
 const pool = pickRecommendationPool(ITEMS, null);
 assert.equal(pool.length, ITEMS.length);
});

test("falls back to the full list when the referer's product isn't one of ours", () => {
 const pool = pickRecommendationPool(ITEMS, "http://x/products/not-a-real-item");
 assert.equal(pool.length, ITEMS.length);
});

test("falls back to the full list when the anchor has no category set", () => {
 const noCategory = [{ id: "1", sourceId: "mystery-item", category: null }, { id: "2", sourceId: "other", category: "shorts" }];
 const pool = pickRecommendationPool(noCategory, "http://x/products/mystery-item");
 assert.deepEqual(pool.map((i) => i.id), ["2"]);
});

test("recommendationCardsHtml gives every card a real, working add-to-cart form — the reference site's cards all have one, ours had none", () => {
 const out = recommendationCardsHtml(
  [{ id: "1", title: "Green Pink Flower Silk Top", priceCents: 5400, currency: "USD", image: "https://x/a.jpg", sourceId: "green-pink-flower-silk-top" }],
  (it) => `/products/${it.sourceId}`,
 );
 assert.match(out, /<form method="post" action="\/cart\/add" data-vya-rec-add/);
 assert.match(out, /name="id" value="green-pink-flower-silk-top"/);
 assert.match(out, />Add to cart</);
});

test("recommendationCardsHtml's forms are marked for the page's interceptor, and carry no script of their own", () => {
 // A native submit would navigate the whole page to the bridge's raw JSON response instead of
 // staying put, even though the item really did get added — so the form must be marked. The handler
 // that honours the mark canNOT ship in here: this fragment is assigned with innerHTML, and a
 // <script> inserted that way never executes. It is injected into the page instead.
 const out = recommendationCardsHtml(
  [{ id: "1", title: "X", priceCents: 100, currency: "USD", image: null, sourceId: "x" }],
  (it) => `/products/${it.sourceId}`,
 );
 assert.match(out, /data-vya-rec-add/);
 assert.ok(!out.includes("<script"), "a script here would be dead markup");
});

test("the injected interceptor posts to the cart bridge, and attaches only once per page", () => {
 const page = injectRecommendationAddHandler("<html><body><p>hi</p></body></html>");
 assert.match(page, /e\.preventDefault\(\)/);
 assert.match(page, /fetch\("\/cart\/add\.js"/);
 assert.match(page, /window\.__vyaRecAddInit/, "must guard against re-attaching");
 assert.ok(page.indexOf("<script") < page.indexOf("</body>"), "inside the document, where it will run");
 assert.equal(injectRecommendationAddHandler(page), page, "injecting twice changes nothing");
});

test("recommendationCardsHtml shows a disabled 'Sold out' control instead of a working add-to-cart form for an unavailable item", () => {
 const out = recommendationCardsHtml(
  [{ id: "1", title: "X", priceCents: 100, currency: "USD", image: null, sourceId: "x", available: false }],
  (it) => `/products/${it.sourceId}`,
 );
 assert.doesNotMatch(out, /<form/);
 assert.match(out, /disabled/);
 assert.match(out, />Sold out</);
});

test("recommendationCardsHtml falls back to the VYA item id when there's no source handle", () => {
 const out = recommendationCardsHtml(
  [{ id: "vya-uuid-1", title: "X", priceCents: 100, currency: "USD", image: null, sourceId: null }],
  () => "/products/vya-uuid-1",
 );
 assert.match(out, /name="id" value="vya-uuid-1"/);
});
