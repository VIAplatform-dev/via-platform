import { test } from "node:test";
import assert from "node:assert/strict";
import { describeHostedStore, pageLabel } from "./hosted-store-entry.ts";

test("no capture and no import: say so plainly, and offer no edit button", () => {
 const v = describeHostedStore({ captured: 0, url: null, slug: "tous-vintage", pages: [], job: null });
 assert.equal(v.state, "none");
 assert.equal(v.canEdit, false);
 assert.deepEqual(v.pages, []);
 assert.equal(v.viewUrl, null);
 assert.match(v.headline, /haven’t brought your site over|no hosted store/i);
});

test("a failed import is still 'no hosted store' — never an edit button on nothing", () => {
 const v = describeHostedStore({ captured: 0, url: null, slug: "s", pages: [], job: { status: "failed", counts: { pages: 0 } } });
 assert.equal(v.state, "none");
 assert.equal(v.canEdit, false);
});

test("an import still running says so and does not offer the editor yet", () => {
 for (const status of ["running", "paused", "stalled"] as const) {
  const v = describeHostedStore({ captured: 0, url: null, slug: "s", pages: [], job: { status, counts: { pages: 12 } } });
  assert.equal(v.state, "importing", status);
  assert.equal(v.canEdit, false, status);
  assert.match(v.detail, /12 pages/);
 }
});

test("a captured store is editable, page by page, on a same-origin edit URL", () => {
 const v = describeHostedStore({
  captured: 3, url: "https://tousvintage.com", slug: "tous-vintage",
  pages: ["/", "/collections/all", "/pages/about-us"], job: { status: "done", counts: { pages: 3 } },
 });
 assert.equal(v.state, "ready");
 assert.equal(v.canEdit, true);
 assert.equal(v.viewUrl, "https://tousvintage.com");
 assert.deepEqual(v.pages.map((p) => p.editHref), [
  "/site/tous-vintage/?edit=1",
  "/site/tous-vintage/collections/all?edit=1",
  "/site/tous-vintage/pages/about-us?edit=1",
 ]);
 assert.deepEqual(v.pages.map((p) => p.label), ["Home page", "All pieces", "About Us"]);
});

test("product pages are NOT offered for editing — they render live inventory, not frozen HTML", () => {
 const v = describeHostedStore({
  captured: 4, url: "https://x.com", slug: "s",
  pages: ["/", "/products/a-dress", "/products/b-bag", "/cart"], job: null,
 });
 assert.deepEqual(v.pages.map((p) => p.path), ["/"]);
 assert.equal(v.productPages, 2);
});

test("a store of nothing but product pages has nothing to edit here", () => {
 const v = describeHostedStore({ captured: 2, url: "https://x.com", slug: "s", pages: ["/products/a", "/products/b"], job: null });
 assert.equal(v.canEdit, false);
 assert.equal(v.state, "none");
 assert.equal(v.productPages, 2);
});

test("pages still arrive while an import is running — those are editable already", () => {
 const v = describeHostedStore({ captured: 5, url: "/site/s", slug: "s", pages: ["/"], job: { status: "running", counts: { pages: 5 } } });
 assert.equal(v.state, "importing");
 assert.equal(v.canEdit, true);
 assert.equal(v.pages.length, 1);
});

test("an unknown slug cannot produce an edit link", () => {
 const v = describeHostedStore({ captured: 2, url: "https://x.com", slug: null, pages: ["/"], job: null });
 assert.equal(v.canEdit, false);
 assert.deepEqual(v.pages, []);
});

test("no status at all (the fetch failed) is not 'ready'", () => {
 const v = describeHostedStore(null);
 assert.equal(v.state, "none");
 assert.equal(v.canEdit, false);
});

const READY = { captured: 2, url: "https://x.com", slug: "s", pages: ["/", "/pages/about-us"], job: null };

test("a capture she has not reviewed yet is shown, but not editable — and says it is a step", () => {
 const v = describeHostedStore(READY, { screens: ["/", "/pages/about-us"], answered: [] });
 assert.equal(v.state, "review-first");
 assert.equal(v.canEdit, false);
 assert.equal(v.viewUrl, "https://x.com"); // she can still LOOK at her hosted store
 assert.equal(v.pages.length, 2); // and see which pages exist
 assert.match(v.detail, /2 pages/);
 assert.doesNotMatch(v.detail + v.headline, /error|problem|wrong|can’t|cannot/i);
});

test("half-reviewed still counts the pages left", () => {
 const v = describeHostedStore(READY, { screens: ["/", "/pages/about-us"], answered: ["/"] });
 assert.equal(v.state, "review-first");
 assert.match(v.detail, /1 page/);
});

test("once every side-by-side is answered the editor opens", () => {
 const v = describeHostedStore(READY, { screens: ["/", "/pages/about-us"], answered: ["/", "/pages/about-us"] });
 assert.equal(v.state, "ready");
 assert.equal(v.canEdit, true);
});

test("a store that has never been checked is editable, and says so rather than implying a pass", () => {
 const v = describeHostedStore(READY, null);
 assert.equal(v.state, "ready");
 assert.equal(v.canEdit, true);
 assert.match(v.detail, /haven’t checked|not checked/i);
});

test("no review state passed at all defaults to the ungated view (server still enforces)", () => {
 assert.equal(describeHostedStore(READY).canEdit, true);
});

test("page labels read as pages, not as URLs", () => {
 assert.equal(pageLabel("/"), "Home page");
 assert.equal(pageLabel("/collections/all"), "All pieces");
 assert.equal(pageLabel("/collections/dresses"), "Dresses");
 assert.equal(pageLabel("/products/silk-slip-dress"), "Silk Slip Dress");
 assert.equal(pageLabel("/pages/shipping-returns"), "Shipping Returns");
 assert.equal(pageLabel("/cart"), "Cart");
});
