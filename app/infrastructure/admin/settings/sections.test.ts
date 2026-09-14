import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionFor, groupFor, groupSlug, SETTINGS_GROUPS } from "./sections.ts";

test("a path finds its settings section, longest match first", () => {
 assert.equal(sectionFor("/admin/settings/shipping")?.label, "Shipping & duties");
 assert.equal(sectionFor("/admin/settings"), null);
});

test("a settings page knows which group it lives in", () => {
 assert.equal(groupFor("/admin/settings/shipping")?.label, "Selling");
 assert.equal(groupFor("/admin/settings/payments")?.label, "Store");
 assert.equal(groupFor("/admin/settings/domain")?.label, "Channels");
 // The index itself belongs to no one group — it shows them all.
 assert.equal(groupFor("/admin/settings"), null);
 assert.equal(groupFor("/admin/inventory"), null);
});

test("group anchors are url-safe, and every group has one", () => {
 assert.equal(groupSlug("Store"), "store");
 assert.equal(groupSlug("Apps & integrations"), "apps-integrations");
 for (const g of SETTINGS_GROUPS) assert.match(groupSlug(g.label), /^[a-z0-9-]+$/);
});
