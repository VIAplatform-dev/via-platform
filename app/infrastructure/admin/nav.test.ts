import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, MARKET_GROUPS, MARKET_TABS, visibleNavGroups, type NavGroup } from "./nav.ts";
import { SETTINGS_SECTIONS } from "./settings/sections.ts";

// The sidebar as data. What a seller sees in her left rail is a product decision, and a product
// decision should be testable without rendering a tree: one Payments, one Analytics, no dead
// duplicates, and the words a seller would use ("Add a piece", "Abandoned carts").

const labels = (groups: NavGroup[]) => groups.flatMap((g) => g.items.flatMap((n) => [n.label, ...(n.children ?? []).map((c) => c.label)]));
const hrefs = (groups: NavGroup[]) => groups.flatMap((g) => g.items.flatMap((n) => [n.href, ...(n.children ?? []).map((c) => c.href)]));
const find = (groups: NavGroup[], label: string) => groups.flatMap((g) => g.items).find((n) => n.label === label);
const group = (groups: NavGroup[], label: string) => groups.find((g) => g.label === label);

test("Payments and Analytics each appear exactly once in the workspace nav", () => {
 const all = labels(GROUPS);
 assert.equal(all.filter((l) => l === "Payments").length, 1);
 assert.equal(all.filter((l) => l === "Analytics").length, 1);
});

test("Market Mode's Payments is the same Payments as Settings, not a second one", () => {
 // One place to look, whichever mode she is in.
 const market = labels(MARKET_GROUPS);
 assert.equal(market.filter((l) => l === "Payments").length, 1);
 assert.equal(market.filter((l) => l === "Analytics").length, 0);
 const marketPay = MARKET_GROUPS.flatMap((g) => g.items).find((n) => n.label === "Payments");
 const settingsPay = GROUPS.flatMap((g) => g.items).flatMap((n) => n.children ?? []).find((c) => c.label === "Payments");
 assert.ok(marketPay && settingsPay);
 assert.equal(marketPay.href, settingsPay.href);
 assert.equal(marketPay.href, "/admin/settings/payments");
});

test("Storefront's children say Site versions, never Drafts (Drafts are listings)", () => {
 const sf = find(GROUPS, "Storefront");
 assert.ok(sf?.children);
 const kids = sf.children.map((c) => c.label);
 assert.ok(kids.includes("Site versions"));
 assert.ok(!kids.includes("Drafts"));
});

test("Add a piece is a top-level row in Sell, not buried under Inventory", () => {
 const sell = group(GROUPS, "Sell");
 assert.ok(sell);
 assert.equal(sell.items[0].label, "Add a piece");
 assert.equal(sell.items[0].href, "/admin/add-listing");
 const inv = find(GROUPS, "Inventory");
 assert.ok(!(inv?.children ?? []).some((c) => c.href === "/admin/add-listing" || /add/i.test(c.label)));
});

test("the words a seller would use: Import your site, Abandoned carts", () => {
 const all = labels(GROUPS);
 assert.ok(all.includes("Import your site"));
 assert.ok(all.includes("Abandoned carts"));
 assert.ok(!all.includes("Bring your site"));
 assert.ok(!all.includes("Cart recovery"));
});

test("a seller never sees VYA's own instruments or the one-time import", () => {
 const seller = visibleNavGroups({ isOwner: false, rentalsOn: false, apptsOn: false, inboxOff: false });
 assert.equal(group(seller, "Platform"), undefined);
 assert.ok(!hrefs(seller).includes("/admin/import"));
 const owner = visibleNavGroups({ isOwner: true, rentalsOn: false, apptsOn: false, inboxOff: false });
 assert.ok(group(owner, "Platform"));
 assert.ok(hrefs(owner).includes("/admin/import"));
});

test("rentals, appointments and the inbox follow their switches", () => {
 const off = visibleNavGroups({ isOwner: false, rentalsOn: false, apptsOn: false, inboxOff: true });
 assert.ok(!hrefs(off).includes("/admin/rentals"));
 assert.ok(!hrefs(off).includes("/admin/appointments"));
 assert.ok(!hrefs(off).includes("/admin/inbox"));
 const on = visibleNavGroups({ isOwner: false, rentalsOn: true, apptsOn: true, inboxOff: false });
 assert.ok(hrefs(on).includes("/admin/rentals"));
 assert.ok(hrefs(on).includes("/admin/appointments"));
 assert.ok(hrefs(on).includes("/admin/inbox"));
 // Not-yet-known (null) reads as off, the same as the layout has always treated it.
 const unknown = visibleNavGroups({ isOwner: false, rentalsOn: null, apptsOn: null, inboxOff: false });
 assert.ok(!hrefs(unknown).includes("/admin/rentals"));
});

test("Settings' children are exactly the seller-visible settings sections, in order", () => {
 const settings = find(GROUPS, "Settings");
 assert.ok(settings?.children);
 assert.deepEqual(
  settings.children.map((c) => ({ href: c.href, label: c.label })),
  SETTINGS_SECTIONS.filter((s) => !s.vyaOnly).map((s) => ({ href: s.href, label: s.label })),
 );
 // Apps & integrations is a setting, not a section of the shop — no group of its own.
 assert.equal(group(GROUPS, "Apps"), undefined);
 assert.ok(settings.children.some((c) => c.href === "/admin/apps" && c.label === "Apps & integrations"));
});

test("the nav is data: icons are names, so Node can load it without React", () => {
 for (const n of [...GROUPS, ...MARKET_GROUPS].flatMap((g) => g.items)) assert.equal(typeof n.icon, "string");
 for (const t of MARKET_TABS) assert.equal(typeof t.icon, "string");
});
