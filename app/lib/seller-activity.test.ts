import { test } from "node:test";
import assert from "node:assert/strict";
import { describeActivity, screenName, collapse, ago, isNavigation } from "./seller-activity.ts";

test("a path becomes the screen name a seller would use", () => {
 assert.equal(screenName("/admin/inventory"), "Inventory");
 assert.equal(screenName("/admin/marketing/campaigns/compose?template=x"), "the email editor");
 assert.equal(screenName("/admin/onboarding"), "the setup wizard");
 assert.equal(screenName("/admin/customers/recovery"), "Cart recovery");
 // More specific first: /inventory/collections must not be claimed by /inventory.
 assert.equal(screenName("/admin/inventory/collections"), "Collections");
});

test("each line reads like a sentence, not an event name", () => {
 assert.equal(describeActivity({ kind: "viewed", detail: "/admin/orders" }), "Opened Orders");
 assert.equal(describeActivity({ kind: "published", detail: "1990s silk slip dress" }), "Published — 1990s silk slip dress");
 assert.equal(describeActivity({ kind: "store-claimed", detail: null }), "Opened the store we'd built for her");
});

test("a run of the same screen collapses, keeping the count", () => {
 // Eleven identical rows push the thing she actually DID off the screen.
 const at = "2026-09-06T10:00:00Z";
 const rows = collapse([
  { storeSlug: "s", email: null, kind: "viewed", detail: "/admin/inventory", at },
  { storeSlug: "s", email: null, kind: "viewed", detail: "/admin/inventory?x=1", at },
  { storeSlug: "s", email: null, kind: "viewed", detail: "/admin/inventory", at },
  { storeSlug: "s", email: null, kind: "published", detail: "A dress", at },
 ]);
 assert.equal(rows.length, 2);
 assert.equal(rows[0].times, 3);
 assert.equal(rows[1].times, 1);
});

test("actions are never collapsed into each other", () => {
 // Two pieces published is two events, however fast they came.
 const at = "2026-09-06T10:00:00Z";
 const rows = collapse([
  { storeSlug: "s", email: null, kind: "published", detail: "A", at },
  { storeSlug: "s", email: null, kind: "published", detail: "B", at },
 ]);
 assert.equal(rows.length, 2);
 assert.equal(isNavigation("published"), false);
});

test("times read as recency", () => {
 const now = Date.parse("2026-09-06T12:00:00Z");
 assert.equal(ago("2026-09-06T11:59:50Z", now), "just now");
 assert.equal(ago("2026-09-06T11:40:00Z", now), "20 minutes ago");
 assert.equal(ago("2026-09-06T09:00:00Z", now), "3 hours ago");
 assert.equal(ago("2026-09-05T12:00:00Z", now), "yesterday");
 assert.equal(ago("nonsense", now), "");
});
